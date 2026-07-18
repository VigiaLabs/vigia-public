"""
VIGIASearch Engine — FastAPI SSE service
Full port of the TypeScript LangGraph pipeline:
  Router → Planner → Parallel Ingest → Guardrail (CRAG) → Stream

Tokens stream as they arrive from Bedrock — no buffering.
"""

import asyncio
import json
import os
import re
import uuid
from contextlib import asynccontextmanager
from typing import AsyncGenerator, Optional

import boto3
import psycopg2
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

# ── Bedrock client ───────────────────────────────────────────────────────────
_bedrock = None

def get_bedrock():
    global _bedrock
    if _bedrock is None:
        _bedrock = boto3.client("bedrock-runtime", region_name=os.environ.get("AWS_REGION", "us-east-1"))
    return _bedrock


# ── Models ───────────────────────────────────────────────────────────────────
class GpsCoords(BaseModel):
    lat: float
    lng: float

class HistoryMessage(BaseModel):
    role: str
    content: str

class SearchRequest(BaseModel):
    query: str
    thread_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    message_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    history: list[HistoryMessage] = []
    gps: Optional[GpsCoords] = None
    image_url: Optional[str] = None
    response_language: Optional[str] = None
    response_style: Optional[str] = None


# ── SSE helpers ───────────────────────────────────────────────────────────────
def sse(p: dict) -> str: return f"data: {json.dumps(p, ensure_ascii=False)}\n\n"
def sse_step(s: str) -> str: return sse({"type": "step", "step": s})
def sse_delta(d: str) -> str: return sse({"type": "text-delta", "delta": d})
def sse_metadata(p: dict) -> str: return sse({"type": "metadata", "payload": p})
def sse_done() -> str: return sse({"type": "done"})
def sse_error(m: str) -> str: return sse({"type": "error", "message": m})


# ── Bedrock helpers ───────────────────────────────────────────────────────────
async def _invoke_nova(prompt: str, model: str = "amazon.nova-lite-v1:0") -> str:
    client = get_bedrock()
    body = json.dumps({
        "messages": [{"role": "user", "content": [{"text": prompt}]}],
        "inferenceConfig": {"maxTokens": 2048, "temperature": 0.1},
    })
    loop = asyncio.get_event_loop()
    resp = await loop.run_in_executor(None, lambda: client.invoke_model(
        modelId=model, body=body, contentType="application/json", accept="application/json"
    ))
    result = json.loads(resp["body"].read())
    return result["output"]["message"]["content"][0]["text"]


async def _stream_nova(system: str, messages: list[dict], model: str = "amazon.nova-lite-v1:0") -> AsyncGenerator[str, None]:
    """Stream tokens — yields each text delta as it arrives."""
    client = get_bedrock()
    body = json.dumps({
        "system": [{"text": system}],
        "messages": messages,
        "inferenceConfig": {"maxTokens": 4096, "temperature": 0.3},
    })
    loop = asyncio.get_event_loop()
    response = await loop.run_in_executor(None, lambda: client.invoke_model_with_response_stream(
        modelId=model, body=body, contentType="application/json", accept="application/json"
    ))
    for event in response["body"]:
        chunk = event.get("chunk")
        if chunk:
            delta = (json.loads(chunk["bytes"])
                     .get("contentBlockDelta", {})
                     .get("delta", {})
                     .get("text", ""))
            if delta:
                yield delta


async def _embed(text: str) -> list[float]:
    client = get_bedrock()
    loop = asyncio.get_event_loop()
    resp = await loop.run_in_executor(None, lambda: client.invoke_model(
        modelId="amazon.titan-embed-text-v2:0",
        body=json.dumps({"inputText": text, "dimensions": 1024, "normalize": True}),
        contentType="application/json", accept="application/json",
    ))
    return json.loads(resp["body"].read())["embedding"]


# ── pgvector search ───────────────────────────────────────────────────────────
# Single table: contract_embeddings
# Columns: chunk_text, embedding, source_type, state, district, road_number,
#          concessionaire, source_pdf_hash, metadata (jsonb)
TABLE = "contract_embeddings"
SOURCE_TYPE_MAP = {
    "road_chunks":  "nhai_contract",
    "pwd_chunks":   "pwd_contact",
    "pmgsy_chunks": "pmgsy_road",
    "reference_chunks": "road_reference",
    "pmgsy_reference_chunks": "pmgsy_reference",
    "authority_chunks": "authority",
}

def _pg_connect():
    return psycopg2.connect(
        host=os.environ["PG_HOST"],
        port=int(os.environ.get("PG_PORT", 5432)),
        dbname=os.environ["PG_DATABASE"],
        user=os.environ["PG_USER"],
        password=os.environ.get("PG_PASSWORD", ""),
    )

async def _vector_search(query: str, source_type_filter: Optional[str] = None, limit: int = 8) -> list[dict]:
    """Embed query and search contract_embeddings pgvector table."""
    try:
        embedding = await _embed(query)
        loop = asyncio.get_event_loop()
        def _fetch():
            conn = _pg_connect()
            cur = conn.cursor()
            emb_str = "[" + ",".join(str(x) for x in embedding) + "]"
            if source_type_filter:
                cur.execute(
                    f"""SELECT chunk_text, road_number, concessionaire, state, district,
                               source_type, metadata,
                               1 - (embedding <=> '{emb_str}'::vector) AS score
                        FROM {TABLE}
                        WHERE source_type = %s
                        ORDER BY embedding <=> '{emb_str}'::vector LIMIT %s""",
                    (source_type_filter, limit),
                )
            else:
                cur.execute(
                    f"""SELECT chunk_text, road_number, concessionaire, state, district,
                               source_type, metadata,
                               1 - (embedding <=> '{emb_str}'::vector) AS score
                        FROM {TABLE}
                        ORDER BY embedding <=> '{emb_str}'::vector LIMIT %s""",
                    (limit,),
                )
            rows = cur.fetchall()
            cur.close(); conn.close()
            return rows
        rows = await loop.run_in_executor(None, _fetch)
        return [
            {
                "text": r[0],
                "road_number": r[1],
                "concessionaire": r[2],
                "state": r[3],
                "district": r[4],
                "source_type": r[5],
                "metadata": r[6] or {},
                "label": (r[6] or {}).get("source_url", r[5] or "VIGIA"),
                "url": (r[6] or {}).get("source_url"),
                "score": float(r[7]),
            }
            for r in rows
        ]
    except Exception as e:
        return [{"text": f"Search unavailable: {e}", "label": "error", "score": 0.0}]


# ── Router node ───────────────────────────────────────────────────────────────
ROUTER_PROMPT = """You are a routing classifier for VIGIA, an Indian infrastructure auditing system.

CONVERSATION HISTORY:
{history}

USER INPUT: "{query}"
IMAGE: {has_image}  GPS: {has_gps}

Reply with ONLY a JSON object (no markdown fences):
{{"intent":"<conversational|complaint|rti|condition|personnel|tender_search>","agents":["admin"],"conversational_reply":null}}

RULES:
- agents: always include "admin". Add "vision" if IMAGE=True. Telemetry ingestion is currently disabled.
- conversational: agents=[], set conversational_reply (<50 words)
- tender_search: contract/budget/concessionaire/maintenance/DLP/last relaying/project completion
- CRITICAL: "last relaying"/"when resurfaced"/"DLP"/"completion date" → tender_search NOT condition"""

async def _router(req: SearchRequest) -> dict:
    prompt = ROUTER_PROMPT.format(
        history="\n".join(f"{m.role}: {m.content}" for m in req.history[-6:]) or "None",
        query=req.query, has_image=bool(req.image_url), has_gps=bool(req.gps)
    )
    raw = (await _invoke_nova(prompt)).strip().strip("```json").strip("```").strip()
    # Extract first JSON object if extra text present
    m = re.search(r'\{.*\}', raw, re.DOTALL)
    try:
        return json.loads(m.group() if m else raw)
    except Exception:
        return {"intent": "tender_search", "agents": ["admin"], "conversational_reply": None}


# ── Planner (multi-hop query decomposition) ───────────────────────────────────
PLANNER_PROMPT = """You are a retrieval planner for VIGIA. Available tables:
- road_chunks: NHAI contracts (road numbers, concessionaires, costs, districts, modes EPC/HAM/BOT)
- pwd_chunks: PWD personnel (engineers, phones, emails, divisions)
- pmgsy_chunks: Rural roads (PMGSY scheme, contractors, districts)
- reference_chunks: Clearly labelled road-network reference material
- pmgsy_reference_chunks: Official PMGSY scheme and impact-assessment material
- authority_chunks: Official complaint portals and authority channels

Given the query, output a JSON plan (1-4 steps):
{{"steps":[{{"id":"s1","table":"road_chunks","query":"...","extract":["district"],"depends_on":[]}},{{"id":"s2","table":"pwd_chunks","query":"...","inject_from":{{"district":"s1.district"}},"depends_on":["s1"]}}]}}

RULES:
- Steps without depends_on run in parallel
- Use "extract" to pull: district, state, road_number, concessionaire
- For personnel queries about a road: ALWAYS include both road_chunks step AND pwd_chunks step with inject_from
- Keep queries short and specific. Include location terms from the user query.
- For road-network overviews, Chennai infrastructure context, or Wikipedia/reference questions, include reference_chunks.
- For PMGSY scheme context without a specific indexed road ID, include pmgsy_reference_chunks.

USER QUERY: "{query}"
INTENT: {intent}"""

async def _planner(query: str, intent: str) -> list[dict]:
    prompt = PLANNER_PROMPT.format(query=query, intent=intent)
    raw = (await _invoke_nova(prompt)).strip().strip("```json").strip("```").strip()
    m = re.search(r'\{.*\}', raw, re.DOTALL)
    try:
        plan = json.loads(m.group() if m else raw)
        return plan.get("steps", [{"id": "s1", "table": "road_chunks", "query": query, "depends_on": []}])
    except Exception:
        return [{"id": "s1", "table": "road_chunks", "query": query, "depends_on": []}]


# ── Executor (parallel + sequential steps with injection) ─────────────────────
async def _execute_plan(steps: list[dict], base_query: str) -> list[dict]:
    """Execute plan steps respecting depends_on. Returns list of chunk result sets."""
    completed: dict[str, list[dict]] = {}
    extracted: dict[str, dict] = {}  # step_id -> {field: value}
    all_chunks: list[dict] = []

    # Topological execution
    pending = list(steps)
    max_rounds = len(steps) + 1
    for _ in range(max_rounds):
        if not pending:
            break
        ready = [s for s in pending if all(d in completed for d in (s.get("depends_on") or []))]
        if not ready:
            # Circular dep — just run all remaining
            ready = pending

        # Build queries with injected values
        tasks = []
        for step in ready:
            q = step.get("query", base_query)
            inject = step.get("inject_from", {})
            for field, ref in inject.items():
                dep_id, dep_field = ref.split(".", 1)
                val = extracted.get(dep_id, {}).get(dep_field)
                if val:
                    q = f"{q} {val}"
            table = step.get("table", "road_chunks")
            source_type = SOURCE_TYPE_MAP.get(table, table)
            tasks.append((step["id"], source_type, q, step.get("extract", [])))

        results = await asyncio.gather(*[_vector_search(q, table) for _, table, q, _ in tasks])

        for (step_id, _, _, extract_fields), chunks in zip(tasks, results):
            completed[step_id] = chunks
            all_chunks.extend(chunks)
            # Extract metadata fields for injection into dependent steps
            if extract_fields:
                ext = {}
                for chunk in chunks:
                    for field in extract_fields:
                        if field not in ext:
                            val = chunk.get(field) or _extract_field_from_text(chunk["text"], field)
                            if val:
                                ext[field] = val
                extracted[step_id] = ext

        for step in ready:
            pending.remove(step)

    return all_chunks


def _extract_field_from_text(text: str, field: str) -> Optional[str]:
    """Fast regex extraction of common fields from chunk text."""
    patterns = {
        "district": r'\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s+[Dd]istrict',
        "state": r'\b(Telangana|Maharashtra|Kerala|Karnataka|Tamil Nadu|Andhra Pradesh|Rajasthan|Gujarat|Punjab|Haryana|Uttar Pradesh|Bihar|Odisha|West Bengal|Madhya Pradesh|Assam|Himachal Pradesh)\b',
        "road_number": r'\b(NH[-\s]?\d+[A-Z]?|SH[-\s]?\d+)\b',
        "concessionaire": r'(?:concessionaire|contractor)[:\s]+([A-Z][A-Za-z\s&.,]+(?:Ltd|Limited|JV|LLP|Pvt))',
    }
    m = re.search(patterns.get(field, ""), text)
    return m.group(1).strip() if m else None


# ── Guardrail (CRAG pattern) ───────────────────────────────────────────────────
DATA_VOID_MARKERS = ["No relevant data found", "Search unavailable", "does not currently contain"]

def _assess_evidence(chunks: list[dict]) -> tuple[float, bool]:
    """Returns (confidence, is_data_void)."""
    if not chunks:
        return 0.0, True
    good = [c for c in chunks if c.get("score", 0) > 0.55]
    if not good:
        return 0.3, True
    if any(any(m in c.get("text", "") for m in DATA_VOID_MARKERS) for c in good):
        return 0.2, True
    confidence = min(1.0, sum(c["score"] for c in good[:5]) / min(len(good), 5))
    return round(confidence, 2), confidence < 0.5

def _detect_contradiction(chunks: list[dict], query: str) -> bool:
    """Simple heuristic: admin says compliant but high-severity condition signal present."""
    text = " ".join(c.get("text", "") for c in chunks)
    admin_compliant = bool(re.search(r'compliant|completed|satisfactor', text, re.I))
    vision_damage = bool(re.search(r'severe|critical|pothole|damage|degrad', text, re.I))
    return admin_compliant and vision_damage

def _temporal_warnings(chunks: list[dict]) -> list[str]:
    """Flag future dates presented as completed events."""
    from datetime import datetime
    warnings = []
    now = datetime.now()
    for chunk in chunks:
        dates = re.findall(r'\b(20\d{2}[-/]\d{2}[-/]\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+20\d{2})\b', chunk.get("text", ""))
        for d in dates:
            try:
                parsed = datetime.strptime(d, "%Y-%m-%d") if "-" in d else datetime.strptime(d, "%b %Y")
                if parsed > now and re.search(r'complet|finish|done', chunk["text"], re.I):
                    warnings.append(f"⚠️ TEMPORAL: '{chunk['text'][:80]}' references a future date as completed.")
            except Exception:
                pass
    return warnings


async def _rewrite_query(query: str, intent: str, reason: str) -> str:
    prompt = f"""Rewrite this infrastructure query to broaden retrieval.
Reason: {reason}
Intent: {intent}
Original: {query}
Rules: keep core topic, add synonyms, try alternate road designations if applicable.
Reply with ONLY the rewritten query, no explanation."""
    try:
        return (await _invoke_nova(prompt)).strip().strip('"')
    except Exception:
        return f"{query} road condition infrastructure India"


# ── Authority fallback ────────────────────────────────────────────────────────
AUTHORITY_MATRIX = {
    "NH": {
        "complaint": {"primary": "NHAI Regional Office", "portal": "https://nhai.gov.in", "phone": "1033", "escalation": "MoRTH — https://morth.nic.in"},
        "rti": {"primary": "CPIO, NHAI", "portal": "https://rtionline.gov.in", "phone": None, "escalation": "CIC — https://cic.gov.in"},
    },
    "SH": {
        "complaint": {"primary": "PWD State Circle", "portal": "https://pgportal.gov.in", "phone": "1800-11-0031", "escalation": "State PWD Secretary"},
        "rti": {"primary": "SPIO, State PWD", "portal": "https://rtionline.gov.in", "phone": None, "escalation": "State Information Commission"},
    },
}

def _authority_fallback(intent: str, chunks: list[dict]) -> str:
    road_type = "NH"
    for c in chunks:
        rn = c.get("road_number") or _extract_field_from_text(c.get("text", ""), "road_number") or ""
        if rn.startswith("SH"):
            road_type = "SH"
            break
    cat = "rti" if intent == "rti" else "complaint"
    data = AUTHORITY_MATRIX.get(road_type, AUTHORITY_MATRIX["NH"]).get(cat, {})
    lines = [
        "VIGIA could not find specific data for your query in our indexed databases.",
        f"For {cat} matters on {road_type} roads:",
        f"→ Primary Authority: {data.get('primary', 'NHAI')}",
        f"→ Portal: {data.get('portal', 'https://nhai.gov.in')}",
    ]
    if data.get("phone"):
        lines.append(f"→ Helpline: {data['phone']}")
    lines.append(f"→ Escalation: {data.get('escalation', 'MoRTH')}")
    lines.append("→ Legal Basis: National Highways Act 1956 / RTI Act 2005")
    return "\n".join(lines)


# ── Context builder ───────────────────────────────────────────────────────────
ANTI_HALLUCINATION = """
STRICT ANTI-HALLUCINATION RULES:
- NEVER invent names, phone numbers, email addresses, or costs.
- If the evidence does not contain the answer, say "This specific data is not available in the VIGIA index."
- Every name, number, email, and cost MUST appear verbatim in the evidence chunks above.
- COPY-PASTE contact details exactly. Do not paraphrase."""

def _build_context(chunks: list[dict], confidence: float, temporal_warnings: list[str], authority_text: Optional[str] = None) -> str:
    if authority_text:
        return f"\n\n## Authority Fallback:\n{authority_text}\nIMPORTANT: Output the EXACT portal URLs and helpline numbers shown above."

    if not chunks:
        return ""

    good = [c for c in chunks if c.get("score", 0) > 0.55][:8]
    ctx = f"\n\n## VIGIA Pipeline Evidence (confidence: {confidence}):\n"
    for c in good:
        ctx += f"- {c['text'][:400]}\n"

    citations = list({c['label'] for c in good if c.get('label') and c['label'] != 'error'})
    if citations:
        urls = [f"[{c['label']}]({c.get('url') or ''})" for c in good if c.get('label') and c['label'] != 'error']
        ctx += "Sources: " + ", ".join(urls[:5]) + "\n"

    if temporal_warnings:
        ctx += "\n" + "\n".join(temporal_warnings) + "\n"

    ctx += ANTI_HALLUCINATION
    ctx += "\n\nIMPORTANT: Answer using ONLY the evidence above. Cite sources. If evidence contains project metadata (budget, mode, timeline), include it in a **Project Overview** section."
    return ctx


LANGUAGE_NAMES = {
    "hi-IN": "Hindi",
    "bn-IN": "Bengali",
    "ta-IN": "Tamil",
    "te-IN": "Telugu",
    "gu-IN": "Gujarati",
    "kn-IN": "Kannada",
    "ml-IN": "Malayalam",
    "mr-IN": "Marathi",
    "pa-IN": "Punjabi",
    "od-IN": "Odia",
    "or-IN": "Odia",
    "ur-IN": "Urdu",
    "en-IN": "Indian English",
}


def _language_instruction(language_code: Optional[str]) -> str:
    if not language_code:
        return "Match the language of the user's latest message."
    normalized = language_code.replace("_", "-")
    language = LANGUAGE_NAMES.get(normalized, normalized)
    return (
        f"The user's latest message is in {language} ({normalized}). "
        f"Write the ENTIRE answer in {language}. Translate English evidence into {language}, "
        "while keeping official names, identifiers, URLs, and citation labels unchanged. "
        "Ignore the language used by earlier assistant messages."
    )


# ── Full pipeline ─────────────────────────────────────────────────────────────
async def run_pipeline(req: SearchRequest) -> AsyncGenerator[str, None]:
    try:
        # ── Node 1: Router ────────────────────────────────────────────────────
        yield sse_step("Understanding your request...")
        routing = await _router(req)
        intent = routing.get("intent", "tender_search")

        if intent == "conversational":
            reply = routing.get("conversational_reply") or (
                "Hello! I'm VIGIA. I help with road complaints, RTI requests, condition assessments, and tender/contract data. What would you like to know?"
            )
            yield sse_delta(reply)
            yield sse_done()
            return

        # ── Node 2: Planner ───────────────────────────────────────────────────
        yield sse_step("Planning the evidence search...")
        steps = await _planner(req.query, intent)
        n_steps = len(steps)
        yield sse_step(f"Searching {n_steps} official or indexed source{'s' if n_steps != 1 else ''}...")

        # ── Node 3: Executor (parallel multi-hop) ─────────────────────────────
        chunks = await _execute_plan(steps, req.query)

        # ── Node 4: Guardrail ─────────────────────────────────────────────────
        yield sse_step("Checking citations and claim support...")
        confidence, is_void = _assess_evidence(chunks)
        contradiction = _detect_contradiction(chunks, req.query)
        temporal_warnings = _temporal_warnings(chunks)

        retry_chunks = chunks
        authority_text: Optional[str] = None

        if is_void and not contradiction:
            rewritten = await _rewrite_query(req.query, intent, "data-void")
            yield sse_step(f"Low confidence — retrying with refined query...")
            retry_steps = [{"id": "r1", "table": s.get("table", "road_chunks"), "query": rewritten, "depends_on": []} for s in steps]
            retry_chunks = await _execute_plan(retry_steps, rewritten)
            confidence2, still_void = _assess_evidence(retry_chunks)
            if still_void:
                yield sse_step("Routing to authority contacts...")
                authority_text = _authority_fallback(intent, chunks)
                retry_chunks = []
                confidence = 0.0
            else:
                chunks = retry_chunks
                confidence = confidence2

        elif contradiction:
            yield sse_step("Contradiction detected — cross-checking sources...")
            rewritten = await _rewrite_query(req.query, intent, "contradiction")
            retry_steps = [{"id": "r1", "table": s.get("table", "road_chunks"), "query": rewritten, "depends_on": []} for s in steps]
            retry_chunks = await _execute_plan(retry_steps, rewritten)
            confidence2, _ = _assess_evidence(retry_chunks)
            if confidence2 > confidence:
                chunks = retry_chunks
                confidence = confidence2

        if temporal_warnings:
            yield sse_step(f"Flagging {len(temporal_warnings)} temporal inconsistency...")

        # ── Node 5: Stream response ───────────────────────────────────────────
        yield sse_step("Drafting the verified answer...")

        context = _build_context(chunks, confidence, temporal_warnings, authority_text)
        system = (
            "You are VIGIA, an AI-powered infrastructure auditing assistant for Indian roads. "
            "Help citizens with road quality data, complaints, and RTI. "
            "Be precise, cite sources, never fabricate data.\n"
            + _language_instruction(req.response_language)
            + "\n"
            + context
        )

        conversation = [{"role": h.role, "content": [{"text": h.content}]} for h in req.history[-6:]]
        conversation.append({"role": "user", "content": [{"text": req.query}]})

        model = "amazon.nova-pro-v1:0" if intent == "personnel" else "amazon.nova-lite-v1:0"

        # Stream tokens immediately as they arrive — no buffering
        async for token in _stream_nova(system, conversation, model=model):
            yield sse_delta(token)

        # Emit metadata after streaming completes
        good_chunks = [c for c in chunks if c.get("score", 0) > 0.55]
        sources = []
        for index, chunk in enumerate(good_chunks[:5]):
            if not chunk.get("label") or chunk["label"] == "error":
                continue
            metadata = chunk.get("metadata") or {}
            sources.append({
                "id": metadata.get("source_id") or metadata.get("sourceId") or f"engine-source-{index}",
                "label": metadata.get("source_label") or metadata.get("document_title") or chunk["label"],
                "trustLevel": metadata.get("trust_level") or "official-portal",
                "url": chunk.get("url"),
                "documentTitle": metadata.get("document_title") or metadata.get("documentTitle"),
                "excerpt": chunk.get("text"),
                "sourceLocator": metadata.get("source_locator") or metadata.get("sourceLocator") or metadata.get("locator"),
                "pageNumber": metadata.get("page_number") or metadata.get("pageNumber") or metadata.get("page"),
                "paragraphNumber": metadata.get("paragraph_number") or metadata.get("paragraphNumber") or metadata.get("paragraph"),
                "sectionTitle": metadata.get("section_title") or metadata.get("sectionTitle"),
                "chunkIndex": metadata.get("chunk_index") or metadata.get("chunkIndex"),
            })
        yield sse_metadata({
            "type": "vigia-evidence",
            "sources": sources,
            "confidence": confidence,
            "intent": intent,
            "authority_fallback": authority_text is not None,
            "contradiction_detected": contradiction,
            "temporal_warnings": temporal_warnings,
        })
        yield sse_done()

    except Exception as e:
        yield sse_error(str(e))
        yield sse_done()


# ── App ───────────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    get_bedrock()
    yield

app = FastAPI(title="VIGIASearch Engine", version="2.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","), allow_methods=["POST", "GET"], allow_headers=["*"])

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.post("/v1/search")
async def search(request: Request):
    body = await request.json()
    req = SearchRequest(**body)
    return StreamingResponse(
        run_pipeline(req),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )

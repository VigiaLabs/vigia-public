A citizen standing next to a broken highway asks who to call. The most dangerous thing our system can do is answer with a confident, plausible, and completely invented name and phone number. The person does not exist, the citizen wastes time chasing them, and the real hazard stays unreported.

This post is about the part of VIGIASearch that exists to prevent exactly that. VIGIASearch is a road intelligence assistant for India, built for the IIT Madras Road Safety Hackathon 2026, and the full system is covered in the [pillar article](https://ridingbluewaves.hashnode.dev/engineering-vigiasearch-building-a-hallucination-resistant-road-intelligence-system-with-langgraph-rag-and-multi-modal-reasoning). Here I want to zoom in on one node: the Guardrail.

### Fabricated people are the worst failure class

Invented statistics are bad. Invented personnel details are worse. When someone asks "who is the executive engineer responsible for NH-77?", a model that does not know the answer will happily generate a name that sounds right. Plausible-sounding is more harmful than obviously wrong, because a citizen might actually act on it during an emergency.

So the Guardrail is not a single check. It is a set of layers, each catching a different way the system could lie.

![Guardrail decision tree](https://cdn.hashnode.com/res/hashnode/image/upload/v1783247936437/86a06577-7402-4fbb-8cfb-e69557c48185.png)

### Layer one: grade the retrieval before trusting it

The first idea is **Self-RAG (Asai et al., 2023)**: have the system judge its own retrieval quality before passing results forward. Rather than trusting whatever the retriever returns, the Guardrail grades it first.

Every admin evidence result carries a confidence score derived from retrieval similarity. Anything below a 0.5 threshold, or with no findings, or carrying an explicit "no relevant data" marker, is treated as a data void and routed to a query rewrite rather than passed to synthesis. This one check does the most work, because most fabrications happen when a model is handed thin or empty evidence and fills the gap on its own.

### Layer two: rewrite and retry, once

When retrieval quality is low, the fix is **CRAG (Yan et al., 2024)**: rewrite the query and try again. We built a rewriter node that takes the original query, the intent, and the reason it failed, and produces a semantically broader version.

For data voids, it generalises geographic terms and adds synonyms. For contradictions, where an official document says "completed" but a photo shows severe damage, it adds terms like "amendment", "variation order", and "addendum", because the most common real explanation is that a corrective amendment was never indexed alongside the original record.

We started with a hardcoded fallback string for the retry. It failed the moment we tested anything other than the single scenario we had written it for. The LLM-based rewriter replaced it. The retry is bounded to a single pass. If the rewritten query still comes back empty, the Guardrail stops and routes to an Authority Matrix fallback that hands the citizen a real helpline and portal instead of a guess.

### Layer three: cheap deterministic checks

Before anything reaches synthesis, the Guardrail runs a few consistency checks that are plain TypeScript, not model calls.

A temporal coherence check flags any finding that describes a future-dated event as already completed. A cross-agent consistency check verifies that the Admin and Telemetry agents are discussing the same road, so if Admin evidence references NH-44 but the GPS trace was on a different road number, that mismatch is surfaced rather than silently merged. These are a few dozen lines of code, which makes them cheap, deterministic, and trivially testable.

### The jurisdiction trap

The most acute failure in a personnel directory is returning a real person from the wrong place. During testing, I ran the system from Dubai and asked "who is the engineer for this road." It returned a Telangana executive engineer, because the keyword query matched on "engineer" with no geographic constraint and the top result happened to be that officer.

The first fix was a hard constraint: if a personnel query arrives with a GPS coordinate that resolves outside India, the Admin agent returns an out-of-jurisdiction message and never touches the personnel directory.

The harder case is a personnel query with no GPS and no state in the text. A strict gate rejected too many legitimate queries, so we pushed the defense down into retrieval as defense-in-depth. The keyword (FTS5) fallback enforces a mandatory geographic constraint: if the query is a personnel query and contains no recognisable Indian state name, the personnel table is not queried and an empty result is returned rather than a random officer. That empty result then flows into the data-void path and is handled gracefully. A wrong officer delivered with confidence is a far worse failure than no officer at all.

### Zero-trust for citizen photos

The original pipeline treated an uploaded photo as high-trust evidence. If the Vision agent classified a photo as severe damage with high confidence, that was enough to trigger a contradiction against official NHAI documents. That felt right at first, but it creates a trust inversion: an anonymous, unverified submission overriding a legally-binding government record. It is also gameable, since anyone could manufacture a false contradiction with a single photo.

Citizen evidence is not worthless. It just belongs in a different trust tier.

| Trust Level | Source | Contradiction trigger | Synthesis weight |
|---|---|---|---|
| `legally-binding` | NHAI completion certificates, contract PDFs | Yes | Primary |
| `official-portal` | PWD directories, PMGSY OMMAS | Yes | Primary |
| `verified-spatial` | GPS telemetry, offline edge DB | Yes | Supporting |
| `citizen-claim` | User-uploaded photos | **No** | Acknowledged, hedged |

The Vision agent now tags every photo finding as `citizen-claim` and prepends a `[CITIZEN CLAIM]` marker. The contradiction detector ignores citizen-claim evidence and will not trigger a retry on it. Instead, a high-confidence citizen photo attaches a pending action to the state: a "Flag this coordinate for official PWD review" button below the response. The finding is still shown, framed clearly as unverified, and the pipeline does not raise a spurious "official record contradicted" alert. This also avoids steering a citizen away from a perfectly safe route on the strength of one bad-angle photo, which in this domain is not just noise, it is potentially harmful advice.

### Measuring, not just guarding

There is one more layer, but it sits after delivery rather than gating it. Once the response is generated, an LLM-as-Judge faithfulness scorer (our take on Chain-of-Verification, Dhuliawala et al., 2023) splits the response into claims and checks whether each can be attributed to a retrieved chunk. The signal is high specificity with low attribution: a specific name, date, or figure that traces back to nothing. It runs asynchronously and attaches a score to the response as metadata. The hard guarantees live earlier, in retrieval grading and the strict "use only the evidence above" synthesis prompt. The faithfulness score is how we check those guarantees are holding.

### Takeaway

Hallucination is not one problem you solve once. It shows up in a different disguise at every layer, and each one needs its own guard. The pattern that kept working was pushing each decision to the cheapest deterministic layer that could make it: a threshold, a regex geographic gate, a trust tier, rather than trusting a smarter prompt.

The full system, including the retrieval and orchestration design, is in the [pillar article](https://ridingbluewaves.hashnode.dev/engineering-vigiasearch-building-a-hallucination-resistant-road-intelligence-system-with-langgraph-rag-and-multi-modal-reasoning), and the code is open at [github.com/VigiaLabs/vigia-public](https://github.com/VigiaLabs/vigia-public).


---

## 🧰 The anti-hallucination toolkit, from zero — and what we chose it over

- **Named patterns over "a better prompt."** **Self-RAG** grades retrieval before trusting it (0.5 threshold → data void); **CRAG** does a bounded rewrite-and-retry; **Chain-of-Verification** runs an async LLM-as-judge faithfulness score. Each is a documented technique, chosen deliberately over hoping a smarter prompt behaves.
- **Deterministic checks over model calls.** Temporal coherence, cross-agent consistency, and the geo constraint are a few dozen lines of TypeScript — the *cheapest deterministic layer* that can enforce the rule, so it's testable and free.
- **Provenance-based trust tiers over equal-weight evidence.** Legal records are primary; citizen photos are acknowledged-but-hedged and can't trigger a contradiction — closing a gameable trust inversion.

## 🚢 From demo to production

- **An eval harness** (faithfulness/precision) that gates every change, so a "smarter" prompt can't silently regress safety.
- **Monitor the faithfulness SLI** in production and **adapt thresholds** to observed fraud/error.
- The honest framing: **hallucination reappears in a new disguise at every layer** — each needs its own guard, pushed to the cheapest deterministic layer that can make it.

---

## 🎓 CS Fundamentals — study companion

*This is the **ML-systems + security** episode: RAG anti-hallucination techniques (Self-RAG, CRAG, Chain-of-Verification), defense-in-depth, trust tiers / zero-trust, and pushing enforcement to the cheapest deterministic layer. Very interview-relevant for anyone touching LLM/ML systems or security.*

### ML Systems — hallucination & retrieval quality
- **Self-RAG — grade the retrieval before you trust it.** Confidence is derived from retrieval similarity; anything below a **0.5 threshold** (or empty, or marked "no data") is a *data void* routed to a rewrite, not to synthesis. Key insight: **most fabrication happens when a model is handed thin/empty evidence and fills the gap.** Grading retrieval quality first cuts hallucination at the source.
- **CRAG — corrective retrieval.** When retrieval is weak, *rewrite the query and retry once*. The rewriter broadens geography, adds synonyms, or (for contradictions) adds terms like "amendment / variation order." Bounded to a single pass, then it stops and routes to a real helpline. Bounded retries prevent infinite loops while still self-correcting.
- **Chain-of-Verification (faithfulness scoring).** After the answer is generated, an LLM-as-Judge splits it into claims and checks each against a retrieved chunk. The hallucination signal is **high specificity + low attribution** — a precise name/date/figure that traces to nothing. It runs *asynchronously* as an **observability metric**, not a pre-delivery gate: the hard guarantees live earlier (grading + "use only the evidence above" synthesis prompt); the score measures whether they're holding.
- **Grounding / attribution.** The core anti-hallucination contract of RAG: every claim must be attributable to a retrieved chunk. "Never invent a name or number" in the synthesis prompt + attribution checking is how you enforce it.

### Security — trust, zero-trust, defense-in-depth
- **Trust tiers (data provenance).** Evidence is ranked: `legally-binding` (NHAI certs) and `official-portal` (PWD) are primary and can trigger contradictions; `verified-spatial` (GPS) supports; `citizen-claim` (user photos) is **acknowledged but hedged and never triggers a contradiction**. This is classic **provenance-based trust weighting** — the *source* determines the authority, not the content's confidence.
- **The trust inversion, and why it's a vulnerability.** Originally a citizen photo could override a legal government record. That's a **trust inversion** and it's *gameable* — anyone could manufacture a false contradiction with one photo. Treating a low-trust, unauthenticated input as high-trust evidence is the security bug; the fix is putting it in its own tier. (Threat-model your inputs by who can forge them.)
- **Defense-in-depth (the jurisdiction trap).** A personnel query from Dubai returned a Telangana engineer. Fix wasn't one gate but **layers**: (1) hard constraint — GPS outside India → refuse; (2) when a strict gate over-rejected, push the constraint *down into retrieval* (FTS5 requires a recognisable Indian state or returns empty). Multiple independent checks so no single bypass leaks a wrong officer — the definition of defense-in-depth.
- **Fail-safe / fail-closed.** An empty result flows into the graceful data-void path (real helpline) rather than a random officer. In a safety domain the safe default is **refuse**, not guess — a wrong officer with confidence is worse than no officer.

### DBMS
- **Constraint pushed into the query layer.** The mandatory geographic constraint lives in the SQL/FTS5 fallback (constrain by state column, or return empty). Enforcing correctness as a **query constraint** — cheap, deterministic, indexed — beats hoping the model respects jurisdiction.

**Interview Q&A.**
1. *What is Self-RAG?* → The system grades its own retrieval quality before using it; low-confidence/empty retrieval is routed to correction instead of synthesis, cutting fabrication from thin evidence.
2. *What is CRAG?* → Corrective RAG: on weak retrieval, rewrite the query and retry (bounded), then fall back gracefully if it still fails.
3. *Explain defense-in-depth with the jurisdiction example.* → Layered checks (GPS-outside-India refusal + retrieval-layer state constraint) so no single failure returns a wrong-jurisdiction person.
4. *What's a trust inversion and how do you fix it?* → A low-trust input overriding a high-trust record; fix by provenance-based trust tiers where unverified inputs are hedged and can't trigger authoritative actions.
5. *Why score faithfulness asynchronously instead of gating on it?* → The hard guarantees live in retrieval grading + a strict synthesis prompt; the async score is an observability signal to verify they hold, without adding latency to delivery.

**Quick-review flashcards.**
- Self-RAG = grade retrieval before trusting it (0.5 threshold → void).
- CRAG = rewrite + retry once, then refuse.
- CoVe = split into claims, check attribution; specificity + no source = hallucination.
- Trust tiers: legal/official > spatial > citizen-claim (hedged, never contradicts).
- Defense-in-depth + fail-closed = refuse beats a confident wrong answer.

### ⚖️ This vs That — the architecture decisions, and the roads not taken

| Decision | Alternatives | Why this choice |
|---|---|---|
| **Grade retrieval (Self-RAG) + refuse voids** | Trust the retriever, synthesise whatever comes back | Thin/empty evidence is exactly where models fabricate; grading + refuse-to-helpline stops it at the source. |
| **Bounded CRAG rewrite-and-retry** | Hardcoded fallback query / unbounded retries | A hardcoded string broke outside its one scenario; unbounded retries loop. One LLM-rewritten retry, then a safe fallback. |
| **Citizen photos as a hedged trust tier** | Treat photos as high-trust evidence | High-trust photos create a gameable trust inversion over legal records; a separate tier acknowledges the claim without letting it override official data. |
| **Defense-in-depth geo constraint (agent + retrieval)** | A single strict location gate | One strict gate over-rejected valid queries; layering a retrieval-level state constraint catches the rest without blocking legitimate use. |
| **Cheap deterministic checks (regex/threshold/tier)** | A smarter synthesis prompt | Prompts are probabilistic; a threshold, a geo-regex, or a trust tier is deterministic and testable — push each decision to the cheapest layer that can enforce it. |

**The one to defend:** *push every safety decision to the cheapest deterministic layer that can make it.* The thesis: **hallucination isn't one bug you fix once — it reappears in a new disguise at every layer, so each needs its own guard**, and the guard should be a threshold, a regex gate, or a trust tier rather than a cleverer prompt. Determinism where a wrong answer is dangerous; the LLM only where it's safe to reason.

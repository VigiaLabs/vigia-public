Every year, road accidents claim over a million lives globally, with developing nations carrying a disproportionate share of that burden. While modern vehicles are becoming increasingly intelligent, much of the world's road infrastructure remains effectively *"blind"*, unable to continuously monitor hazards, deteriorating road conditions, or emerging safety risks in real time.

![](https://cdn.hashnode.com/uploads/covers/697a3a7c4b19a21e89e9cf6f/d6073c05-63fd-4dd9-a271-0ca5ae8143be.png align="center")

When the **IIT Madras Road Safety Hackathon 2026** was announced, we saw it as an opportunity to grow VIGIA further. We were already developing the blackbox prototype that could detect hazards and build a *"digital twin"* of any city over time, but what comes after that? How do citizens use that data to effectively *save lives*? Or make a more informed decision on their travel routes?

Which was why we participated in the **RoadWatch Track** of this hackathon, to eventually build **VIGIASearch**.

We wanted a unified portal where citizens can get transparent, accurate, up-to-date data to their queries. It looks like a simple engineering problem at first; set up a Next.js app, a simple chat engine, keyword search with our database and government databases, and return answers summarised by our LLM. But there are clear problems that become evident if we were to use this practically:

1.  There is no unified database. Government data is fragmented and split across **NHAI**, **PWD**, **PMGSY**, and more for road-related data.
    
2.  The official data is our primary source, yes, but it is outdated, often dating back a year or more. This confuses our engine and gives outdated information to the citizen.
    
3.  LLMs are highly prone to hallucinations. In cases of double queries like `"who is the manager of this road in Pune AND who is the executive engineer of NH-77?"`, it will hallucinate and make up the name of the engineer of NH-77.
    

These problems introduced new complexities and to combat these we introduced some solutions: We built a unified vector database as our primary source, scraping and storing NHAI, PWD, and PMGSY data via NAT Gateways in AWS that auto-retrieve every day. This made *semantic search* possible, exposing the reasoning agent to many more different types of information, allowing the engine to give nuanced, multi-faceted answers. To combat hallucination, we implemented a variety of anti-hallucinatory guardrails, primarily through a ***LangGraph stateful orchestration*** network with ***multi-hop reasoning and CRAG***. We also styled our UI/UX after ***perplexity***, in an effort to encourage transparent, clearly cited information, presented in a clear, readable format to the citizens.

To read more about our architectural decisions and solutions check up this article **here**.

![our perplexity style UI](https://cdn.hashnode.com/uploads/covers/697a3a7c4b19a21e89e9cf6f/74423235-ec0a-4a49-961e-11d197c3c9bd.png align="center")

* * *

### **Our Goals for the Finale**

Reaching the **IIT Madras Road Safety Hackathon Finale** is already a significant milestone for us, and we are grateful for the opportunity, but our ambitions extend far *beyond* the competition itself.

Of course, our immediate goal is simple: we want to win. On 16th July, we will have the opportunity to present VIGIA and [***VIGIASearch***](https://main.d1y3lme21jz1c7.amplifyapp.com/t/9db0760f-258f-4a3f-b49a-f0b79e8de4eb) to the Centre of Excellence for Road Safety ([**CoERS**](https://coers.iitm.ac.in/)), and we intend to demonstrate not only the technical depth of our solution, but also its potential real-world impact. Our team has been fortunate to achieve success in several competitions over the past year, including winning **i.mobilothon 5.0** in January 2026, winning **Bharat AI SoC** in March 2026, and being selected among the **Top 50 Global Finalists in the Amazon AIdeas Challenge 10,000**. We hope to continue that momentum at IIT Madras.

*However*, the competition itself is not our primary objective.

What excites us most is the possibility of *validating* VIGIA in the real world.

Until now, VIGIA has largely existed as a research and engineering effort. We have spent months designing the platform, debating deployment strategies, refining architectures, and discussing potential pilot locations, whether in Rourkela, where we study, or elsewhere in India. What we have not yet had is large-scale user validation.

That is why a pilot deployment would be *transformational* for us.

A pilot conducted alongside [**CoERS**](https://coers.iitm.ac.in/), a municipality, or a road authority would allow us to evaluate how citizens *actually* interact with the platform, how agencies respond to reported hazards, and where the system creates measurable value.

More importantly, it would provide the real-world metrics, feedback, and operational insights needed to improve the platform and guide future development.

* * *

### **Beyond the Finale: Our Long-Term Ambitions**.

Our vision is to work toward pilot deployments with municipalities and road authorities, validating the platform under real operating conditions and demonstrating that AI *can* meaningfully improve road safety outcomes.

We hope to collaborate closely with CoERS and other stakeholders to explore:

*   Pilot deployments with municipal and state road agencies.
    
*   Validation studies to measure the effectiveness of AI-assisted road monitoring.
    
*   Integration with road authority workflows and maintenance systems.
    
*   Citizen reporting and feedback mechanisms that make infrastructure issues easier to identify and address.
    
*   Real-time hazard detection and prioritization for authorities.
    

Ultimately, our long-term goal is **far more ambitious**: the creation of a living digital twin of road infrastructure.

We envision a future where every road segment continuously accumulates information about its condition, maintenance history, reported hazards, traffic patterns, and safety risks. Instead of relying on fragmented records and periodic inspections, authorities would have access to an evolving, data-driven representation of their road network, enabling faster interventions, smarter maintenance planning, and safer journeys for citizens.

If this finale helps us take even the first step toward that vision through a pilot deployment, validation opportunity, or collaboration with CoERS, we will consider it a **major success regardless of the final rankings.**


---

## 🧰 The stack, from zero — and what we chose it over

- **Frontend — Next.js, styled after Perplexity (cited, streaming answers) over a plain chat bubble.** In a safety domain, transparency *is* the product: every answer shows its sources.
- **Retrieval core — a unified pgvector store (Postgres + vector extension) over three keyword-indexed silos.** From zero: embeddings map text to vectors, and **nearest-neighbour** retrieval finds *meaning*, so "village roads near Khammam" matches "PMGSY Khammam" — which keyword/regex silos couldn't.
- **RAG, from zero.** Retrieve relevant documents → augment the prompt → generate, with citations. It grounds the LLM in real sources instead of its memory — the core anti-hallucination move.
- **Daily ingestion — AWS EventBridge CRON** scraping NHAI/PMGSY/data.gov into embeddings (~$0.20/day total).

## 🚢 From demo to production

This is a hackathon build with a real spine. From zero, the road to production: auth and multi-tenant isolation, **scaling pgvector** (read replicas → sharding), **cost SLOs** on the LLM, hardened freshness pipelines, and monitoring. The value that survives is the thesis every decision serves — *honest, cited answers over a confident guess* — which is exactly what makes it worth productionising.

---

## 🎓 CS Fundamentals — study companion

*This is the **product / system-design intro** to the VIGIASearch series. It's where the requirements, the data problem, and the high-level shape of a RAG system live — the "how would you design X?" framing an interviewer opens with. The deep engineering is in the [pillar article](https://ridingbluewaves.hashnode.dev/engineering-vigiasearch-building-a-hallucination-resistant-road-intelligence-system-with-langgraph-rag-and-multi-modal-reasoning) and its four companions.*

### System Design & Product

- **Requirements → constraints → architecture.** The post walks the classic path: a naive design ("Next.js app + keyword search + LLM summary") is stated, then *broken* against three real constraints — no unified database, stale data, and hallucination. Good system design is exactly this: enumerate the constraints that kill the naive version, then design to them. Always separate **functional** requirements (answer road-safety queries with citations) from **non-functional** ones (accuracy/no-hallucination, freshness, latency).
- **Data integration / the "single source of truth" problem.** Government data is fragmented across NHAI, PWD, PMGSY. Unifying heterogeneous sources into one queryable store is a core data-engineering pattern (ETL/ELT → a unified store). The choice here: embed everything into **one vector database** so semantic search spans all sources at once.
- **RAG (Retrieval-Augmented Generation) — the pattern.** Instead of trusting the LLM's parametric memory, you *retrieve* relevant documents and force the model to answer only from them. This is the single most important architecture to be able to explain: **retrieve → augment the prompt → generate**, with citations back to sources. It's how you make an LLM factual and auditable.
- **Semantic search vs keyword search.** "Village roads near Khammam" and "PMGSY Khammam" are the same question; keyword/regex matching misses the first. **Embeddings** map text to vectors so *meaning*, not exact words, drives retrieval — the reason the whole system moved to a vector store.
- **Hallucination as a first-class risk.** In a safety domain, a confident wrong answer (a fabricated engineer's number) is worse than "I don't know." Designing an explicit *refuse-and-redirect* path (the Authority Matrix helpline fallback) is a product decision, not just an engineering one.

### Product / HCI design
- **Transparency by design (the Perplexity-style UI).** Citations, readable formatting, and a visible reasoning trace are HCI choices that build **trust calibration** — the user can see *why* an answer is given and judge it. In high-stakes tools, showing the evidence is as important as the answer.

**Interview Q&A.**
1. *What is RAG and why use it?* → Retrieve relevant documents and make the LLM answer only from them; it grounds answers in real sources, adds citations, and cuts hallucination versus relying on the model's memory.
2. *Semantic vs keyword search — when does keyword fail?* → Keyword misses paraphrases/synonyms; embeddings capture meaning so "village roads near Khammam" matches "PMGSY Khammam."
3. *How do you design a system over fragmented, outdated third-party data?* → Unify into one store (ETL into a vector DB), timestamp/version for freshness, and add guardrails for gaps rather than trusting the raw source.
4. *Why is a confident hallucination worse than "I don't know" here?* → A citizen may act on a fake contact during an emergency; a refuse-and-redirect (real helpline) is the safe failure mode.

**Quick-review flashcards.**
- RAG = **R**etrieve → **A**ugment prompt → **G**enerate, grounded + cited.
- Embeddings → semantic similarity → beats keyword on paraphrase.
- Fragmented sources → one unified store + freshness/versioning.
- Safety domain → refuse-and-redirect beats a plausible guess.

### ⚖️ This vs That — the architecture decisions, and the roads not taken

| Decision | Alternatives | Why this choice |
|---|---|---|
| **Unified vector DB + semantic search** | Per-source keyword/regex search | Keyword breaks on paraphrase and can't span sources; one embedded store makes every source semantically searchable at once. |
| **Guardrailed RAG (grade + refuse)** | LLM-summarised keyword results | A bare summariser hallucinates on thin/empty evidence; grading retrieval and refusing to guess is the only safe design in a safety domain. |
| **Transparent, cited UI (Perplexity-style)** | A single chat bubble answer | Citations + reasoning trace let citizens calibrate trust; opacity in a safety tool is a liability. |

**The one to defend:** *in a safety-critical domain, "I don't know, here's the official helpline" beats a plausible answer.* The whole architecture — unified retrieval, grading, refuse-and-redirect — exists to make the system's failure mode **safe** rather than **confident**. That is the product thesis every downstream engineering decision serves.

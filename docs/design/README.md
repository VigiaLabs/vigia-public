# Design Notes

Subsystem design documents behind VIGIASearch, grouped by area.

### Core architecture
- [core-module-1.md](core-module-1.md) — Architecture & module boundaries
- [core-module-2.md](core-module-2.md) — Design system
- [core-module-3.md](core-module-3.md) — Generative UI streaming pipe (Vercel AI SDK)
- [core-module-4.md](core-module-4.md) — Offline infrastructure wrapper
- [stateful-orchestration-pipeline.md](stateful-orchestration-pipeline.md) — LangGraph state-management decisions

### Retrieval & anti-hallucination
- [unified_vector_store.md](unified_vector_store.md) — Unified pgvector store with `source_type` discriminator
- [multi_hop_subgraph.md](multi_hop_subgraph.md) — ReWOO Plan-and-Execute multi-hop reasoning
- [hallucination_fix.md](hallucination_fix.md) — Self-RAG, CRAG, spatial guardrails, faithfulness scoring
- [level5_rag_upgrades.md](level5_rag_upgrades.md) — Reranking, semantic caching, node-level streaming

### Data pipeline
- [data_pipeline.md](data_pipeline.md) — Dual-track ingestion, offline edge resilience, global routing
- [data_collection.md](data_collection.md) — Zero-trust vision, inferential routing, PWD scraping
- [rural_road_data.md](rural_road_data.md) — PMGSY OMMAS scraper

### Frontend & UX
- [ui-design.md](ui-design.md) — UI design philosophy
- [mobile-design.md](mobile-design.md) — Mobile layout
- [geospatial-map-carousel.md](geospatial-map-carousel.md) — Map view + interactive carousel

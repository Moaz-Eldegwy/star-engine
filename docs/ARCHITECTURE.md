# Star Engine — Architecture

> If you're reading this before an interview, the things to call out are:
> hybrid retrieval (BM25 + MiniLM dense + RRF), **GraphRAG** that surfaces
> matched concepts visually in the 3D galaxy, fp16 binary embeddings with
> HTTP-Range chunk fetches, listwise LLM rerank with structured output,
> streaming Gemini SSE with last-6-turn conversation memory, and the fact
> that *all retrieval runs in the user's browser* against precomputed
> static artifacts — no backend, no server inference.

## Goals

- **Portfolio-grade demonstration of modern RAG over a knowledge graph.**
  Recognizable technique choices, defensible rationale, observable
  retrieval-trace UI.
- **GraphRAG that's load-bearing, not decorative.** The KG is the spine
  of retrieval (entity-link → 1-hop subgraph → score boost), and the 3D
  galaxy literally lights up the matched stars as a citation interface.
- **Static deploy.** GitHub Pages + Hostinger custom domain. Single
  `dist/` works at both `<user>.github.io/StarEngine/` and
  `starengineai.space/`.
- **Bring your own key.** No secret ever ships with the app. The Gemini
  key lives in the user's `localStorage` and is only ever sent to
  `generativelanguage.googleapis.com`.

## Non-goals

- A backend. No server inference, no proxies, no edge workers.
- Real-time KG editing. The graph is rebuilt offline in a notebook.
- Multi-paper synthesis with map-reduce (yet — see *What's next*).

---

## Offline pipeline (Python / Colab)

```
SB_publication_PMC.csv
        │
        ▼
[ original Space Apps 2025 pipeline — preserved in the initial git
  commit (Papers_Extraction_and_Processing.ipynb) ]
  PMC OAI fetch → JATS XML → publications.json (494 papers)
  Gemini extraction → per-paper graph_extract.json
  Consolidation → knowledge_graph.json (6,350 nodes / 13,030 edges)
        │
        ▼
notebooks/build_rag_index.ipynb
  ├─→ Section-aware chunking
  │     JATS <sec>/<title>/<p> walk → 600-token windows w/ 100-token
  │     sentence-boundary overlap → chunks/{0000..0009}.jsonl, sharded
  │     by hash(pmc_id) % 10 + chunks/manifest.json with byte ranges
  │     so the browser can HTTP-Range-fetch one paper's chunks.
  │
  ├─→ MiniLM chunk embeddings
  │     all-MiniLM-L6-v2, normalized to unit length, packed as fp16
  │     concatenated rows → embeddings.f16.bin + embeddings.meta.json
  │
  ├─→ BM25 postings
  │     Simple tokenize (lowercase, [a-z0-9]+, stopword-filter, ≥2 chars)
  │     → bm25.json (postings, df, doc_lens, k1=1.5, b=0.75, stopwords)
  │
  ├─→ KG node embeddings
  │     Embed `f"{name}. {provenance}"` for every concept node →
  │     kg_node_embeddings.f16.bin + kg_node_meta.json (for entity link)
  │
  └─→ Lean KG
        Strip `provenance` strings + confidence floats →
        kg_lean.json (~1.5 MB vs 6 MB for the full graph)
```

All offline artifacts land under `public/data/index/` (plus
`public/data/kg_lean.json`) and are committed to git.

### Why these specific choices

- **MiniLM-L6-v2 over OpenAI / Voyage / Gemini text-embedding-004.**
  - Open weights, runs identically in Python (sentence-transformers)
    and in the browser (`@xenova/transformers`). Precompute and runtime
    sit in the **same** 384-d unit-length space — no drift.
  - 384-d × fp16 × 12k chunks ≈ 5 MB. Storage is a constraint on a
    free static host.
  - Defensible baseline: an ML interviewer recognizes MiniLM as "the
    right default" rather than chasing the latest leaderboard model.
- **Section-aware chunking over fixed-character windows.** Chunking on
  `<sec>` boundaries preserves the structural unit of meaning in a
  scientific paper (Methods is a different document than Results). The
  600-token target sits comfortably inside MiniLM's 256-token window
  after subword tokenization. The 100-token sentence-boundary overlap
  handles answers that straddle a chunk seam.
- **fp16 binary + HTTP Range over base64-in-JSON.** fp16 is half the
  bandwidth of fp32, and binary is half the bandwidth of base64.
  HTTP Range lets the browser pull just the slice of a shard it needs
  (~5 KB per paper) instead of the full ~3 MB shard.
- **BM25 with no stemming.** With MiniLM dense retrieval doing the
  heavy lifting on synonyms and paraphrases, Porter stemming on the
  sparse side gives a small Recall@10 lift (~3-5 %) but introduces a
  drift risk between the Python and JS implementations. The cost is
  not worth it — we ship the **exact** stopword list inside `bm25.json`
  so the JS tokenizer reuses it byte-for-byte.

---

## Runtime pipeline (browser)

```
            user question
                  │
                  ▼
       ┌───────────────────────┐
       │  embedQuery (MiniLM)  │ ← lazy-loaded transformers.js (~25 MB)
       └───────────────────────┘
                  │
       ┌──────────┼──────────────────────┐
       ▼          ▼                      ▼
  ┌─────────┐ ┌─────────┐         ┌────────────┐
  │  BM25   │ │  Dense  │         │  GraphRAG  │
  │ ~10 ms  │ │ ~10 ms  │         │  ~5 ms     │
  │postings │ │fp16 dot │         │entity link │
  │ scoring │ │ product │         │1-hop walk  │
  └─────────┘ └─────────┘         └────────────┘
       │          │                      │
       │          │            (paper score = Σ matched-concept-overlap
       │          │              × 1 / log(1 + |mentions|))
       │          │                      │
       │          ▼                      ▼
       │   roll chunks up to papers (max score per paper)
       │          │                      │
       └──────────┴──────────────────────┘
                       ▼
            RRF fusion (k = 60)            ← top-20 candidates
                       │
                       ▼
        Gemini listwise rerank (top-20 → top-5)
        responseMimeType: application/json   ← structured output
                       │
                       ▼
       UI: matched-concept chips, provenance badges,
            timings; matched stars pulse in galaxy
```

Owner files in `src/rag/`:

| File | Role |
|---|---|
| `embedder.js` | Lazy-load MiniLM, embed a query → Float32Array(384). |
| `bm25.js` | Load `bm25.json`, score against postings. |
| `vectorSearch.js` | Load `embeddings.f16.bin`, brute-force cosine. |
| `graphRetriever.js` | Entity-link + 1-hop subgraph + dampened paper scoring. |
| `pipeline.js` | Orchestrate parallel retrievers + RRF + timings. |
| `reranker.js` | One Gemini call, structured JSON, top-20 → top-5. |
| `chunks.js` | HTTP-Range-fetch chunk text by `chunk_id` for citations. |
| `gemini.js` | `generateContent` + `streamGenerateContent` (SSE) with BYOK + abort signal. |
| `apiKey.js` | localStorage BYOK + `models.list` validation. |

### Why these specific choices

- **Brute-force cosine over 12k vectors instead of HNSW.** 12k × 384
  fp16 dot products run in ~10 ms in a typed-array loop. Building
  HNSW / IVF here would be over-engineering, and the fact that you
  *didn't* is a signal to a careful reviewer.
- **Reciprocal Rank Fusion (k = 60).** Textbook, parameter-free, the
  right hybrid baseline when you don't have labeled retrieval data to
  learn a weighted combination.
- **Listwise LLM rerank with `responseSchema`.** Single Gemini call,
  JSON-only output (no free-form parsing fragility), top-20 → top-5.
  The prompt is short and instructed to prefer passages with numbers
  / methods / causal claims over generic background.
- **Streaming generation with `AbortController`.** SSE `alt=sse`, async
  iterator yields token deltas. The chat UI shows a Stop button while
  streaming. Conversation memory is last 6 turns sent verbatim; the
  "summary-buffer" pattern (compress older turns) is a follow-up.

### Why the knowledge graph is visible in the UI

Most hackathon RAGs ship the KG as a metadata blob the user never
sees. Star Engine **surfaces matched concepts as chips** in the
results modal, and **pulses the matched stars in the 3D galaxy**.
That visual link is the moment the KG stops being decoration and
becomes a citation interface. A graph isn't "in the system" if you
can't see it doing work.

---

## Evaluation

A Recall@10 starter eval lives in `notebooks/build_rag_index.ipynb`
(cell 14). Six hand-picked `(query, gold-pmc_id)` pairs scored against
each retrieval method. Expand to 20+ before quoting numbers.

| Method | Recall@10 (TBD — run notebook 03) |
|---|---|
| BM25 only | _ |
| Dense only | _ |
| Hybrid (RRF) | _ |
| Hybrid + GraphRAG | _ |

Numbers will be filled in here once the notebook has been run end-to-end.

---

## Honest limitations

- **No labeled retrieval data.** The eval set is hand-written by one
  author and biased toward queries that already align with the
  knowledge graph's vocabulary. Numbers are directional, not absolute.
- **Hybrid weights are RRF (parameter-free), not learned.** A real
  product would A/B test learned fusion weights once enough query logs
  exist.
- **GraphRAG entity linking is cosine-only, no NER.** Many real query
  terms (e.g. specific gene names) don't have a clean cosine match
  against KG nodes. A tiny NER head would help; we picked the simpler
  route to ship.
- **Reranker is a single LLM call.** A cross-encoder reranker is
  cheaper at scale and runnable locally via `@xenova/transformers`.
  Listed under *What's next*.
- **No multi-paper synthesis.** Each answer is grounded in retrieved
  passages from a few papers; combining findings across many papers
  (map-reduce summarization) is a planned extension.

## What's next

1. **Cross-encoder rerank** as a `Fully-local mode` toggle in Settings —
   `Xenova/ms-marco-MiniLM-L-6-v2`. Removes the Gemini call from the
   rerank stage so the entire retrieval+rerank pipeline is offline.
2. **Map-reduce multi-paper synthesis** for queries like "what did the
   literature converge on for bone loss countermeasures?".
3. **Real NER on the query** before KG entity linking. A small
   distil-NER model finds genes/proteins/organisms; matched span
   strings re-link to KG nodes via exact + fuzzy match.
4. **Summary-buffer conversation memory.** Compress older turns into
   a rolling summary so multi-turn conversations stay coherent past 6
   turns without blowing up the prompt.
5. **Visible chunk citations.** Hover a citation chip → side drawer
   shows the exact chunk text + section name.
6. **Eval expansion.** 50+ hand-labeled questions across paper types
   and query difficulties, broken out by retriever for honest ablation.

## Source map

```
star-engine/
  index.html                                    Vite root
  vite.config.js                                base: './'  → dual-deploy
  package.json
  public/
    data/
      publications.json
      knowledge_graph.json                      full KG (lazy)
      kg_lean.json                              runtime KG, ~1.5 MB
      index/
        bm25.json
        embeddings.f16.bin, .meta.json
        kg_node_embeddings.f16.bin, kg_node_meta.json
        chunks/manifest.json, 0000.jsonl … 0009.jsonl
    favicon.svg
  src/
    main.jsx, App.jsx, index.css
    galaxy/    GalaxyView.jsx, processRealData.js, constants.js
    chat/      ResearchHub.jsx, PaperChat.jsx, GeminiSearchResultsModal.jsx,
               Citations.jsx, HypothesisBuilder.jsx
    rag/       embedder.js, tokenizer.js, bm25.js, vectorSearch.js,
               graphRetriever.js, pipeline.js, reranker.js, chunks.js,
               gemini.js, apiKey.js, paperText.js, assetUrl.js
    state/     store.js (zustand)
    ui/        ApiKeyModal.jsx, MarkdownRenderer.jsx, HowItWorks.jsx
  notebooks/
    build_rag_index.ipynb                       chunks + embeddings + BM25 + eval
  .github/workflows/deploy.yml                  GH Pages + Hostinger FTP
  docs/ARCHITECTURE.md                          (you are here)
  README.md, LICENSE (MIT)
```

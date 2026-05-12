# Star Engine: NASA Space Biology AI Engine (RAG & Knowledge Graph)

<p align="center">
  <strong>An interactive 3D AI-powered search engine built for the NASA Space Apps Challenge 2025: <em>"Build a Space Biology Knowledge Engine"</em>.</strong><br>
  Explore 494 NASA space-biology papers with an advanced hybrid RAG and Knowledge Graph retrieval system running entirely in your browser.
</p>

<p align="center">
  <a href="https://starengineai.space">Live demo</a>
  &nbsp;·&nbsp;
  <a href="docs/ARCHITECTURE.md">Architecture</a>
  &nbsp;·&nbsp;
  <a href="notebooks/build_rag_index.ipynb">Indexing notebook</a>
</p>

---

This project was developed for the **NASA Space Apps Challenge 2025** to tackle the *"Build a Space Biology Knowledge Engine"* challenge. It serves as a comprehensive portfolio piece demonstrating state-of-the-art AI, Retrieval-Augmented Generation (RAG), and data visualization. 

The core of the engine is an intelligent retrieval and extraction pipeline:

- **Hybrid retrieval** — BM25 + MiniLM dense embeddings, fused with Reciprocal Rank Fusion (k = 60).
- **Knowledge Graph (KG) & GraphRAG** — The query is entity-linked to KG concept nodes (Organisms, Molecules, Conditions, etc.). The 1-hop subgraph boosts papers that share concepts with the query, and the matched stars **pulse in the 3D galaxy** as you watch the answer stream. The knowledge graph is load-bearing, not just decorative, and can be explored interactively via the 2D/3D visualization UI.
- **Listwise LLM rerank** — top-20 candidates collapsed to top-5 with
  one structured-JSON Gemini call.
- **Streaming generation + conversation memory** — Gemini SSE,
  cancellable, last-6-turns history sent with every reply.
- **Bring your own key (BYOK)** — your Gemini API key is stored only
  in your browser's `localStorage`. Nothing ever ships with secrets.

All retrieval — embedding, BM25, vector cosine, KG entity-link — runs
**locally in your browser** against precomputed static artifacts. The
user's Gemini key is reserved for the rerank and generation steps.

## Tech stack

- **Frontend** — React 18 · Three.js · Vite · Tailwind CSS
- **Retrieval (browser)** — `@xenova/transformers` (MiniLM-L6-v2 in WASM),
  hand-rolled BM25, brute-force cosine over fp16 typed arrays, Zustand
- **Generation** — Google Gemini Flash, streaming SSE
- **Offline indexing (Python / Colab)** — `sentence-transformers`,
  `rank-bm25`, `lxml`, section-aware JATS chunking
- **CI / hosting** — GitHub Actions → GitHub Pages + Hostinger (FTP) at
  `starengineai.space`

## Live demo

- Production: <https://starengineai.space>
- GitHub Pages mirror: `https://<your-github-username>.github.io/StarEngine/`

Both URLs serve the same `dist/` (Vite is configured with `base: './'`).
The CI pipeline at `.github/workflows/deploy.yml` builds once and
publishes to both targets in parallel on every push to `main`.

## Run locally

```bash
git clone https://github.com/<your-github-username>/StarEngine
cd StarEngine
npm install
npm run dev
```

Then open <http://localhost:5173/>, paste a Gemini API key when prompted
(free at <https://aistudio.google.com/apikey>), and explore.

> **Note:** retrieval needs the precomputed index files under
> `public/data/index/`. They aren't in the repo yet — run the indexing
> notebook once and commit the outputs (see below).

## Rebuild the retrieval index

The retrieval artifacts (chunks, embeddings, BM25 postings, lean KG)
are produced by a single notebook:

```
notebooks/build_rag_index.ipynb
```

Run it locally: it auto-detects the project root from `package.json`
+ `public/data/*` markers, and walks `data/papers/{pmc_id}/full_text.xml`
for the raw inputs. There is a `PROJECT_ROOT_OVERRIDE` at the top of the
setup cell for remote-kernel setups (Colab, JupyterHub). Runtime is
~3–10 minutes total; the embedding pass auto-uses CUDA if available.
Outputs:

```
public/data/index/
  chunks/manifest.json + chunks/{0000..0009}.jsonl
  embeddings.f16.bin + embeddings.meta.json
  kg_node_embeddings.f16.bin + kg_node_meta.json
  bm25.json
public/data/kg_lean.json
```

Commit those under `public/data/` and the site picks them up. Total
size: ~12 MB. The 65 MB of raw JATS XML stays gitignored — runtime
never needs it.

## Deploy

Push to `main` and `.github/workflows/deploy.yml` does the rest:

1. `npm ci && npm run build` (Vite, base `./`)
2. Upload `dist/` to GitHub Pages via `actions/deploy-pages@v4`
3. Mirror `dist/` to Hostinger's `public_html/` via FTP (requires
   `HOSTINGER_FTP_HOST`, `HOSTINGER_FTP_USER`, `HOSTINGER_FTP_PASSWORD`
   repo secrets)

Set `vars.HOSTINGER_ENABLED=false` to skip the Hostinger leg (useful
for forks).

## Architecture

The 60-second pitch lives in the in-app **How it works** modal
(question-mark icon in the sidebar). The deeper version with
rationale + honest limitations is at [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

```
            user question
                  │
                  ▼
       embedQuery (MiniLM, in browser)
                  │
       ┌──────────┼──────────────────────┐
       ▼          ▼                      ▼
     BM25     Dense (fp16)         GraphRAG
   ~10 ms     ~10 ms                ~5 ms
       │          │                      │
       └──────────┴──────────────────────┘
                       ▼
          Reciprocal Rank Fusion (k=60), top-20
                       │
                       ▼
       Gemini listwise rerank → top-5
                       │
                       ▼
        UI: matched stars pulse in galaxy,
            citation chips with provenance
```

## Repository tour

```
src/
  galaxy/      3D galaxy (Three.js) — stars, constellations, pulse-on-citation
  chat/        ResearchHub, PaperChat (streaming + history),
               GeminiSearchResultsModal, Citations
  rag/         The retrieval pipeline:
                 embedder.js · tokenizer.js · bm25.js · vectorSearch.js
                 graphRetriever.js · pipeline.js · reranker.js · chunks.js
                 gemini.js · apiKey.js · paperText.js · assetUrl.js
  ui/          ApiKeyModal, HowItWorks, MarkdownRenderer
  state/       store.js (zustand)
notebooks/     build_rag_index — chunks + MiniLM embeddings + BM25 + KG eval
docs/          ARCHITECTURE.md
public/data/   publications.json, knowledge_graph.json, kg_lean.json,
               index/ (precomputed retrieval artifacts)
```

## Credits

- Source dataset: NASA Open Science Data Repository / Space Apps 2025
- Full-text content: PubMed Central (PMC) OAI API
- Embedding model: `sentence-transformers/all-MiniLM-L6-v2`
- Original Space Apps 2025 submission — preserved in the initial git
  commit (the pre-refactor `index.html` and `Papers_Extraction_and_Processing.ipynb`)

## License

[MIT](LICENSE). Data attribution details inside the license file.

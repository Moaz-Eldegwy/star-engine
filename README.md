# Star Engine

A 3D-galaxy exploration of **494 NASA space-biology papers**, powered by a
knowledge graph and a fully in-browser RAG pipeline.

> **Status:** Active refactor in progress (Phases 0–6 of a portfolio-grade
> rebuild). The original NASA Space Apps 2025 submission lives in the initial
> commits; subsequent commits introduce hybrid retrieval, GraphRAG, and a
> Vite + React modular structure. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
> (coming soon) for the full design.

## Live demo

- GitHub Pages: `https://<your-github-username>.github.io/StarEngine/`
- Production: <https://starengineai.space>

## What makes it different

Most hackathon RAGs stop at "stuff text into a prompt." Star Engine treats the
knowledge graph as a load-bearing retrieval index:

1. **Hybrid retrieval** — BM25 + MiniLM dense embeddings, fused with
   Reciprocal Rank Fusion.
2. **GraphRAG** — query terms are entity-linked to KG nodes; the 1-hop
   subgraph boosts papers that share concepts with the query, and the
   matched stars **pulse in the 3D view** as the answer streams.
3. **LLM listwise rerank** — top-30 candidates collapsed to top-5 with one
   structured-JSON Gemini call.
4. **Streaming, cited answers** — inline `[#]` citations that link back to
   the paper, the chunk, and the galaxy.
5. **Conversation memory** — last-6-turns + rolling summary, persisted in
   IndexedDB.
6. **Bring your own key (BYOK)** — your Gemini key is stored only in your
   browser's `localStorage`; the project ships no secrets.

## Tech stack

- **Frontend:** React 18 · Three.js · Vite · Tailwind
- **Retrieval (browser):** `@xenova/transformers` (MiniLM-L6-v2) ·
  hand-rolled BM25 · brute-force cosine over fp16 typed arrays
- **Generation:** Google Gemini (Flash) via streaming SSE
- **Offline indexing:** Python / Jupyter — JATS XML → section-aware chunks →
  fp16 embeddings → BM25 postings → lean KG

## Quickstart (coming together over the next commits)

```bash
git clone https://github.com/<your-github-username>/StarEngine
cd StarEngine
npm install
npm run dev
```

Then open `http://localhost:5173/`, paste a Gemini API key when prompted
(free at <https://aistudio.google.com/apikey>), and explore.

## Rebuilding the indices

Run the three notebooks in order:

```
notebooks/01_fetch_and_parse.ipynb
notebooks/02_extract_kg.ipynb
notebooks/03_build_rag_index.ipynb
```

The first downloads the raw JATS XML from PMC, the second runs Gemini
extraction to build the knowledge graph, and the third produces the
precomputed retrieval artifacts shipped under `public/data/index/`.

API keys for the notebooks must be supplied via the `GEMINI_API_KEYS`
environment variable (comma-separated) or Colab Secret with the same name —
never hardcoded.

## Credits

- Source dataset: NASA Open Science Data Repository, Space Apps 2025
- Full-text content: PubMed Central (PMC) OAI API
- Built originally for the NASA Space Apps Challenge 2025

## License

[MIT](LICENSE).

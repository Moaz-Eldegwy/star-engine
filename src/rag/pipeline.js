// Hybrid retrieval orchestrator.
//
//   query
//     ├─→ embedQuery         (MiniLM in the browser)
//     │
//     ├─→ searchBM25         (sparse postings, ~10 ms)
//     ├─→ searchDense        (fp16 cosine, ~10 ms)
//     └─→ graphRetrieve      (KG entity-link + 1-hop, ~5 ms)
//                │
//                ▼
//        rollUpToPapers (max chunk score per paper)
//                │
//                ▼
//        rrfFuse(k=60)  ← combine the three ranked lists
//                │
//                ▼
//        attach matchedNodes & retrieval-trace metadata
//                │
//                ▼
//        return { papers, matchedNodes, chunks }
//
// All three retrievers run in parallel. Phase 5 will add an LLM rerank
// step that takes the top-30 paper × chunk pairs and Gemini-rerank them
// to top-5 with structured-JSON output.

import { embedQuery } from './embedder.js';
import { searchBM25 } from './bm25.js';
import { searchDense } from './vectorSearch.js';
import { graphRetrieve } from './graphRetriever.js';

const RRF_K = 60;

/**
 * Roll chunk-level scores up to paper-level scores by taking the max
 * score across chunks belonging to each paper, then convert to a ranked
 * paper list.
 *
 * @param {Array<{ chunkId: string, score: number }>} chunkHits
 * @returns {Array<{ pmcId: string, score: number, bestChunkId: string }>}
 */
function rollUpToPapers(chunkHits) {
  const best = new Map();
  for (const hit of chunkHits) {
    // chunk_id format from the notebook: "<pmc_id>:<section>:<i>"
    const pmcId = hit.chunkId.split(':', 1)[0];
    const prev = best.get(pmcId);
    if (!prev || hit.score > prev.score) {
      best.set(pmcId, { pmcId, score: hit.score, bestChunkId: hit.chunkId });
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}

/**
 * Reciprocal Rank Fusion across N ranked lists.
 *
 * @param {Array<Array<{ pmcId: string }>>} rankings
 * @param {{ topK?: number, k?: number }} opts
 * @returns {Array<{ pmcId: string, score: number, sources: string[] }>}
 */
function rrfFuse(rankings, { topK = 30, k = RRF_K } = {}) {
  const acc = new Map();
  rankings.forEach((list, listIdx) => {
    list.forEach((item, rank) => {
      const prev = acc.get(item.pmcId) || { pmcId: item.pmcId, score: 0, sources: [] };
      prev.score += 1 / (k + rank + 1);
      prev.sources.push(listIdx === 0 ? 'bm25' : listIdx === 1 ? 'dense' : 'graph');
      acc.set(item.pmcId, prev);
    });
  });
  return [...acc.values()].sort((a, b) => b.score - a.score).slice(0, topK);
}

/**
 * Run the full hybrid retrieval pipeline for one query.
 *
 * @param {string} query
 * @param {{ topK?: number, includeGraph?: boolean }} opts
 * @returns {Promise<{
 *   query: string,
 *   papers: Array<{ pmcId: string, score: number, sources: string[], bestChunkId?: string }>,
 *   matchedNodes: Array<{ id: string, name: string, label: string, similarity: number }>,
 *   bm25Hits: Array<{ chunkId: string, score: number }>,
 *   denseHits: Array<{ chunkId: string, score: number }>,
 *   timings: { embed: number, bm25: number, dense: number, graph: number, fuse: number, total: number }
 * }>}
 */
export async function hybridRetrieve(query, { topK = 30, includeGraph = true } = {}) {
  const t0 = performance.now();
  const trimmed = (query || '').trim();
  if (!trimmed) {
    return {
      query: '',
      papers: [],
      matchedNodes: [],
      bm25Hits: [],
      denseHits: [],
      timings: { embed: 0, bm25: 0, dense: 0, graph: 0, fuse: 0, total: 0 },
    };
  }

  // Kick off all three retrievers in parallel. BM25 doesn't need the
  // embedding so it starts immediately; dense and graph wait on embedding.
  const tEmbedStart = performance.now();
  const queryVecPromise = embedQuery(trimmed);

  const bm25Promise = (async () => {
    const t = performance.now();
    const r = await searchBM25(trimmed, { topK: 100 });
    return { hits: r, ms: performance.now() - t };
  })();

  const queryVec = await queryVecPromise;
  const tEmbed = performance.now() - tEmbedStart;

  const densePromise = (async () => {
    const t = performance.now();
    const r = await searchDense(queryVec, { topK: 100 });
    return { hits: r, ms: performance.now() - t };
  })();

  const graphPromise = includeGraph
    ? (async () => {
        const t = performance.now();
        const r = await graphRetrieve(queryVec, { topNodes: 3, threshold: 0.45 });
        return { ...r, ms: performance.now() - t };
      })()
    : Promise.resolve({ matchedNodes: [], paperScores: new Map(), ms: 0 });

  const [bm25R, denseR, graphR] = await Promise.all([bm25Promise, densePromise, graphPromise]);

  const tFuseStart = performance.now();
  const bm25Papers = rollUpToPapers(bm25R.hits);
  const densePapers = rollUpToPapers(denseR.hits);
  const graphPapers = [...graphR.paperScores.entries()]
    .map(([pmcId, score]) => ({ pmcId, score }))
    .sort((a, b) => b.score - a.score);

  const fused = rrfFuse([bm25Papers, densePapers, graphPapers], { topK });

  // Attach bestChunkId from whichever ranking produced the highest-confidence hit.
  const chunkLookup = new Map();
  for (const p of [...bm25Papers, ...densePapers]) {
    if (p.bestChunkId && !chunkLookup.has(p.pmcId)) chunkLookup.set(p.pmcId, p.bestChunkId);
  }
  const papers = fused.map((p) => ({
    ...p,
    bestChunkId: chunkLookup.get(p.pmcId),
  }));
  const tFuse = performance.now() - tFuseStart;

  return {
    query: trimmed,
    papers,
    matchedNodes: graphR.matchedNodes,
    bm25Hits: bm25R.hits.slice(0, 10),
    denseHits: denseR.hits.slice(0, 10),
    timings: {
      embed: Math.round(tEmbed),
      bm25: Math.round(bm25R.ms),
      dense: Math.round(denseR.ms),
      graph: Math.round(graphR.ms || 0),
      fuse: Math.round(tFuse),
      total: Math.round(performance.now() - t0),
    },
  };
}

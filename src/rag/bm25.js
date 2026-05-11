// In-browser BM25 scorer.
//
// Loads the precomputed `public/data/index/bm25.json` (postings, df, doc
// lengths, k1, b, stopwords, chunk_ids) and scores a query against every
// chunk. Returns ranked chunk indices.
//
// At our scale (~12k chunks, ~30k vocab terms after stopword + singleton
// pruning), full scoring takes < 20 ms in the browser — no need for
// fancy index structures.

import { assetUrl } from './assetUrl.js';
import { tokenize } from './tokenizer.js';

let _state = null;          // cached parsed bm25.json
let _stopsSet = null;       // cached Set<string>
let _loadingPromise = null; // dedupe concurrent first-load callers

async function loadIndex() {
  if (_state) return _state;
  if (_loadingPromise) return _loadingPromise;
  _loadingPromise = (async () => {
    const res = await fetch(assetUrl('data/index/bm25.json'));
    if (!res.ok) throw new Error(`Failed to load bm25.json: HTTP ${res.status}`);
    _state = await res.json();
    _stopsSet = new Set(_state.stops || []);
    return _state;
  })();
  return _loadingPromise;
}

export async function bm25Stats() {
  const s = await loadIndex();
  return {
    n: s.N,
    avgdl: s.avgdl,
    vocab: Object.keys(s.df).length,
    k1: s.k1,
    b: s.b,
  };
}

/**
 * Score a query against the BM25 index.
 *
 * @param {string} query
 * @param {{ topK?: number }} opts
 * @returns {Promise<Array<{ chunkIndex: number, chunkId: string, score: number }>>}
 */
export async function searchBM25(query, { topK = 100 } = {}) {
  const s = await loadIndex();
  const { k1, b, N, avgdl, doc_lens, df, postings, chunk_ids } = s;

  const terms = tokenize(query, _stopsSet);
  if (terms.length === 0) return [];

  const scores = new Float32Array(N);
  // De-duplicate query terms (a repeated query term should not double-count
  // in standard BM25 — the IDF * tf scaling is per unique term).
  const seen = new Set();
  for (const term of terms) {
    if (seen.has(term)) continue;
    seen.add(term);
    const plist = postings[term];
    if (!plist) continue;
    const idf = Math.log(1 + (N - plist.length + 0.5) / (plist.length + 0.5));
    for (const [docIdx, tf] of plist) {
      const dl = doc_lens[docIdx];
      const denom = tf + k1 * (1 - b + (b * dl) / avgdl);
      scores[docIdx] += (idf * tf * (k1 + 1)) / (denom || 1e-6);
    }
  }

  // Pick top-K by partial sort (heap would be optimal; N is small).
  const out = [];
  for (let i = 0; i < N; i++) {
    if (scores[i] > 0) out.push({ chunkIndex: i, chunkId: chunk_ids[i], score: scores[i] });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, topK);
}

export async function getChunkIds() {
  const s = await loadIndex();
  return s.chunk_ids;
}

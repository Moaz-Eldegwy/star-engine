// In-browser dense retrieval over MiniLM chunk embeddings.
//
// The notebook writes embeddings as a single concatenated fp16 binary
// (`embeddings.f16.bin`) with sidecar `embeddings.meta.json` that gives
// dim, row count, and the chunk_id at each row. At load time we mmap-style
// view that buffer as a Float32Array (after upcast) so the brute-force
// cosine loop runs at typed-array speed: ~10 ms for 12k × 384 dot products
// on a laptop. No ANN index needed at this scale.

import { assetUrl } from './assetUrl.js';

let _meta = null;
let _emb32 = null; // Float32Array of shape (rows * dim,)
let _loadingPromise = null;

// Promote a packed fp16 buffer (Uint16Array view) into a Float32Array.
// fp16 → fp32: 1-bit sign, 5-bit exponent (bias 15), 10-bit mantissa.
function fp16ToFp32(u16, dst) {
  for (let i = 0; i < u16.length; i++) {
    const h = u16[i];
    const sign = (h & 0x8000) >> 15;
    const exp = (h & 0x7c00) >> 10;
    const frac = h & 0x03ff;
    let f;
    if (exp === 0) {
      f = (frac / 1024) * Math.pow(2, -14);
    } else if (exp === 0x1f) {
      f = frac === 0 ? Infinity : NaN;
    } else {
      f = (1 + frac / 1024) * Math.pow(2, exp - 15);
    }
    dst[i] = sign ? -f : f;
  }
}

async function loadIndex() {
  if (_meta && _emb32) return { meta: _meta, emb32: _emb32 };
  if (_loadingPromise) return _loadingPromise;
  _loadingPromise = (async () => {
    const [metaRes, binRes] = await Promise.all([
      fetch(assetUrl('data/index/embeddings.meta.json')),
      fetch(assetUrl('data/index/embeddings.f16.bin')),
    ]);
    if (!metaRes.ok) throw new Error(`Failed to load embeddings.meta.json (HTTP ${metaRes.status})`);
    if (!binRes.ok) throw new Error(`Failed to load embeddings.f16.bin (HTTP ${binRes.status})`);
    _meta = await metaRes.json();
    const buf = await binRes.arrayBuffer();
    const u16 = new Uint16Array(buf);
    const expected = _meta.rows * _meta.dim;
    if (u16.length !== expected) {
      throw new Error(
        `embeddings.f16.bin size mismatch: got ${u16.length} fp16 values, expected ${expected}`,
      );
    }
    _emb32 = new Float32Array(expected);
    fp16ToFp32(u16, _emb32);
    return { meta: _meta, emb32: _emb32 };
  })();
  return _loadingPromise;
}

export async function vectorIndexStats() {
  const { meta } = await loadIndex();
  return { rows: meta.rows, dim: meta.dim, model: meta.model };
}

/**
 * Brute-force cosine over the precomputed chunk embeddings.
 *
 * @param {Float32Array} queryVec   unit-length query embedding (384-d)
 * @param {{ topK?: number }} opts
 * @returns {Promise<Array<{ chunkIndex: number, chunkId: string, score: number }>>}
 */
export async function searchDense(queryVec, { topK = 100 } = {}) {
  const { meta, emb32 } = await loadIndex();
  const { rows, dim } = meta;
  if (queryVec.length !== dim) {
    throw new Error(`Query dim ${queryVec.length} != index dim ${dim}`);
  }
  const scores = new Float32Array(rows);
  for (let r = 0; r < rows; r++) {
    let s = 0;
    const base = r * dim;
    for (let d = 0; d < dim; d++) s += emb32[base + d] * queryVec[d];
    scores[r] = s;
  }
  // Partial top-K via single pass with a tiny min-heap-like structure
  // (small K, so linear insertion is fine).
  const heap = [];
  for (let i = 0; i < rows; i++) {
    const score = scores[i];
    if (heap.length < topK) {
      heap.push({ chunkIndex: i, chunkId: meta.chunk_ids[i], score });
      heap.sort((a, b) => a.score - b.score);
    } else if (score > heap[0].score) {
      heap[0] = { chunkIndex: i, chunkId: meta.chunk_ids[i], score };
      heap.sort((a, b) => a.score - b.score);
    }
  }
  return heap.sort((a, b) => b.score - a.score);
}

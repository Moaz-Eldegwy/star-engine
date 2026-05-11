// Fetch chunk text by chunk_id, range-fetching just the relevant shard
// slice rather than downloading the whole 3-4 MB shard file.
//
// The notebook writes `chunks/manifest.json` mapping each pmc_id to a
// (shard, byte_offset, byte_length) tuple. Each shard is a JSONL file
// where consecutive lines all share the same pmc_id. So one HTTP Range
// request gives us every chunk for a paper in ~5 KB.

import { assetUrl } from './assetUrl.js';

let _manifest = null;
let _manifestPromise = null;
const _chunksByPaper = new Map(); // pmc_id -> array of chunk objects

async function loadManifest() {
  if (_manifest) return _manifest;
  if (_manifestPromise) return _manifestPromise;
  _manifestPromise = (async () => {
    const res = await fetch(assetUrl('data/index/chunks/manifest.json'));
    if (!res.ok) throw new Error(`chunks manifest: HTTP ${res.status}`);
    _manifest = await res.json();
    return _manifest;
  })();
  return _manifestPromise;
}

async function fetchPaperChunks(pmcId) {
  if (_chunksByPaper.has(pmcId)) return _chunksByPaper.get(pmcId);
  const manifest = await loadManifest();
  const entry = manifest[pmcId];
  if (!entry) {
    _chunksByPaper.set(pmcId, []);
    return [];
  }
  const shardUrl = assetUrl(`data/index/chunks/${String(entry.shard).padStart(4, '0')}.jsonl`);
  const start = entry.byte_offset;
  const end = entry.byte_offset + entry.byte_length - 1;
  const res = await fetch(shardUrl, {
    headers: { Range: `bytes=${start}-${end}` },
  });
  // Some static hosts ignore Range — fall back to full download in that case.
  let text;
  if (res.status === 206 || res.status === 200) {
    text = await res.text();
    if (res.status === 200) {
      // Full shard. Slice to just our paper's bytes.
      const fullBytes = new TextEncoder().encode(text);
      text = new TextDecoder().decode(fullBytes.slice(start, start + entry.byte_length));
    }
  } else {
    throw new Error(`shard fetch HTTP ${res.status}`);
  }
  const chunks = text
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  _chunksByPaper.set(pmcId, chunks);
  return chunks;
}

/** Resolve a chunk_id to its full chunk object. */
export async function getChunk(chunkId) {
  const pmcId = chunkId.split(':', 1)[0];
  const chunks = await fetchPaperChunks(pmcId);
  return chunks.find((c) => c.chunk_id === chunkId) || null;
}

/** Resolve many chunk_ids at once (deduplicated by paper). */
export async function getChunks(chunkIds) {
  const wantedByPaper = new Map();
  for (const id of chunkIds) {
    const pid = id.split(':', 1)[0];
    if (!wantedByPaper.has(pid)) wantedByPaper.set(pid, new Set());
    wantedByPaper.get(pid).add(id);
  }
  const out = new Map();
  await Promise.all(
    [...wantedByPaper.entries()].map(async ([pid, wanted]) => {
      const chunks = await fetchPaperChunks(pid);
      for (const c of chunks) {
        if (wanted.has(c.chunk_id)) out.set(c.chunk_id, c);
      }
    }),
  );
  return chunkIds.map((id) => out.get(id)).filter(Boolean);
}

/** Get all chunks for a single paper (used by PaperChat for in-paper RAG). */
export async function getAllChunksForPaper(pmcId) {
  return fetchPaperChunks(pmcId);
}

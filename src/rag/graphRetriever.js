// GraphRAG: entity-link a query to concept nodes in the knowledge graph,
// walk the 1-hop subgraph, and produce a score-per-paper that reflects
// how many distinct query-matched concepts each paper "CONTAINS".
//
// This is what makes the knowledge graph load-bearing rather than
// decorative. The matched subgraph is returned alongside the scores so
// the UI can pulse the corresponding stars in the 3D view.

import { assetUrl } from './assetUrl.js';

let _leanKg = null;
let _nodeEmb32 = null;
let _nodeMeta = null;
let _paperIndex = null; // paper_pmc_id -> Set<concept_node_id>
let _loadingPromise = null;

function fp16ToFp32(u16, dst) {
  for (let i = 0; i < u16.length; i++) {
    const h = u16[i];
    const sign = (h & 0x8000) >> 15;
    const exp = (h & 0x7c00) >> 10;
    const frac = h & 0x03ff;
    let f;
    if (exp === 0) f = (frac / 1024) * Math.pow(2, -14);
    else if (exp === 0x1f) f = frac === 0 ? Infinity : NaN;
    else f = (1 + frac / 1024) * Math.pow(2, exp - 15);
    dst[i] = sign ? -f : f;
  }
}

async function loadGraphResources() {
  if (_leanKg) return { leanKg: _leanKg, nodeEmb32: _nodeEmb32, nodeMeta: _nodeMeta, paperIndex: _paperIndex };
  if (_loadingPromise) return _loadingPromise;
  _loadingPromise = (async () => {
    const [kgRes, metaRes, binRes] = await Promise.all([
      fetch(assetUrl('data/kg_lean.json')),
      fetch(assetUrl('data/index/kg_node_meta.json')),
      fetch(assetUrl('data/index/kg_node_embeddings.f16.bin')),
    ]);
    if (!kgRes.ok) throw new Error(`kg_lean.json: HTTP ${kgRes.status}`);
    if (!metaRes.ok) throw new Error(`kg_node_meta.json: HTTP ${metaRes.status}`);
    if (!binRes.ok) throw new Error(`kg_node_embeddings.f16.bin: HTTP ${binRes.status}`);
    _leanKg = await kgRes.json();
    _nodeMeta = await metaRes.json();
    const buf = await binRes.arrayBuffer();
    const u16 = new Uint16Array(buf);
    _nodeEmb32 = new Float32Array(_nodeMeta.rows * _nodeMeta.dim);
    fp16ToFp32(u16, _nodeEmb32);

    // Build pmc_id -> Set<concept_node_id> for fast 1-hop lookups.
    // The full graph has explicit CONTAINS edges from paper:* to concept:*;
    // the lean graph keeps `paper_mentions` on each concept node, which is
    // the dual representation.
    _paperIndex = new Map();
    for (const node of _leanKg.nodes) {
      if (node.label === 'Paper' || !node.paper_mentions) continue;
      for (const pid of node.paper_mentions) {
        if (!_paperIndex.has(pid)) _paperIndex.set(pid, new Set());
        _paperIndex.get(pid).add(node.id);
      }
    }
    return { leanKg: _leanKg, nodeEmb32: _nodeEmb32, nodeMeta: _nodeMeta, paperIndex: _paperIndex };
  })();
  return _loadingPromise;
}

/**
 * Entity-link a query embedding to KG concept nodes (top-N cosine, with
 * a similarity threshold), then walk the 1-hop subgraph to collect
 * candidate papers and rank them by concept-overlap count (dampened by
 * 1 / log(1 + degree) so universally-mentioned hub concepts don't drown
 * everything out).
 *
 * @param {Float32Array} queryVec   unit-length query embedding (384-d)
 * @param {{ topNodes?: number, threshold?: number }} opts
 * @returns {Promise<{
 *   matchedNodes: Array<{ id: string, name: string, label: string, similarity: number }>,
 *   paperScores: Map<string, number>
 * }>}
 */
export async function graphRetrieve(queryVec, { topNodes = 3, threshold = 0.45 } = {}) {
  const { leanKg, nodeEmb32, nodeMeta, paperIndex } = await loadGraphResources();
  const { rows, dim, node_ids } = nodeMeta;

  // 1. Find top-N most-similar concept nodes.
  const sims = new Float32Array(rows);
  for (let r = 0; r < rows; r++) {
    let s = 0;
    const base = r * dim;
    for (let d = 0; d < dim; d++) s += nodeEmb32[base + d] * queryVec[d];
    sims[r] = s;
  }

  // Build top-N via partial sort
  const top = [];
  for (let i = 0; i < rows; i++) {
    if (sims[i] < threshold) continue;
    if (top.length < topNodes) {
      top.push({ rowIndex: i, score: sims[i] });
      top.sort((a, b) => a.score - b.score);
    } else if (sims[i] > top[0].score) {
      top[0] = { rowIndex: i, score: sims[i] };
      top.sort((a, b) => a.score - b.score);
    }
  }
  top.sort((a, b) => b.score - a.score);

  // 2. Resolve to node objects.
  const nodesById = new Map(leanKg.nodes.map((n) => [n.id, n]));
  const matchedNodes = top
    .map(({ rowIndex, score }) => {
      const id = node_ids[rowIndex];
      const node = nodesById.get(id);
      if (!node) return null;
      return {
        id,
        name: node.name || id,
        label: node.label || 'Concept',
        similarity: score,
      };
    })
    .filter(Boolean);

  // 3. Score papers: count distinct matched-concept overlaps, dampened
  //    by 1 / log(1 + |paper_mentions|) so hub concepts don't dominate.
  const paperScores = new Map();
  const matchedSet = new Set(matchedNodes.map((n) => n.id));
  for (const node of leanKg.nodes) {
    if (!matchedSet.has(node.id) || !node.paper_mentions) continue;
    const damp = 1 / Math.log(1 + node.paper_mentions.length);
    for (const pid of node.paper_mentions) {
      paperScores.set(pid, (paperScores.get(pid) || 0) + damp);
    }
  }

  return { matchedNodes, paperScores };
}

/** Resolve a paper PMC ID to the set of concept node IDs it CONTAINS. */
export async function conceptsForPaper(pmcId) {
  const { paperIndex } = await loadGraphResources();
  return paperIndex.get(pmcId) || new Set();
}

// Sparse-side tokenizer used by BM25. Must match the Python tokenizer
// in notebooks/03_build_rag_index.ipynb byte-for-byte, otherwise the
// query terms won't match the precomputed postings.
//
// Behavior:
//   - lowercase
//   - split on runs of [^a-z0-9]
//   - drop tokens of length < 2
//   - drop tokens in the stopword set
//
// The stopword set is passed in (it ships inside bm25.json, so the same
// list the notebook used at precompute time is the one we use at query
// time — no risk of two hard-coded lists drifting apart).

const TOKEN_RE = /[a-z0-9]+/g;

export function tokenize(text, stops) {
  if (!text) return [];
  const lower = text.toLowerCase();
  const out = [];
  let match;
  // Reset lastIndex in case the regex has been used as a global before.
  TOKEN_RE.lastIndex = 0;
  while ((match = TOKEN_RE.exec(lower)) !== null) {
    const tok = match[0];
    if (tok.length < 2) continue;
    if (stops && stops.has(tok)) continue;
    out.push(tok);
  }
  return out;
}

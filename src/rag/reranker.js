// LLM listwise reranker.
//
// Takes the top-K candidate (paper, best-chunk) pairs from the hybrid
// retrieval stage and asks Gemini to return the top-N (N=5 by default)
// most relevant ones as a JSON-schema-constrained list of paper IDs.
//
// One Gemini call. Structured output (`responseMimeType: application/json`
// + `responseSchema`) so we don't have to parse free-form text. If the
// user has no API key set the rerank is silently skipped and the hybrid
// order is used as-is.
//
// The prompt is intentionally short and direct — listwise rerank works
// best when the LLM sees the query, each candidate's title + best chunk
// snippet, and is asked to return IDs only.

import { generateContent, MissingApiKeyError } from './gemini.js';
import { getChunks } from './chunks.js';

const SYSTEM = `You are a precision re-ranker for a scientific paper search. You will receive a user query and a numbered list of candidate passages (each one a snippet of a paper). Return the top-${'{TOP_N}'} passage ids that most directly answer the query. Prefer passages containing concrete numbers, methods, mechanisms, or causal claims over generic background. Reply ONLY with the JSON object — no prose, no markdown.`;

const SCHEMA = {
  type: 'object',
  properties: {
    ids: { type: 'array', items: { type: 'string' } },
  },
  required: ['ids'],
};

/**
 * Rerank the top-K hybrid-retrieval results.
 *
 * @param {string} query
 * @param {Array<{ paper: object, sources: string[], score: number, bestChunkId?: string }>} candidates
 * @param {{ topN?: number, signal?: AbortSignal }} opts
 * @returns {Promise<{ reranked: typeof candidates, skipped: boolean, reason?: string }>}
 */
export async function rerank(query, candidates, { topN = 5, signal } = {}) {
  if (!candidates || candidates.length === 0) {
    return { reranked: [], skipped: true, reason: 'no candidates' };
  }
  if (candidates.length <= topN) {
    return { reranked: candidates, skipped: true, reason: 'already at topN' };
  }

  // Fetch chunk text for each candidate (parallel, deduped by paper).
  const chunkIds = candidates.map((c) => c.bestChunkId).filter(Boolean);
  let chunkLookup = new Map();
  if (chunkIds.length > 0) {
    try {
      const chunks = await getChunks(chunkIds);
      chunkLookup = new Map(chunks.map((c) => [c.chunk_id, c]));
    } catch (err) {
      // Range-fetch failed — fall back to abstract snippets below.
      console.warn('Rerank chunk fetch failed, using abstracts:', err);
    }
  }

  // Build the prompt body. Each line: "<idx>. [paper_id] title — snippet".
  // We use the paper PMC ID as the stable id the model returns.
  const lines = candidates.map((c, i) => {
    const ch = chunkLookup.get(c.bestChunkId);
    const snippet = ch
      ? `${ch.section}: ${ch.text.slice(0, 350)}`
      : (c.paper?.summary || '').slice(0, 350);
    return `${i + 1}. [${c.paper.id}] ${c.paper.title}\n   ${snippet}`;
  });

  const userPrompt = `Query: ${query}\n\nCandidates:\n${lines.join('\n\n')}\n\nReturn the top ${topN} paper ids (the bracketed values, e.g. ["12345", "67890"]) as JSON.`;

  let parsed;
  try {
    parsed = await generateContent({
      system: SYSTEM.replace('{TOP_N}', String(topN)),
      user: userPrompt,
      json: true,
      schema: SCHEMA,
      signal,
    });
  } catch (err) {
    if (err instanceof MissingApiKeyError) {
      return { reranked: candidates.slice(0, topN), skipped: true, reason: 'no api key' };
    }
    return { reranked: candidates.slice(0, topN), skipped: true, reason: err.message };
  }

  const ids = Array.isArray(parsed?.ids) ? parsed.ids : [];
  if (ids.length === 0) {
    return { reranked: candidates.slice(0, topN), skipped: true, reason: 'empty rerank result' };
  }

  const byId = new Map(candidates.map((c) => [c.paper.id, c]));
  const ranked = ids.map((id) => byId.get(id)).filter(Boolean);
  // Backfill in case the model returned fewer than topN
  for (const c of candidates) {
    if (ranked.length >= topN) break;
    if (!ranked.includes(c)) ranked.push(c);
  }
  return { reranked: ranked.slice(0, topN), skipped: false };
}

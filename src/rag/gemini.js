// Thin Gemini REST wrapper. Two entry points:
//
//   - generateContent({ system, user, json, signal })
//       single-shot JSON or text completion.
//
//   - streamGenerateContent({ system, user, history, signal })
//       async iterator yielding text deltas via SSE. (Phase 5 will switch
//       PaperChat + GalaxyChat to this for token-level streaming.)
//
// Both read the user's key via apiKey.js and throw a typed
// MissingApiKeyError when the key is absent so callers can show the
// ApiKeyModal instead of a generic error toast.

import { getApiKey, getModelName } from './apiKey.js';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export class MissingApiKeyError extends Error {
  constructor() {
    super('Gemini API key is not configured.');
    this.name = 'MissingApiKeyError';
  }
}

function requireKey() {
  const key = getApiKey();
  if (!key) throw new MissingApiKeyError();
  return key;
}

function buildPayload({ system, user, history, json, schema }) {
  const contents = [];
  if (Array.isArray(history)) {
    for (const turn of history) {
      const part = { text: turn.text };
      if (turn.thoughtSignature) {
        part.thoughtSignature = turn.thoughtSignature;
      }
      contents.push({
        role: turn.role === 'user' ? 'user' : 'model',
        parts: [part],
      });
    }
  }
  contents.push({ role: 'user', parts: [{ text: user }] });

  const payload = { contents };
  if (system) payload.systemInstruction = { parts: [{ text: system }] };
  if (json) {
    payload.generationConfig = {
      responseMimeType: 'application/json',
      ...(schema ? { responseSchema: schema } : {}),
    };
  }
  return payload;
}

// --- Single-shot generation. Returns the raw text (or parsed JSON if `json`).
export async function generateContent({
  system,
  user,
  history,
  json = false,
  schema = null,
  model = getModelName(),
  signal,
}) {
  const key = requireKey();
  const url = `${ENDPOINT}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildPayload({ system, user, history, json, schema })),
    signal,
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(
      errBody?.error?.message ||
        `Gemini API error (HTTP ${res.status}). Check your key and quota.`,
    );
  }

  const result = await res.json();
  const parts = result.candidates?.[0]?.content?.parts || [];
  let text = '';
  for (const p of parts) {
    if (p.text) text += p.text;
  }
  if (!text) {
    const finishReason = result.candidates?.[0]?.finishReason;
    if (finishReason && finishReason !== 'STOP') {
      text = `[Stopped: ${finishReason}]`;
    } else {
      throw new Error('Gemini returned an empty response.');
    }
  }
  return json ? JSON.parse(text) : text;
}

// --- Streaming generation. Yields text deltas as they arrive.
//
// Usage:
//   for await (const chunk of streamGenerateContent({ user: 'hi' })) {
//     write(chunk);
//   }
export async function* streamGenerateContent({
  system,
  user,
  history,
  model = getModelName(),
  signal,
}) {
  const key = requireKey();
  const url = `${ENDPOINT}/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildPayload({ system, user, history })),
    signal,
  });

  if (!res.ok || !res.body) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(
      errBody?.error?.message || `Gemini streaming error (HTTP ${res.status}).`,
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by blank lines. Each frame may contain
    // multiple `data: {...}` lines that we concatenate.
    let frameEnd;
    while ((frameEnd = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, frameEnd);
      buffer = buffer.slice(frameEnd + 2);

      // SSE frames are separated by blank lines.
      // Each Gemini frame has exactly ONE `data: <json>` line.
      // We pick the last non-empty data line to avoid stray whitespace issues.
      let dataPayload = '';
      for (const line of frame.split('\n')) {
        if (line.startsWith('data:')) {
          const candidate = line.slice(5).trim();
          if (candidate) dataPayload = candidate;
        }
      }
      if (!dataPayload || dataPayload === '[DONE]') continue;

      let parsed;
      try {
        parsed = JSON.parse(dataPayload);
      } catch (err) {
        console.warn('Failed to parse SSE frame:', dataPayload);
        continue; // Ignore partial or invalid JSON
      }

      if (parsed.error) {
          throw new Error(parsed.error.message || 'Stream returned an error object.');
        }
        const candidate = parsed?.candidates?.[0];
        const parts = candidate?.content?.parts || [];
        let delta = '';
        let ts = null;
        for (const p of parts) {
          if (p.text) delta += p.text;
          if (p.thoughtSignature) ts = p.thoughtSignature;
        }
        
        if (candidate?.finishReason && candidate.finishReason !== 'STOP' && candidate.finishReason !== 'MAX_TOKENS') {
          delta += ` [Stopped: ${candidate.finishReason}]`;
        }

        // Always yield if there's text. Yield thought-only chunks too so
        // the caller can track signatures even when delta is empty.
        if (delta !== undefined) {
          yield { text: delta, thoughtSignature: ts };
        }
      }
    }
  }

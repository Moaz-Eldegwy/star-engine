// Bring-your-own-key (BYOK) state for the user's Gemini API key.
//
// The key lives ONLY in window.localStorage on the user's device. It is
// never logged, never sent to any origin other than
// generativelanguage.googleapis.com, and never committed to the repo.
//
// All Gemini calls in src/rag/gemini.js read the key via getApiKey().

const STORAGE_KEY = 'starengine.geminiKey';
const MODEL_KEY = 'starengine.geminiModel';
const DEFAULT_MODEL = 'gemini-flash-latest';

export function getApiKey() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export function setApiKey(key) {
  const trimmed = (key || '').trim();
  if (!trimmed) {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
  window.localStorage.setItem(STORAGE_KEY, trimmed);
  return trimmed;
}

export function clearApiKey() {
  window.localStorage.removeItem(STORAGE_KEY);
}

export function hasApiKey() {
  return Boolean(getApiKey());
}

export function getModelName() {
  try {
    return window.localStorage.getItem(MODEL_KEY) || DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
}

export function setModelName(name) {
  if (name) window.localStorage.setItem(MODEL_KEY, name);
}

// --- Validation: a cheap models.list call that returns 200 iff the key works.
// Used by ApiKeyModal to give immediate feedback on paste.
export async function validateApiKey(key) {
  if (!key) return { ok: false, error: 'No key provided.' };
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key.trim())}`;
    const res = await fetch(url, { method: 'GET' });
    if (res.ok) return { ok: true };
    const body = await res.json().catch(() => ({}));
    return {
      ok: false,
      error:
        body?.error?.message ||
        `HTTP ${res.status}: that key was rejected by the Gemini API.`,
    };
  } catch (err) {
    return {
      ok: false,
      error: `Network error while validating: ${err.message}. Check your connection.`,
    };
  }
}

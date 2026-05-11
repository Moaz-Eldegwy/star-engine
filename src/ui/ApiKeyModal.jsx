// First-load onboarding modal for the user's Gemini API key.
//
// The key is stored only in localStorage. We validate it against
// `models.list` so the user gets immediate feedback rather than a generic
// "AI failed" error 30 seconds later when they try a feature.

import { useEffect, useState } from 'react';
import {
  clearApiKey,
  hasApiKey,
  setApiKey,
  validateApiKey,
  getApiKey,
} from '../rag/apiKey.js';

export function ApiKeyModal({ open, onClose, onSaved }) {
  const [key, setKey] = useState('');
  const [status, setStatus] = useState('idle'); // 'idle' | 'validating' | 'error'
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setKey(getApiKey() || '');
      setStatus('idle');
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const onSave = async () => {
    setStatus('validating');
    setError(null);
    const result = await validateApiKey(key);
    if (!result.ok) {
      setStatus('error');
      setError(result.error);
      return;
    }
    setApiKey(key);
    setStatus('idle');
    onSaved?.();
    onClose?.();
  };

  const onSkip = () => {
    onClose?.();
  };

  const onClear = () => {
    clearApiKey();
    setKey('');
    setStatus('idle');
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 modal-bg">
      <div className="glass-effect rounded-xl w-full max-w-lg p-6 space-y-4">
        <div>
          <h2 className="text-xl font-bold text-indigo-300">
            <i className="fa-solid fa-key mr-2"></i>
            Bring your own Gemini key
          </h2>
          <p className="mt-2 text-sm text-gray-400">
            Star Engine runs AI features (summaries, paper chat, semantic
            search, rerank) through{' '}
            <span className="text-indigo-300">Google Gemini</span>. Your key is
            kept only in this browser's <code>localStorage</code> and is only
            ever sent to{' '}
            <code className="text-xs">generativelanguage.googleapis.com</code>.
            Get a free key at{' '}
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-300 underline hover:text-indigo-200"
            >
              aistudio.google.com/apikey
            </a>
            .
          </p>
        </div>

        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="AIzaSy…"
          autoFocus
          className="w-full bg-gray-900/60 border border-gray-600 rounded-lg py-3 px-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
        />

        {status === 'error' && (
          <div className="text-sm text-red-400 bg-red-900/30 border border-red-700 rounded-md p-3">
            <i className="fa-solid fa-circle-exclamation mr-2"></i>
            {error}
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
          <button
            onClick={onSkip}
            className="text-sm text-gray-400 underline hover:text-gray-200 self-start"
          >
            Skip — browse the galaxy in read-only mode
          </button>
          <div className="flex gap-2 sm:justify-end">
            {hasApiKey() && (
              <button
                onClick={onClear}
                className="px-3 py-2 text-sm text-gray-300 bg-gray-700/40 rounded-md hover:bg-gray-700/70"
                title="Remove the stored key from this browser"
              >
                Clear
              </button>
            )}
            <button
              onClick={onSave}
              disabled={status === 'validating' || !key.trim()}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md font-semibold hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === 'validating' ? (
                <>
                  <i className="fa-solid fa-spinner animate-spin mr-2"></i>
                  Validating…
                </>
              ) : (
                <>
                  Validate &amp; save
                  <i className="fa-solid fa-arrow-right ml-2"></i>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ApiKeyModal;

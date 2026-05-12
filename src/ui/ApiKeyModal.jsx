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
      <div className="glass-effect rounded-2xl w-full max-w-2xl p-6 sm:p-8 relative flex flex-col gap-6">
        <button
          onClick={onSkip}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white bg-gray-800/50 hover:bg-gray-700/50 rounded-full transition-all"
          title="Close"
        >
          <i className="fa-solid fa-xmark text-lg"></i>
        </button>

        <div className="pr-8">
          <h2 className="text-2xl font-bold text-indigo-300 flex items-center">
            <i className="fa-solid fa-key mr-3"></i>
            Bring your own Gemini key
          </h2>
          <p className="mt-3 text-gray-300 leading-relaxed">
            Star Engine runs AI features (summaries, paper chat, semantic
            search, rerank) through{' '}
            <span className="text-indigo-300 font-semibold">Google Gemini</span>. Your key is
            kept only in this browser's <code className="bg-gray-800/80 px-1.5 py-0.5 rounded text-sm text-gray-200">localStorage</code> and is only
            ever sent to{' '}
            <code className="bg-gray-800/80 px-1.5 py-0.5 rounded text-xs text-gray-200">generativelanguage.googleapis.com</code>.
            Get a free key at{' '}
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-400 underline hover:text-indigo-300 font-medium transition-colors"
            >
              aistudio.google.com/apikey
            </a>
            .
          </p>
        </div>

        <div className="space-y-2">
          <input
            type="password"
            name="gemini-api-key"
            autoComplete="new-password"
            spellCheck="false"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="AIzaSy…"
            autoFocus
            className="w-full bg-gray-900/80 border border-gray-600 rounded-xl py-3.5 px-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-base transition-shadow shadow-inner"
          />
        </div>

        {status === 'error' && (
          <div className="text-sm text-red-200 bg-red-900/40 border border-red-700/50 rounded-xl p-4 flex items-start sm:items-center">
            <i className="fa-solid fa-circle-exclamation mt-0.5 sm:mt-0 mr-3 text-red-400 text-lg"></i>
            <span>{error}</span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-between pt-2 gap-4">
          <button
            onClick={onSkip}
            className="text-sm text-gray-400 hover:text-gray-200 transition-colors order-2 sm:order-1 underline underline-offset-4 decoration-gray-600 hover:decoration-gray-400"
          >
            Skip — browse the galaxy in read-only mode
          </button>
          <div className="flex gap-3 order-1 sm:order-2 w-full sm:w-auto">
            {hasApiKey() && (
              <button
                onClick={onClear}
                className="flex-1 sm:flex-none px-4 py-2.5 text-sm text-gray-300 bg-gray-700/50 border border-gray-600 rounded-xl hover:bg-gray-600/50 transition-colors font-medium"
                title="Remove the stored key from this browser"
              >
                Clear Key
              </button>
            )}
            <button
              onClick={onSave}
              disabled={status === 'validating' || !key.trim()}
              className="flex-1 sm:flex-none px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-900/20 flex items-center justify-center whitespace-nowrap"
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

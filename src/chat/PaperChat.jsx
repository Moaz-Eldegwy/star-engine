// Chat with a single paper.
//
// Phase-5 version: token-by-token streaming via Gemini SSE, and the
// last-6-turn conversation history is included in the prompt so the
// model can refer back across turns.
//
// Phase-3 retrieval over per-paper chunks is the next refinement here
// (replace the 15k-char fetchPaperText fallback with chunk retrieval
// over THIS paper's chunks). The chunks fetcher is already wired up
// in src/rag/chunks.js — wiring this requires one more pass.

import { useEffect, useRef, useState } from 'react';
import { MissingApiKeyError, streamGenerateContent } from '../rag/gemini.js';
import { fetchPaperText } from '../rag/paperText.js';
import { useStore } from '../state/store.js';

const SYSTEM_PROMPT = `You are a research assistant for a single scientific paper. Answer the user's questions based ONLY on the provided context. If the answer is not in the context, say so explicitly — do not speculate. Keep answers concise and directly tied to the question. When you mention a specific number, method, or claim, briefly quote or paraphrase the supporting sentence.`;

const MAX_HISTORY_TURNS = 6;

export function PaperChat({ publication }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [paperText, setPaperText] = useState(null);
  const [isLoadingText, setIsLoadingText] = useState(true);
  const setShowApiKeyModal = useStore((s) => s.setShowApiKeyModal);
  const abortRef = useRef(null);
  const scrollRef = useRef(null);

  // Auto-scroll to the bottom on each token append.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    (async () => {
      try {
        setIsLoadingText(true);
        const text = await fetchPaperText(publication.id, ctrl.signal);
        setPaperText(text);
        setMessages([
          {
            text: `I've loaded the paper "${publication.title}". Ask me anything about it.`,
            sender: 'ai',
          },
        ]);
      } catch (err) {
        if (err.name === 'AbortError') return;
        setPaperText(null);
        setMessages([
          {
            text:
              "I couldn't fetch the full text, but I can still answer questions based on the abstract.",
            sender: 'ai',
          },
        ]);
      } finally {
        setIsLoadingText(false);
      }
    })();
    return () => ctrl.abort();
  }, [publication.id, publication.title]);

  const handleSend = async () => {
    if (!input.trim() || isThinking) return;
    const currentInput = input;
    setInput('');

    // Append the user turn and an empty AI turn we will stream into.
    const baseMessages = [...messages, { text: currentInput, sender: 'user' }];
    setMessages([...baseMessages, { text: '', sender: 'ai', streaming: true }]);
    setIsThinking(true);

    // Build the history Gemini sees: last 6 turns verbatim, excluding the
    // first "I've loaded the paper..." greeting (it isn't part of the
    // conversation, it's a system-ish hint).
    const history = baseMessages
      .slice(1)
      .slice(-MAX_HISTORY_TURNS)
      .slice(0, -1) // drop the just-sent user turn — that's the `user` field
      .map((m) => ({ role: m.sender === 'user' ? 'user' : 'model', text: m.text }));

    const context = paperText
      ? `Full Text (Excerpt): ${paperText}`
      : `Abstract: ${publication.summary}`;
    const userPrompt = `Context for the paper:\n${context}\n\nUser question: ${currentInput}`;

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      let acc = '';
      for await (const delta of streamGenerateContent({
        system: SYSTEM_PROMPT,
        user: userPrompt,
        history,
        signal: ctrl.signal,
      })) {
        acc += delta;
        // Update the last (AI, streaming) message with the accumulated text.
        setMessages((prev) => {
          const next = prev.slice();
          next[next.length - 1] = { text: acc, sender: 'ai', streaming: true };
          return next;
        });
      }
      setMessages((prev) => {
        const next = prev.slice();
        next[next.length - 1] = { text: acc || '(no response)', sender: 'ai' };
        return next;
      });
    } catch (err) {
      if (err.name === 'AbortError') return;
      const isKeyMissing = err instanceof MissingApiKeyError;
      const errText = isKeyMissing
        ? 'I need a Gemini API key to answer. Opening the key setup…'
        : `Sorry, I encountered an error. ${err.message}`;
      setMessages((prev) => {
        const next = prev.slice();
        next[next.length - 1] = { text: errText, sender: 'ai' };
        return next;
      });
      if (isKeyMissing) setShowApiKeyModal(true);
    } finally {
      setIsThinking(false);
    }
  };

  const handleStop = () => {
    if (abortRef.current) abortRef.current.abort();
    setIsThinking(false);
  };

  if (isLoadingText) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="loader"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[50vh]">
      <div ref={scrollRef} className="flex-grow overflow-y-auto pr-4 space-y-4">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-md p-3 rounded-lg whitespace-pre-wrap ${
                msg.sender === 'user' ? 'bg-indigo-600 text-white' : 'bg-gray-700'
              }`}
            >
              {msg.text}
              {msg.streaming && msg.text === '' && (
                <span className="inline-flex items-center space-x-1">
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></span>
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-pulse [animation-delay:0.2s]"></span>
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-pulse [animation-delay:0.4s]"></span>
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !isThinking && handleSend()}
          placeholder="Ask a question…"
          className="w-full bg-gray-800 border border-gray-600 rounded-l-lg py-2 px-4 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        {isThinking ? (
          <button
            onClick={handleStop}
            className="bg-red-700 px-4 py-2 rounded-r-lg hover:bg-red-600"
            title="Stop streaming"
          >
            <i className="fa-solid fa-stop"></i>
          </button>
        ) : (
          <button
            onClick={handleSend}
            className="bg-indigo-600 px-4 py-2 rounded-r-lg hover:bg-indigo-500"
          >
            <i className="fa-solid fa-paper-plane"></i>
          </button>
        )}
      </div>
    </div>
  );
}

export default PaperChat;

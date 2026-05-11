// Chat with a single paper.
//
// Phase-1 behavior (this file): naive context-stuffing of the first 15k chars
// of the paper text. Same UX as the original, just modularized and using the
// new src/rag/gemini.js wrapper + BYOK key.
//
// Phase 3 will replace the context with retrieved chunks (BM25 + dense over
// chunks of THIS paper) and add inline citations to the chunk + section.
// Phase 5 will switch this to streaming via streamGenerateContent + add
// conversation memory (summary-buffer).

import { useEffect, useRef, useState } from 'react';
import { generateContent, MissingApiKeyError } from '../rag/gemini.js';
import { fetchPaperText } from '../rag/paperText.js';
import { useStore } from '../state/store.js';

const SYSTEM_PROMPT = `You are a helpful research assistant. Your task is to answer questions about a scientific paper. You will be given the abstract and, if available, the full text of the paper. Answer the user's questions based *only* on the provided text. If the answer cannot be found in the text, state that you cannot find the answer in the provided document. Keep your answers concise and directly related to the user's question.`;

export function PaperChat({ publication }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [paperText, setPaperText] = useState(null);
  const [isLoadingText, setIsLoadingText] = useState(true);
  const setShowApiKeyModal = useStore((s) => s.setShowApiKeyModal);
  const abortRef = useRef(null);

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
            text: `I've loaded the paper "${publication.title}". How can I help you explore it?`,
            sender: 'ai',
          },
        ]);
      } catch (err) {
        if (err.name === 'AbortError') return;
        // Fall back to abstract-only
        setPaperText(null);
        setMessages([
          {
            text:
              "I couldn't load the full text for this paper, but you can ask me about the abstract.",
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
    if (!input.trim()) return;
    const newMessages = [...messages, { text: input, sender: 'user' }];
    setMessages(newMessages);
    const currentInput = input;
    setInput('');
    setIsThinking(true);

    const context = paperText
      ? `Full Text (Excerpt): ${paperText}`
      : `Abstract: ${publication.summary}`;

    try {
      const aiResponse = await generateContent({
        system: SYSTEM_PROMPT,
        user: `Using the following context, please answer the user's question.\n\nContext:\n${context}\n\nUser Question: ${currentInput}`,
      });
      setMessages([...newMessages, { text: aiResponse, sender: 'ai' }]);
    } catch (err) {
      if (err instanceof MissingApiKeyError) {
        setMessages([
          ...newMessages,
          {
            text: 'I need a Gemini API key to answer. Opening the key setup…',
            sender: 'ai',
          },
        ]);
        setShowApiKeyModal(true);
      } else {
        setMessages([
          ...newMessages,
          { text: `Sorry, I encountered an error. ${err.message}`, sender: 'ai' },
        ]);
      }
    } finally {
      setIsThinking(false);
    }
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
      <div className="flex-grow overflow-y-auto pr-4 space-y-4">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-md p-3 rounded-lg ${
                msg.sender === 'user' ? 'bg-indigo-600 text-white' : 'bg-gray-700'
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}
        {isThinking && (
          <div className="flex justify-start">
            <div className="bg-gray-700 p-3 rounded-lg">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse [animation-delay:0.2s]"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse [animation-delay:0.4s]"></div>
              </div>
            </div>
          </div>
        )}
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
        <button
          onClick={handleSend}
          disabled={isThinking}
          className="bg-indigo-600 px-4 py-2 rounded-r-lg hover:bg-indigo-500 disabled:bg-indigo-800"
        >
          <i className="fa-solid fa-paper-plane"></i>
        </button>
      </div>
    </div>
  );
}

export default PaperChat;

// The "research hub" modal that opens when a user double-clicks a star.
//
// Six tabs:
//   - At a Glance: stats + abstract + AI summary
//   - Chat with this Paper: per-paper Q&A (PaperChat)
//   - Visualize Results: placeholder for Phase 6 (AI-generated flowcharts)
//   - Explore Connections: placeholder for Phase 4 ego-graph
//   - AI Video: placeholder
//   - Edu-Game: HypothesisBuilder
//
// Phase-3/4 will add a "Retrieval trace" tab here (matched chunks + KG nodes).

import { useState } from 'react';
import { getOrganismIcon } from '../galaxy/constants.js';
import { generateContent, MissingApiKeyError } from '../rag/gemini.js';
import { fetchPaperText } from '../rag/paperText.js';
import { useStore } from '../state/store.js';
import { MarkdownRenderer } from '../ui/MarkdownRenderer.jsx';
import { HypothesisBuilder } from './HypothesisBuilder.jsx';
import { PaperChat } from './PaperChat.jsx';

const TABS = {
  glance: 'At a Glance',
  chat: 'Chat with this Paper',
  visualize: 'Visualize Results',
  connections: 'Explore Connections',
  video: 'AI Video',
  game: 'Edu-Game',
};

const SUMMARY_SYSTEM_PROMPT = `You are a scientific research assistant. Your task is to provide a concise, easy-to-understand summary of the provided scientific text. Focus on the key findings, methodology, and conclusions. Structure the summary into a few key bullet points using markdown (*). Also, make key terms **bold**.`;

export function ResearchHub({ publication, onClose, initialTab }) {
  const [activeTab, setActiveTab] = useState(initialTab || 'glance');
  const organismIcon = getOrganismIcon(publication.organism);

  const [summary, setSummary] = useState(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState(null);
  const setShowApiKeyModal = useStore((s) => s.setShowApiKeyModal);

  const handleGetSummary = async () => {
    setIsSummarizing(true);
    setSummaryError(null);
    setSummary(null);

    let paperContent = `Abstract: ${publication.summary}`;
    try {
      const text = await fetchPaperText(publication.id);
      if (text) paperContent = `Full Text (Excerpt): ${text}`;
    } catch (err) {
      console.warn('Could not fetch full text for summary, using abstract.', err);
    }

    try {
      const aiResponse = await generateContent({
        system: SUMMARY_SYSTEM_PROMPT,
        user: `Please summarize the following text from the paper "${publication.title}":\n\n${paperContent}`,
      });
      setSummary(aiResponse);
    } catch (err) {
      if (err instanceof MissingApiKeyError) {
        setSummaryError('A Gemini API key is required. Opening the key setup…');
        setShowApiKeyModal(true);
      } else {
        setSummaryError(`Failed to generate summary. ${err.message}`);
      }
    } finally {
      setIsSummarizing(false);
    }
  };

  const renderTab = () => {
    switch (activeTab) {
      case 'visualize':
        return (
          <div className="text-center p-8 text-gray-400">
            AI-generated flowcharts coming soon.
          </div>
        );
      case 'connections':
        return (
          <div className="text-center p-8 text-gray-400">
            Interactive ego-graph feature under development.
          </div>
        );
      case 'video':
        return (
          <div className="text-center p-8 text-gray-400">AI-generated video summaries coming soon.</div>
        );
      case 'game':
        return <HypothesisBuilder publication={publication} />;
      case 'chat':
        return <PaperChat publication={publication} />;
      default:
        return (
          <>
            <div className="my-6 glass-effect p-4 rounded-lg">
              <h4 className="text-lg font-bold text-white mb-3">Quick Look</h4>
              <div className="flex justify-around text-center">
                <div className="flex flex-col items-center w-1/3">
                  <i className={`fa-solid ${organismIcon} text-3xl text-indigo-300`}></i>
                  <span className="mt-2 text-sm text-gray-400">Organism</span>
                  <span className="font-bold text-white">{publication.organism}</span>
                </div>
                <div className="flex flex-col items-center w-1/3">
                  <i className="fa-solid fa-star text-3xl text-indigo-300"></i>
                  <span className="mt-2 text-sm text-gray-400">Citations</span>
                  <span className="font-bold text-white">{publication.citation_count}</span>
                </div>
                <div className="flex flex-col items-center w-1/3">
                  <i className="fa-solid fa-calendar-days text-3xl text-indigo-300"></i>
                  <span className="mt-2 text-sm text-gray-400">Year</span>
                  <span className="font-bold text-white">{publication.year}</span>
                </div>
              </div>
            </div>
            <p className="text-gray-300 mb-4">
              <strong className="text-indigo-400">Abstract:</strong>{' '}
              {publication.summary || 'Not available.'}
            </p>
            <div className="flex flex-wrap gap-2">
              {publication.keywords.map((k) => (
                <span
                  key={k}
                  className="bg-gray-700 text-indigo-200 text-xs font-semibold px-2.5 py-1 rounded-full"
                >
                  {k}
                </span>
              ))}
            </div>
            <a
              href={`https://www.ncbi.nlm.nih.gov/pmc/articles/PMC${publication.id}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-4 text-indigo-400 hover:text-indigo-300"
            >
              Read Full Paper <i className="fa-solid fa-arrow-up-right-from-square ml-1"></i>
            </a>
            <div className="mt-6 border-t border-gray-700 pt-6">
              <button
                onClick={handleGetSummary}
                disabled={isSummarizing}
                className="w-full bg-indigo-600 px-4 py-3 rounded-lg font-semibold hover:bg-indigo-500 disabled:bg-indigo-800 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
              >
                {isSummarizing ? (
                  <>
                    <i className="fa-solid fa-spinner animate-spin mr-2"></i>
                    Generating Summary…
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-wand-magic-sparkles mr-2"></i> Get AI Paper Summary
                  </>
                )}
              </button>
              {summaryError && <p className="mt-4 text-red-400 text-center">{summaryError}</p>}
              {summary && (
                <div className="mt-4 glass-effect p-4 rounded-lg text-gray-300">
                  <MarkdownRenderer content={summary} />
                </div>
              )}
            </div>
          </>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-bg" onClick={onClose}>
      <div
        className="glass-effect rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-700">
          <div className="flex justify-between items-start">
            <h2 className="text-2xl font-bold text-indigo-300 mb-2">{publication.title}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
              <i className="fa-solid fa-times text-2xl"></i>
            </button>
          </div>
          <p className="text-md text-gray-400">{publication.authors}</p>
          <p className="text-sm text-gray-500">
            {publication.journal}, {publication.year}
          </p>
        </div>
        <div className="flex-shrink-0 p-4 border-b border-gray-700">
          <div className="flex space-x-2 overflow-x-auto no-scrollbar">
            {Object.entries(TABS).map(([key, value]) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex-shrink-0 ${
                  activeTab === key ? 'tab-active' : 'tab-inactive hover:bg-white/20'
                }`}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-grow p-6 overflow-y-auto no-scrollbar">{renderTab()}</div>
      </div>
    </div>
  );
}

export default ResearchHub;

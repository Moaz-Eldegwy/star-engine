// Search-results modal. Receives the hybridRetrieve() output (papers
// joined with their retrieval metadata, matched KG concepts, and
// timings) and renders the retrieval trace + paper list.
//
// Each result row shows:
//   - title / authors / year / abstract
//   - provenance badges (BM25 · Dense · Graph) indicating which
//     retrievers found this paper
//   - "Read" + "Chat with Paper" actions
//
// Above the list: matched-concepts chips (GraphRAG entity-link result)
// + a folded "retrieval timings" line.

import { MatchedConcepts, ProvenanceBadges, RetrievalTimings } from './Citations.jsx';

export function GeminiSearchResultsModal({
  results,        // Array<{ paper, sources, score, bestChunkId }>
  matchedNodes,
  timings,
  isLoading,
  error,
  onClose,
  onChatWithPaper,
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-bg"
      onClick={onClose}
    >
      <div
        className="glass-effect rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 sm:p-6 border-b border-gray-700 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-indigo-300">
            Hybrid retrieval · BM25 · Dense · GraphRAG
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <i className="fa-solid fa-times text-2xl"></i>
          </button>
        </div>

        <div className="flex-grow p-4 sm:p-6 overflow-y-auto no-scrollbar">
          {isLoading && (
            <div className="flex flex-col items-center justify-center h-full py-16">
              <div className="loader"></div>
              <p className="mt-4 text-lg text-indigo-300">Embedding query, scoring chunks, walking the graph…</p>
            </div>
          )}
          {error && (
            <div className="text-center text-red-400">
              <i className="fa-solid fa-exclamation-circle text-3xl mb-3"></i>
              <p>
                <strong>Error:</strong> {error}
              </p>
            </div>
          )}
          {!isLoading && !error && (
            <>
              <MatchedConcepts matchedNodes={matchedNodes} />
              <RetrievalTimings timings={timings} />

              {results && results.length === 0 ? (
                <div className="text-center text-gray-400 py-8">
                  <i className="fa-solid fa-folder-open text-3xl mb-3"></i>
                  <p>No relevant papers found for your query.</p>
                </div>
              ) : (
                <div className="space-y-6 mt-4">
                  {results?.map(({ paper, sources, score }) => (
                    <div
                      key={paper.id}
                      className="bg-gray-900/50 p-4 rounded-lg border border-gray-700"
                    >
                      <div className="flex items-start justify-between gap-4 mb-1">
                        <h3 className="font-bold text-lg text-indigo-400">{paper.title}</h3>
                        <ProvenanceBadges sources={sources} />
                      </div>
                      <p className="text-sm text-gray-500 mb-2">
                        {paper.authors} ({paper.year}) ·{' '}
                        <span className="font-mono text-[11px]">RRF {score.toFixed(3)}</span>
                      </p>
                      <p className="text-gray-300 text-sm mb-4 line-clamp-3">{paper.summary}</p>
                      <div className="flex items-center space-x-3 mt-3">
                        <a
                          href={`https://www.ncbi.nlm.nih.gov/pmc/articles/PMC${paper.id}/`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 text-center bg-gray-700 text-indigo-200 text-sm font-semibold px-4 py-2 rounded-md hover:bg-gray-600 transition-colors"
                        >
                          Read Paper{' '}
                          <i className="fa-solid fa-arrow-up-right-from-square ml-1 text-xs"></i>
                        </a>
                        <button
                          onClick={() => onChatWithPaper(paper)}
                          className="flex-1 text-center bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-md hover:bg-indigo-500 transition-colors"
                        >
                          Chat with Paper <i className="fa-solid fa-comments ml-1 text-xs"></i>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default GeminiSearchResultsModal;

// Root component.
//
// Wires together the data loader, sidebar UI, GalaxyView, and modals.
// Most cross-component state lives in src/state/store.js (Zustand).
//
// PHASE 1 STATUS: this file ports the original single-file app verbatim
// (semantics-wise). The semantic-search handler still dumps the full KG-nodes
// array into a single Gemini prompt. Phase 3 swaps that for the hybrid +
// GraphRAG pipeline in src/rag/pipeline.js.

import { useEffect, useMemo, useState } from 'react';
import { GalaxyView } from './galaxy/GalaxyView.jsx';
import { processRealData } from './galaxy/processRealData.js';
import { assetUrl } from './rag/assetUrl.js';
import { generateContent, MissingApiKeyError } from './rag/gemini.js';
import { hasApiKey } from './rag/apiKey.js';
import { GeminiSearchResultsModal } from './chat/GeminiSearchResultsModal.jsx';
import { ResearchHub } from './chat/ResearchHub.jsx';
import { ApiKeyModal } from './ui/ApiKeyModal.jsx';
import { useStore } from './state/store.js';

const SEARCH_SYSTEM_PROMPT = `You are an expert research assistant specializing in space biology. Your task is to identify relevant scientific papers based on a user's question. You will be given a user question and a JSON object representing nodes from a knowledge graph. Each node contains information about concepts, organisms, etc., and a "paper_mentions" array listing the PMC IDs of papers that mention it.

Instructions:
1. Analyze the user's question to understand the key concepts.
2. Search through the provided knowledge graph nodes to find all nodes whose "name", "normalized_name", or "provenance" are relevant to the concepts in the question.
3. Collect all unique paper IDs from the "paper_mentions" array of all the matching nodes.
4. Return ONLY a JSON object with a single key "paper_ids" containing an array of all the collected paper IDs as strings. If no papers are found, return an empty array. Do not include any other text, explanation, or markdown formatting.`;

export default function App() {
  // --- Selectors from store ---
  const {
    publications,
    knowledgeGraph,
    isLoadingData,
    loadingError,
    setData,
    setLoadingError,
    sidebarOpen,
    setSidebarOpen,
    searchTerm,
    setSearchTerm,
    selectedFilters,
    toggleFilter,
    activeLens,
    setActiveLens,
    temporalFilter,
    setTemporalFilter,
    focusedStar,
    setFocusedStar,
    pulsingConcept,
    setPulsingConcept,
    selectedPublication,
    hubInitialTab,
    openHub,
    closeHub,
    isGeminiSearching,
    geminiSearchResults,
    geminiSearchError,
    setGeminiSearchState,
    clearGeminiSearch,
    showApiKeyModal,
    setShowApiKeyModal,
  } = useStore();

  // --- One-time data load ---
  useEffect(() => {
    (async () => {
      try {
        const [pubRes, graphRes] = await Promise.all([
          fetch(assetUrl('data/publications.json')),
          fetch(assetUrl('data/knowledge_graph.json')),
        ]);
        if (!pubRes.ok || !graphRes.ok) {
          throw new Error(
            `Failed to fetch data files. Status: publications=${pubRes.status}, graph=${graphRes.status}`,
          );
        }
        const publicationsData = await pubRes.json();
        const knowledgeGraphData = await graphRes.json();
        const processed = processRealData(publicationsData, knowledgeGraphData);
        setData(processed, knowledgeGraphData);
      } catch (err) {
        console.error('Fatal: could not load data.', err);
        setLoadingError(
          `Could not load data. Make sure public/data/publications.json and public/data/knowledge_graph.json are reachable. Details: ${err.message}`,
        );
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Show ApiKeyModal on first load if no key set ---
  useEffect(() => {
    if (!isLoadingData && !hasApiKey()) {
      setShowApiKeyModal(true);
    }
  }, [isLoadingData, setShowApiKeyModal]);

  // --- Year range derived from data ---
  const [minYear, maxYear] = useMemo(() => {
    if (publications.length === 0) return [2000, 2025];
    const years = publications.map((p) => p.year).filter((y) => !isNaN(y) && y > 1900);
    return years.length > 0 ? [Math.min(...years), Math.max(...years)] : [2000, 2025];
  }, [publications]);

  // Initialize temporal filter once min/max are known
  useEffect(() => {
    setTemporalFilter({ min: minYear, max: maxYear });
  }, [minYear, maxYear, setTemporalFilter]);

  // --- Keyword list for filter chips ---
  const allKeywords = useMemo(
    () => Array.from(new Set(publications.flatMap((p) => p.keywords || []))).sort(),
    [publications],
  );

  // --- Filter logic ---
  const filteredPublicationIds = useMemo(() => {
    if (selectedFilters.length === 0) return null;
    const filtered = publications.filter((p) =>
      selectedFilters.every((f) => p.keywords.includes(f)),
    );
    return new Set(filtered.map((p) => p.id));
  }, [publications, selectedFilters]);

  // --- Pulsing concept toggle ---
  const handleSetPulsingConcept = (concept) => {
    setPulsingConcept(pulsingConcept === concept ? null : concept);
  };

  const handleChatFromSearch = (paper) => {
    clearGeminiSearch();
    openHub(paper, 'chat');
  };

  // --- Gemini search (Phase 1: original dump-KG-into-prompt logic) ---
  const handleGeminiSearch = async () => {
    if (!searchTerm.trim()) {
      setGeminiSearchState({
        isGeminiSearching: false,
        geminiSearchResults: [],
        geminiSearchError: 'Please enter a question or topic to search.',
      });
      return;
    }
    setGeminiSearchState({
      isGeminiSearching: true,
      geminiSearchError: null,
      geminiSearchResults: [],
    });

    try {
      // NOTE: Phase 3 replaces this naive context-stuffing with a proper
      // BM25 + dense + GraphRAG pipeline. Until then we keep the original
      // behavior so the rest of the UX is testable.
      const parsed = await generateContent({
        system: SEARCH_SYSTEM_PROMPT,
        user: `User Question: "${searchTerm}"\n\nKnowledge Graph Nodes: ${JSON.stringify(knowledgeGraph.nodes)}`,
        json: true,
        schema: { type: 'object', properties: { paper_ids: { type: 'array', items: { type: 'string' } } } },
      });
      const paperIds = parsed?.paper_ids;
      if (!Array.isArray(paperIds)) {
        throw new Error("AI response did not contain a valid 'paper_ids' array.");
      }
      const foundPapers = publications.filter((p) => paperIds.includes(p.id));
      setGeminiSearchState({
        isGeminiSearching: false,
        geminiSearchResults: foundPapers,
        geminiSearchError: null,
      });
    } catch (err) {
      console.error('Gemini search failed:', err);
      if (err instanceof MissingApiKeyError) {
        setGeminiSearchState({
          isGeminiSearching: false,
          geminiSearchResults: null,
          geminiSearchError: null,
        });
        setShowApiKeyModal(true);
      } else {
        setGeminiSearchState({
          isGeminiSearching: false,
          geminiSearchError: err.message || 'An unknown error occurred during the AI search.',
          geminiSearchResults: [],
        });
      }
    }
  };

  // --- Loading / error overlay ---
  if (isLoadingData || loadingError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-center p-8">
        {loadingError ? (
          <>
            <i className="fa-solid fa-triangle-exclamation text-5xl text-red-400 mb-4"></i>
            <h2 className="text-2xl font-bold text-red-300 mb-2">Data Loading Failed</h2>
            <p className="max-w-xl text-gray-400">{loadingError}</p>
          </>
        ) : (
          <>
            <div className="loader"></div>
            <p className="mt-4 text-lg text-indigo-300">Calibrating the Knowledge Universe…</p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="h-full w-full flex">
      {/* Sidebar */}
      <div
        className={`flex-shrink-0 sidebar-transition overflow-hidden ${
          sidebarOpen ? 'w-full max-w-sm' : 'w-0'
        }`}
      >
        <div className="p-4 sm:pt-6 pb-6 pl-6 pr-0 h-full flex flex-col w-full max-w-sm">
          <header className="text-left mb-6 flex-shrink-0">
            <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
              Star Engine
            </h1>
            <p className="mt-1 text-md text-indigo-300">
              Navigate the Universe of Space Biology
            </p>
          </header>
          <div className="glass-effect rounded-xl p-4 sm:p-6 flex-grow overflow-y-auto no-scrollbar">
            {/* Search bar */}
            <div className="relative mb-4">
              <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 z-10"></i>
              <input
                type="text"
                placeholder={`Ask a question or search ${publications.length} papers…`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleGeminiSearch()}
                className="w-full bg-gray-900/50 border border-gray-600 rounded-lg py-3 pl-12 pr-12 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={handleGeminiSearch}
                title="Ask AI Assistant"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-indigo-300 hover:text-white p-2 rounded-full transition-colors bg-gray-900/50 hover:bg-indigo-600 disabled:opacity-50"
                disabled={isGeminiSearching}
              >
                <i className="fa-solid fa-wand-magic-sparkles"></i>
              </button>
            </div>

            {/* Lenses */}
            <div className="mb-4">
              <h3 className="font-semibold mb-3 text-gray-300">Analytical Lenses</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {['Default', 'Temporal', 'Mission', 'Consensus'].map((l) => {
                  const isConsensus = l === 'Consensus';
                  return (
                    <button
                      key={l}
                      onClick={() => !isConsensus && setActiveLens(l.toLowerCase())}
                      className={`px-3 py-2 rounded-md transition-colors ${
                        activeLens === l.toLowerCase() ? 'tab-active' : 'tab-inactive'
                      } ${isConsensus ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white/20'}`}
                      disabled={isConsensus}
                      title={isConsensus ? 'Coming Soon' : ''}
                    >
                      {l}
                      {isConsensus ? ' (Beta)' : ''}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Temporal slider */}
            {activeLens === 'temporal' && (
              <div className="mb-4">
                <h3 className="font-semibold mb-2 text-gray-300">Publication Year</h3>
                <input
                  type="range"
                  min={minYear}
                  max={maxYear}
                  value={temporalFilter.max}
                  onChange={(e) =>
                    setTemporalFilter({ ...temporalFilter, max: parseInt(e.target.value, 10) })
                  }
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>{minYear}</span>
                  <span>{temporalFilter.max}</span>
                  <span>{maxYear}</span>
                </div>
              </div>
            )}

            {/* Keyword filters */}
            <details className="text-gray-300" open>
              <summary className="cursor-pointer font-semibold">Filter by Keywords</summary>
              <div className="flex flex-wrap gap-2 mt-4 max-h-80 overflow-y-auto">
                {allKeywords.map((keyword) => (
                  <button
                    key={keyword}
                    onClick={() => toggleFilter(keyword)}
                    className={`px-3 py-1 text-sm font-medium rounded-full transition-all ${
                      selectedFilters.includes(keyword)
                        ? 'bg-indigo-500 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {keyword}
                  </button>
                ))}
              </div>
            </details>

            {/* Settings shortcut */}
            <div className="mt-6 border-t border-gray-700 pt-4 text-xs text-gray-500 flex items-center justify-between">
              <button
                onClick={() => setShowApiKeyModal(true)}
                className="hover:text-indigo-300 transition-colors"
                title="Manage your Gemini API key"
              >
                <i className="fa-solid fa-key mr-1"></i> API key
              </button>
              <span>
                {publications.length} papers · {knowledgeGraph.nodes.length} graph nodes
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Galaxy + toggle */}
      <div className="relative flex-1 h-full">
        <div className="absolute top-1/2 -translate-y-1/2 left-0 z-20">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="glass-effect px-2 py-8 rounded-r-lg"
          >
            <i className={`fa-solid ${sidebarOpen ? 'fa-chevron-left' : 'fa-chevron-right'}`}></i>
          </button>
        </div>
        <GalaxyView
          publications={publications}
          onStarClick={(star) => {
            setFocusedStar(star);
            setPulsingConcept(null);
          }}
          onStarDoubleClick={(pub) => openHub(pub, 'glance')}
          onBackgroundClick={() => {
            setFocusedStar(null);
            setPulsingConcept(null);
          }}
          onPlanetClick={handleSetPulsingConcept}
          focusedStar={focusedStar}
          pulsingConcept={pulsingConcept}
          filters={{ filteredIds: filteredPublicationIds }}
          temporalFilter={temporalFilter}
          lens={activeLens}
        />
      </div>

      {selectedPublication && (
        <ResearchHub
          publication={selectedPublication}
          onClose={closeHub}
          initialTab={hubInitialTab}
        />
      )}

      {(isGeminiSearching || geminiSearchResults || geminiSearchError) && (
        <GeminiSearchResultsModal
          results={geminiSearchResults || []}
          isLoading={isGeminiSearching}
          error={geminiSearchError}
          onClose={clearGeminiSearch}
          onChatWithPaper={handleChatFromSearch}
        />
      )}

      <ApiKeyModal
        open={showApiKeyModal}
        onClose={() => setShowApiKeyModal(false)}
        onSaved={() => setShowApiKeyModal(false)}
      />
    </div>
  );
}

// Global UI state for Star Engine.
//
// Most things still live in component-local useState (galaxy view internals,
// search input, etc.) — only state that crosses component boundaries goes
// through this store. Keeps the boundary small and predictable.

import { create } from 'zustand';

export const useStore = create((set) => ({
  // --- Data load (set once in App after fetching publications + KG) ---
  publications: [],
  knowledgeGraph: { nodes: [], edges: [] },
  isLoadingData: true,
  loadingError: null,
  setData: (publications, knowledgeGraph) =>
    set({ publications, knowledgeGraph, isLoadingData: false, loadingError: null }),
  setLoadingError: (err) => set({ loadingError: err, isLoadingData: false }),

  // --- Sidebar / search / filters ---
  sidebarOpen: true,
  setSidebarOpen: (v) => set({ sidebarOpen: v }),

  searchTerm: '',
  setSearchTerm: (v) => set({ searchTerm: v }),

  selectedFilters: [],
  setSelectedFilters: (v) => set({ selectedFilters: v }),
  toggleFilter: (k) =>
    set((s) => ({
      selectedFilters: s.selectedFilters.includes(k)
        ? s.selectedFilters.filter((x) => x !== k)
        : [...s.selectedFilters, k],
    })),

  activeLens: 'default',
  setActiveLens: (v) => set({ activeLens: v }),

  temporalFilter: { min: 2000, max: 2025 },
  setTemporalFilter: (v) => set({ temporalFilter: v }),

  // --- Galaxy focus state ---
  focusedStar: null,
  setFocusedStar: (v) => set({ focusedStar: v }),

  pulsingConcept: null,
  setPulsingConcept: (v) => set({ pulsingConcept: v }),

  // Set of PMC IDs to pulse in the galaxy (driven by retrieval results
  // so the matched stars visibly highlight when the user runs a search).
  pulsingIds: null,
  setPulsingIds: (v) => set({ pulsingIds: v }),

  // --- Research Hub modal ---
  selectedPublication: null,
  hubInitialTab: 'glance',
  openHub: (pub, initialTab = 'glance') =>
    set({ selectedPublication: pub, hubInitialTab: initialTab }),
  closeHub: () => set({ selectedPublication: null }),

  // --- Search results modal (hybrid retrieval output) ---
  isGeminiSearching: false,
  geminiSearchResults: null,   // Array<{ paper, sources[], score }>
  geminiSearchError: null,
  matchedNodes: [],            // GraphRAG-matched KG concept nodes
  retrievalTimings: null,      // { embed, bm25, dense, graph, fuse, total } ms
  setGeminiSearchState: (next) => set(next),
  clearGeminiSearch: () =>
    set({
      isGeminiSearching: false,
      geminiSearchResults: null,
      geminiSearchError: null,
      matchedNodes: [],
      retrievalTimings: null,
      pulsingIds: null,
    }),

  // --- API key modal ---
  showApiKeyModal: false,
  setShowApiKeyModal: (v) => set({ showApiKeyModal: v }),
}));

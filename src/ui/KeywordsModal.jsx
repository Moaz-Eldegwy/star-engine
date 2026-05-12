import { useState, useMemo, useEffect } from 'react';

export function KeywordsModal({ open, onClose, keywords, selectedFilters, toggleFilter }) {
  const [search, setSearch] = useState('');

  // Reset search when modal opens
  useEffect(() => {
    if (open) {
      setSearch('');
    }
  }, [open]);

  const filteredKeywords = useMemo(() => {
    if (!search.trim()) return keywords;
    const lowerSearch = search.toLowerCase();
    return keywords.filter(k => k.toLowerCase().includes(lowerSearch));
  }, [keywords, search]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-gray-800 flex justify-between items-center bg-gray-800/30 rounded-t-2xl">
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight">All Keywords</h2>
            <p className="text-sm text-indigo-300 mt-1">Select keywords to filter publications</p>
          </div>
          <button 
            onClick={onClose} 
            className="text-gray-400 hover:text-white hover:bg-gray-800 p-2 rounded-full transition-colors"
            aria-label="Close modal"
          >
            <i className="fa-solid fa-xmark text-xl"></i>
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-5 sm:p-6 border-b border-gray-800 bg-gray-900/50">
          <div className="relative">
            <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 z-10"></i>
            <input
              type="text"
              name="keyword-search-filter"
              autoComplete="off"
              spellCheck="false"
              placeholder={`Search ${keywords.length} keywords...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl py-3 pl-12 pr-4 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all shadow-inner"
            />
          </div>
        </div>

        {/* Keywords List */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-grow custom-scrollbar">
          <div className="flex flex-wrap gap-2.5">
            {filteredKeywords.map(keyword => {
              const isSelected = selectedFilters.includes(keyword);
              return (
                <button
                  key={keyword}
                  onClick={() => toggleFilter(keyword)}
                  className={`px-4 py-2 text-sm font-medium rounded-full transition-all duration-200 border ${
                    isSelected
                      ? 'bg-indigo-600 border-indigo-500 text-white shadow-[0_0_15px_rgba(79,70,229,0.4)]'
                      : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700 hover:border-gray-600 hover:text-white'
                  }`}
                >
                  {keyword}
                  {isSelected && (
                    <i className="fa-solid fa-check ml-2 text-xs"></i>
                  )}
                </button>
              );
            })}
            
            {filteredKeywords.length === 0 && (
              <div className="w-full text-center py-12">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-800 mb-4">
                  <i className="fa-solid fa-magnifying-glass text-2xl text-gray-500"></i>
                </div>
                <h3 className="text-lg font-medium text-white mb-1">No keywords found</h3>
                <p className="text-gray-400">We couldn't find any keywords matching "{search}"</p>
              </div>
            )}
          </div>
        </div>
        
        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-gray-800 bg-gray-800/30 rounded-b-2xl flex justify-between items-center">
          <div className="text-sm text-gray-400">
            <span className="text-white font-medium">{selectedFilters.length}</span> selected
          </div>
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition-colors shadow-lg shadow-indigo-900/20"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
}

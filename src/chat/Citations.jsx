// Citations / retrieval-trace UI.
//
// Renders, for a single hybridRetrieve() result:
//   - matched KG concept chips (clickable → could highlight stars; Phase 6
//     adds that as a separate trigger)
//   - per-paper provenance flags (bm25 / dense / graph)
//   - a folded "retrieval timings" line for the curious
//
// Used by GeminiSearchResultsModal. Keeping it as its own module keeps
// the modal's render code shallow and lets a future ARCHITECTURE.md
// link directly to the source of "what the user sees."

const SOURCE_BADGES = {
  bm25: { label: 'BM25', color: 'bg-amber-700/40 text-amber-200 border-amber-600' },
  dense: { label: 'Dense', color: 'bg-emerald-700/40 text-emerald-200 border-emerald-600' },
  graph: { label: 'Graph', color: 'bg-fuchsia-700/40 text-fuchsia-200 border-fuchsia-600' },
};

export function ProvenanceBadges({ sources = [] }) {
  const unique = [...new Set(sources)];
  return (
    <div className="flex gap-1 flex-wrap">
      {unique.map((src) => {
        const cfg = SOURCE_BADGES[src] || { label: src, color: 'bg-gray-700/40 text-gray-200 border-gray-600' };
        return (
          <span
            key={src}
            className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${cfg.color}`}
            title={`Found by ${cfg.label} retriever`}
          >
            {cfg.label}
          </span>
        );
      })}
    </div>
  );
}

export function MatchedConcepts({ matchedNodes, onConceptClick }) {
  if (!matchedNodes || matchedNodes.length === 0) return null;
  return (
    <div className="mb-4 px-1">
      <div className="text-xs uppercase tracking-wider text-gray-400 mb-2">
        Matched concepts <span className="text-gray-500">(KG entity-link · top {matchedNodes.length})</span>
      </div>
      <div className="flex gap-2 flex-wrap">
        {matchedNodes.map((n) => (
          <button
            key={n.id}
            onClick={() => onConceptClick?.(n)}
            className="text-xs px-3 py-1.5 rounded-full bg-indigo-700/40 text-indigo-200 border border-indigo-600 hover:bg-indigo-600/60 transition-colors"
            title={`${n.label} · cosine ${n.similarity.toFixed(2)}`}
          >
            <i className="fa-solid fa-circle-nodes mr-1.5 opacity-70"></i>
            {n.name}
            <span className="ml-2 opacity-60">{n.similarity.toFixed(2)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function RetrievalTimings({ timings }) {
  if (!timings) return null;
  return (
    <details className="text-[11px] text-gray-500 mt-2">
      <summary className="cursor-pointer hover:text-gray-400">
        Retrieval trace · {timings.total} ms total
      </summary>
      <div className="mt-2 grid grid-cols-5 gap-2 font-mono">
        <div>embed: {timings.embed} ms</div>
        <div>bm25: {timings.bm25} ms</div>
        <div>dense: {timings.dense} ms</div>
        <div>graph: {timings.graph} ms</div>
        <div>fuse: {timings.fuse} ms</div>
      </div>
    </details>
  );
}

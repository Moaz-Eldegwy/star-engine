// In-app "How it works" modal.
//
// Treat this as a primary deliverable, not docs — it's the 60-second
// pitch a recruiter will read while the demo loads. Deeper rationale
// lives in docs/ARCHITECTURE.md and is linked at the bottom.

export function HowItWorks({ open, onClose }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-4 modal-bg" onClick={onClose}>
      <div
        className="glass-effect rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-gray-700">
          <h2 className="text-xl font-bold text-indigo-300">
            <i className="fa-solid fa-circle-nodes mr-2"></i>How Star Engine retrieves
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <i className="fa-solid fa-times text-2xl"></i>
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-6 text-sm text-gray-300 no-scrollbar">
          <Section title="1 · The galaxy">
            <p>
              Each star is one of the <b>494 NASA space-biology papers</b>.
              Color encodes the dominant organism (Plant / Mouse / Human /
              Microbe), size scales with year, brightness with synthetic
              citation count. Faint indigo lines connect papers that share a
              knowledge-graph edge.
            </p>
          </Section>

          <Section title="2 · The retrieval pipeline (runs in your browser)">
            <Pipeline />
          </Section>

          <Section title="3 · The knowledge graph is load-bearing">
            <p>
              The KG is consumed by retrieval, not just visualization. The
              query is entity-linked to KG concept nodes by cosine similarity;
              papers in the 1-hop subgraph get a multiplicative boost in the
              fused ranking. When the results come back, the matched stars{' '}
              <b>pulse in the 3D view</b> so the graph is visibly doing work.
            </p>
          </Section>

          <Section title="4 · What runs where">
            <table className="w-full text-xs text-left mt-2 border-collapse">
              <thead className="text-gray-400">
                <tr>
                  <th className="py-2 pr-4">Step</th>
                  <th className="py-2 pr-4">Where</th>
                  <th className="py-2">Uses your Gemini key?</th>
                </tr>
              </thead>
              <tbody className="font-mono text-[12px]">
                <Row a="Chunking + embeddings + BM25 + KG-node embeds" b="Offline notebook" c="No" />
                <Row a="Query embedding (MiniLM)" b="Your browser (WASM)" c="No" />
                <Row a="BM25 + dense + GraphRAG + RRF" b="Your browser (JS)" c="No" />
                <Row a="Listwise rerank (top-20 → top-5)" b="Gemini Flash" c="Yes (1 call)" />
                <Row a="Streaming generation" b="Gemini Flash (SSE)" c="Yes" />
              </tbody>
            </table>
            <p className="text-xs text-gray-500 mt-3">
              Without a Gemini key you can still run hybrid + GraphRAG
              retrieval and browse the galaxy. The key is only spent on the
              rerank and generation steps.
            </p>
          </Section>

          <Section title="5 · Source code is the docs">
            <p>
              The deeper rationale (why MiniLM, why RRF, why fp16 binary,
              why no HNSW at this scale) lives in{' '}
              <a
                href="https://github.com/"
                className="text-indigo-300 underline hover:text-indigo-200"
                target="_blank"
                rel="noopener noreferrer"
              >
                docs/ARCHITECTURE.md
              </a>{' '}
              alongside an honest list of limitations and what's next.
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <h3 className="text-base font-semibold text-white mb-2">{title}</h3>
      <div className="leading-relaxed">{children}</div>
    </div>
  );
}

function Row({ a, b, c }) {
  return (
    <tr className="border-t border-gray-700/50">
      <td className="py-2 pr-4">{a}</td>
      <td className="py-2 pr-4 text-indigo-300">{b}</td>
      <td className="py-2">{c}</td>
    </tr>
  );
}

function Pipeline() {
  return (
    <pre className="bg-gray-900/60 rounded-md p-3 text-[11px] leading-tight overflow-x-auto text-gray-300 font-mono">
{`            user question
                  │
                  ▼
      embedQuery (MiniLM in your browser, ~25 MB cached after first load)
                  │
       ┌──────────┼──────────────────────┐
       ▼          ▼                      ▼
    BM25       Dense              GraphRAG
   ~10 ms    ~10 ms                ~5 ms
  postings   fp16 dot         entity-link → 1-hop
   scoring   product            subgraph score
       │          │                      │
       └──────────┴──────────────────────┘
                       ▼
          RRF fusion (k = 60), top-20 candidates
                       │
                       ▼
       Gemini listwise rerank (top-20 → top-5)
                  + retrieval-trace UI
                       │
                       ▼
      matched stars pulse in galaxy; citations link to chunks`}
    </pre>
  );
}

export default HowItWorks;

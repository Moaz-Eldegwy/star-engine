import React, { useState, useEffect, useRef, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import ForceGraph3D from 'react-force-graph-3d';

export function KnowledgeGraphView({ data, mode, onClose }) {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const graphRef = useRef();
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const containerRef = useRef(null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [showLinks, setShowLinks] = useState(true);
  const [showInfoModal, setShowInfoModal] = useState(false);

  // Stats calculation
  const stats = useMemo(() => {
    if (!data || !data.nodes) return null;
    const counts = {};
    data.nodes.forEach(n => {
      const label = n.label || 'Unknown';
      counts[label] = (counts[label] || 0) + 1;
    });
    return {
      totalNodes: data.nodes.length,
      totalEdges: data.edges?.length || 0,
      counts
    };
  }, [data]);

  // Progressive loading and performance optimization
  useEffect(() => {
    if (!data || !data.nodes) return;
    let isCancelled = false;
    
    const runProgressive = async () => {
      const allNodes = data.nodes.map(n => ({ ...n }));
      const allEdges = (data.edges || []).map(e => ({ source: e.source, target: e.target, ...e }));
      
      let currentNodes = [];
      let currentEdges = [];
      const nodeSet = new Set();
      
      const batchSize = 1000;
      
      for (let i = 0; i < allNodes.length; i += batchSize) {
        if (isCancelled) break;
        
        const newNodes = allNodes.slice(i, i + batchSize);
        newNodes.forEach(n => nodeSet.add(n.id));
        
        const newEdges = [];
        const remainingEdges = [];
        
        for (const e of allEdges) {
          if (nodeSet.has(e.source) && nodeSet.has(e.target)) {
            newEdges.push(e);
          } else {
            remainingEdges.push(e);
          }
        }
        
        allEdges.length = 0;
        allEdges.push(...remainingEdges);
        
        currentNodes = [...currentNodes, ...newNodes];
        currentEdges = [...currentEdges, ...newEdges];
        
        setGraphData({ nodes: currentNodes, links: currentEdges });
        setLoadingProgress(Math.min(100, Math.floor((currentNodes.length / allNodes.length) * 100)));
        
        await new Promise(r => setTimeout(r, 100));
      }
      if (!isCancelled) setLoadingProgress(100);
    };
    
    runProgressive();
    return () => { isCancelled = true; };
  }, [data]);

  // Handle resizing with ResizeObserver for robust layout calculation
  useEffect(() => {
    if (!containerRef.current) return;
    
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // Only update if dimensions actually exist
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          setContainerSize({
            width: entry.contentRect.width,
            height: entry.contentRect.height
          });
        }
      }
    });
    
    observer.observe(containerRef.current);
    
    // Initial fallback just in case
    setContainerSize({
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight
    });
    
    return () => observer.disconnect();
  }, []);

  const getNodeColor = (node) => {
    switch(node.label) {
      case 'Organism': return '#10b981'; // emerald
      case 'Molecule': return '#3b82f6'; // blue
      case 'Condition': return '#ef4444'; // red
      case 'Process': return '#f59e0b'; // amber
      case 'Technology': return '#8b5cf6'; // purple
      default: return '#6366f1'; // indigo
    }
  };

  const NodeLabel = (node) => `${node.name || node.id} (${node.label || 'Unknown'})`;

  return (
    <div className="absolute inset-0 z-40 bg-gray-950 flex flex-col font-sans">
      {/* Header controls */}
      <div className="absolute top-4 left-4 z-50 flex items-center gap-4">
        <button 
          onClick={onClose} 
          className="px-4 py-2 bg-gray-800/80 hover:bg-gray-700 text-white rounded-lg backdrop-blur-sm transition-colors shadow-lg border border-gray-700 font-medium"
        >
          <i className="fa-solid fa-arrow-left mr-2"></i> Back to Galaxy
        </button>
        <button 
          onClick={() => setShowInfoModal(true)}
          className="px-4 py-2 bg-indigo-600/80 hover:bg-indigo-500 text-white rounded-lg backdrop-blur-sm transition-colors shadow-lg border border-indigo-500 font-medium"
        >
          <i className="fa-solid fa-circle-info mr-2"></i> How is this built?
        </button>
      </div>

      {/* Loading Indicator */}
      {loadingProgress < 100 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-gray-800/90 backdrop-blur-md px-6 py-2 rounded-full shadow-lg border border-indigo-500/30 flex items-center gap-3">
          <i className="fa-solid fa-circle-notch fa-spin text-indigo-400"></i>
          <span className="text-gray-200 font-medium">Building Knowledge Graph... {loadingProgress}%</span>
        </div>
      )}

      {/* Stats and Controls Panel */}
      <div className="absolute bottom-4 right-4 z-50 bg-gray-900/80 backdrop-blur-md border border-gray-700 rounded-xl p-4 shadow-2xl w-80 text-sm max-h-[calc(100vh-2rem)] overflow-y-auto no-scrollbar">
        <h3 className="text-white font-bold text-lg mb-3 border-b border-gray-700 pb-2">Graph Statistics</h3>
        {stats && (
          <div className="space-y-3 mb-4">
            <div className="flex justify-between text-gray-300">
              <span>Total Nodes</span>
              <span className="font-mono text-indigo-300">{stats.totalNodes.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-gray-300">
              <span>Total Links</span>
              <span className="font-mono text-indigo-300">{stats.totalEdges.toLocaleString()}</span>
            </div>
            <div className="pt-2 border-t border-gray-800 grid grid-cols-2 gap-2">
              {Object.entries(stats.counts).sort((a, b) => b[1] - a[1]).map(([label, count]) => (
                <div key={label} className="flex flex-col">
                   <span className="text-gray-500 text-[10px] uppercase tracking-wider truncate" title={label}>{label}</span>
                   <span className="font-mono text-gray-300">{count.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <h3 className="text-white font-bold mb-3 border-b border-gray-700 pb-2">Controls</h3>
        <div className="flex flex-col gap-2">
          <button 
            onClick={() => { if(graphRef.current && graphRef.current.zoomToFit) graphRef.current.zoomToFit(600); }}
            className="w-full py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded transition-colors flex justify-center items-center gap-2 border border-gray-600"
          >
            <i className="fa-solid fa-compress"></i> Reset Camera
          </button>
          <button 
            onClick={() => { if(graphRef.current && graphRef.current.d3ReheatSimulation) graphRef.current.d3ReheatSimulation(); }}
            className="w-full py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded transition-colors flex justify-center items-center gap-2 border border-gray-600"
          >
            <i className="fa-solid fa-fire-flame-curved"></i> Reheat Physics
          </button>
          <button 
            onClick={() => setShowLinks(!showLinks)}
            className={`w-full py-1.5 rounded transition-colors flex justify-center items-center gap-2 border ${showLinks ? 'bg-indigo-900/50 border-indigo-700 text-indigo-300' : 'bg-gray-800 border-gray-600 text-gray-400'}`}
          >
            <i className={`fa-solid ${showLinks ? 'fa-eye-slash' : 'fa-eye'}`}></i> {showLinks ? 'Hide Links (Boost FPS)' : 'Show Links'}
          </button>
        </div>
      </div>
      
      {/* Graph Container */}
      <div ref={containerRef} className="flex-1 w-full h-full relative overflow-hidden bg-[#030712]">
        {containerSize.width > 0 && containerSize.height > 0 && (
          mode === '2D' ? (
            <ForceGraph2D
              ref={graphRef}
              width={containerSize.width}
              height={containerSize.height}
              graphData={graphData}
              nodeLabel={NodeLabel}
              nodeColor={getNodeColor}
              nodeRelSize={4}
              linkColor={() => '#374151'}
              linkOpacity={showLinks ? 0.3 : 0}
              backgroundColor="#030712"
              warmupTicks={0}
              cooldownTicks={150}
              onEngineStop={() => { if(graphRef.current && graphRef.current.zoomToFit) graphRef.current.zoomToFit(400); }}
              enableNodeDrag={false}
              enablePointerInteraction={true}
            />
          ) : (
            <ForceGraph3D
              ref={graphRef}
              width={containerSize.width}
              height={containerSize.height}
              graphData={graphData}
              nodeLabel={NodeLabel}
              nodeColor={getNodeColor}
              nodeRelSize={4}
              linkColor={() => '#374151'}
              linkOpacity={showLinks ? 0.3 : 0}
              backgroundColor="#030712"
              nodeResolution={8}
              linkResolution={2}
              warmupTicks={0}
              cooldownTicks={150}
              onEngineStop={() => { if(graphRef.current && graphRef.current.zoomToFit) graphRef.current.zoomToFit(400); }}
              enableNodeDrag={false}
            />
          )
        )}
      </div>

      {/* Info Modal */}
      {showInfoModal && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 sm:p-8 max-w-2xl w-full shadow-2xl relative">
            <button 
              onClick={() => setShowInfoModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
            >
              <i className="fa-solid fa-xmark text-xl"></i>
            </button>
            <h2 className="text-2xl font-bold text-white mb-4">How is this Graph Built?</h2>
            <div className="space-y-4 text-gray-300 leading-relaxed">
              <p>
                This Knowledge Graph is dynamically generated from an extraction of <strong className="text-indigo-400">494 NASA space-biology papers</strong>.
              </p>
              <p>
                Using Natural Language Processing and LLMs during an offline indexing phase, we systematically extract entities (like Organisms, Molecules, and Conditions) and map their relationships across the literature.
              </p>
              <p>
                In the Star Engine architecture, this graph is not just decorative—it plays a load-bearing role in the <strong>GraphRAG (Retrieval-Augmented Generation)</strong> pipeline. When you ask a question, the query is linked to concept nodes here, and a 1-hop subgraph boosts the retrieval score of connected papers!
              </p>
              <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 mt-4">
                <p className="text-sm font-mono text-gray-400">
                  <i className="fa-solid fa-code mr-2"></i>
                  Want to see the code behind this? Explore the <code>notebooks/build_rag_index.ipynb</code> notebook in our repository or read the <code>README.md</code> for the full architecture breakdown.
                </p>
              </div>
            </div>
            <div className="mt-8 flex justify-end">
              <button 
                onClick={() => setShowInfoModal(false)}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

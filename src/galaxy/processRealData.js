// Merge publications.json + knowledge_graph.json into the array of paper
// records the galaxy renders.
//
// Each output record is:
//   {
//     id, title, authors, year, journal, doi, summary, keywords, organism,
//     citation_count, mission, related_papers, concepts
//   }
//
// Inputs:
//   - publicationsData : { [pmc_id]: { ...paper metadata } }     (~494 entries)
//   - knowledgeGraph   : { nodes: [...], edges: [...] }          (~6350 nodes,
//                          ~13030 edges; includes paper:* and concept nodes).

const ORGANISM_RULES = [
  { match: (s) => s.includes('human') || s.includes('homo sapien'), name: 'Human' },
  { match: (s) => s.includes('mouse') || s.includes('mus musculus'), name: 'Mouse' },
];

function classifyOrganism(nodeName, nodeSubtype) {
  const s = (nodeName || '').toLowerCase();
  for (const rule of ORGANISM_RULES) {
    if (rule.match(s)) return rule.name;
  }
  if (nodeSubtype && nodeSubtype.toLowerCase().includes('plant')) return 'Plant';
  return 'Microbe';
}

export function processRealData(publicationsData, knowledgeGraph) {
  // 1. Paper <-> paper edges (bidirectional) for the "related stars" lines.
  const relatedPapersMap = new Map();
  for (const edge of knowledgeGraph.edges) {
    if (!edge.source || !edge.target) continue;
    if (!edge.source.startsWith('paper:') || !edge.target.startsWith('paper:')) continue;
    const a = edge.source.replace('paper:', '');
    const b = edge.target.replace('paper:', '');
    if (!relatedPapersMap.has(a)) relatedPapersMap.set(a, new Set());
    if (!relatedPapersMap.has(b)) relatedPapersMap.set(b, new Set());
    relatedPapersMap.get(a).add(b);
    relatedPapersMap.get(b).add(a);
  }

  // 2. Walk concept nodes to learn (per-paper) which organisms appear and
  //    collect a small list of concepts for the "planets" view.
  const paperInfoMap = new Map();
  for (const node of knowledgeGraph.nodes) {
    if (!Array.isArray(node.paper_mentions)) continue;
    for (const pid of node.paper_mentions) {
      if (!paperInfoMap.has(pid)) {
        paperInfoMap.set(pid, { organisms: new Set(), concepts: [] });
      }
      const info = paperInfoMap.get(pid);
      if (node.label === 'Organism') {
        info.organisms.add(classifyOrganism(node.name, node.subtype));
      }
      info.concepts.push({ name: node.name, type: node.label });
    }
  }

  // 3. Build the array.
  return Object.values(publicationsData)
    .map((p) => {
      if (!p.pmc_id) return null;
      const id = p.pmc_id;
      const info = paperInfoMap.get(id) || { organisms: new Set(), concepts: [] };
      const organism = info.organisms.values().next().value || 'Microbe';
      return {
        id,
        title: p.title || 'Untitled Publication',
        authors: Array.isArray(p.authors) ? p.authors.join(', ') : 'N/A',
        year: p.year ? parseInt(p.year, 10) : 2020,
        journal: p.journal || 'Unknown Journal',
        doi: p.doi || null,
        summary: p.abstract || 'No abstract available.',
        keywords: p.keywords || [],
        organism,
        // Synthetic citation count — the source data doesn't include real
        // citation metrics. Used only to vary star luminosity in the galaxy.
        citation_count: 50 + Math.floor(Math.random() * 450),
        mission: p.mission || 'N/A',
        related_papers: Array.from(relatedPapersMap.get(id) || []),
        // Top 6 concepts become rotating "planets" around the focused star.
        concepts: info.concepts.slice(0, 6),
      };
    })
    .filter(Boolean);
}

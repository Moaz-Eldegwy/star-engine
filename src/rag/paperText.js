// Fetch a paper's full text on demand from PubMed Central.
//
// In the legacy app the XML lived under `data/papers/{pmc_id}/full_text.xml`
// (65 MB in the repo). The refactor moved that to the indexing pipeline:
// chunks are precomputed offline. For the rare "I want to summarize the whole
// thing" path we now fetch the raw JATS XML from PMC at request time.
//
// PMC's OAI endpoint is CORS-friendly and the same one the notebook uses.

const PMC_OAI = 'https://www.ncbi.nlm.nih.gov/pmc/oai/oai.cgi';
const MAX_CHARS = 15000; // Phase-1 budget; Phase-3 retrieval replaces this entirely.

const cache = new Map();

export async function fetchPaperText(pmcId, signal) {
  if (!pmcId) return null;
  if (cache.has(pmcId)) return cache.get(pmcId);

  const url = `${PMC_OAI}?verb=GetRecord&identifier=oai:pubmedcentral.nih.gov:${pmcId}&metadataPrefix=pmc`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`PMC returned HTTP ${res.status} for PMC${pmcId}.`);

  const xmlText = await res.text();
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

  // OAI responses can come back wrapped — pull the article body if present.
  const article = xmlDoc.querySelector('article') || xmlDoc.documentElement;
  const fullText = (article?.textContent || '').replace(/\s+/g, ' ').trim();
  const truncated = fullText.substring(0, MAX_CHARS);

  cache.set(pmcId, truncated);
  return truncated;
}

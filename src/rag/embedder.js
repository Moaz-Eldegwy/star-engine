// In-browser MiniLM embedder via @xenova/transformers.
//
// The model is the *same* sentence-transformers/all-MiniLM-L6-v2 the
// notebook used to precompute the chunk and KG-node embeddings, so
// precompute and runtime queries land in the same 384-d space.
//
// Loads lazily on first call. The ~25 MB of WASM + ONNX weights is
// fetched from huggingface.co (CORS-friendly), then cached by the
// browser indefinitely.
//
// We dynamically import the package so the main bundle doesn't pay for
// transformers' large dependency tree on app boot — users who only
// browse the galaxy without searching never load it.

let _pipelinePromise = null;

async function getPipeline() {
  if (_pipelinePromise) return _pipelinePromise;
  _pipelinePromise = (async () => {
    const { pipeline, env } = await import('@xenova/transformers');
    // Allow caching of model weights in the browser's HTTP cache.
    env.allowLocalModels = false;
    env.useBrowserCache = true;
    // 'feature-extraction' runs the model and returns the final hidden
    // states; we mean-pool + L2-normalize them below.
    return pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      quantized: true, // smaller download, near-identical retrieval quality
    });
  })();
  return _pipelinePromise;
}

/**
 * Embed one or more texts to a 384-d unit-length Float32Array.
 *
 * @param {string|string[]} input
 * @returns {Promise<Float32Array[] | Float32Array>}
 */
export async function embed(input) {
  const pipe = await getPipeline();
  const isArray = Array.isArray(input);
  const texts = isArray ? input : [input];
  // pooling: 'mean', normalize: true → unit-length vectors so we can use
  // dot product as cosine at retrieval time.
  const result = await pipe(texts, { pooling: 'mean', normalize: true });
  // result.data is a Float32Array of length N * 384 with strided rows.
  const dim = result.dims[result.dims.length - 1];
  const rows = result.dims[0];
  const out = [];
  for (let r = 0; r < rows; r++) {
    out.push(new Float32Array(result.data.buffer, result.data.byteOffset + r * dim * 4, dim));
  }
  return isArray ? out : out[0];
}

/** Convenience: embed exactly one query. */
export async function embedQuery(text) {
  return embed(text);
}

/** Warm-load the model in the background (e.g. while user is typing). */
export function warmupEmbedder() {
  getPipeline().catch(() => {
    /* model isn't available offline yet; we'll retry on first real call */
  });
}

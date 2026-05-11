import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base path so the same `dist/` works at:
//   - https://<user>.github.io/StarEngine/   (sub-path)
//   - https://starengineai.space/            (domain root)
// All in-app fetches must go through src/rag/assetUrl.js to honor this.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
    open: true,
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 1024,
    rollupOptions: {
      output: {
        // Group large vendor libs into their own chunks to keep the main
        // bundle small and improve cache hit rates across deploys.
        manualChunks: {
          three: ['three'],
          transformers: ['@xenova/transformers'],
          react: ['react', 'react-dom'],
        },
      },
    },
  },
  optimizeDeps: {
    // transformers.js loads ONNX runtime; pre-bundling speeds dev startup.
    include: ['@xenova/transformers'],
  },
});

// Star Engine ships as a single static build that is deployed to BOTH:
//   - GitHub Pages at https://<user>.github.io/StarEngine/   (sub-path)
//   - Hostinger    at https://starengineai.space/             (root)
//
// Vite is configured with `base: './'` so all <script>/<link> tags resolve
// correctly under either host. But code-level fetches like
// `fetch('/data/publications.json')` would break under the GH Pages sub-path.
// All such fetches must go through this helper.
//
//   import { assetUrl } from './rag/assetUrl';
//   const r = await fetch(assetUrl('data/publications.json'));
//
// At build time, Vite replaces `import.meta.env.BASE_URL` with the resolved
// base path (e.g. './'). new URL(p, base) on the page URL gives an absolute
// URL that works regardless of where the app is mounted.

export function assetUrl(path) {
  // Strip a leading slash so we treat the input as relative.
  const clean = path.replace(/^\//, '');
  return new URL(clean, document.baseURI).toString();
}

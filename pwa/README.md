# PWA packaging

Deploy copy of the game for Cloudflare Workers (assets only, served at the domain root). The Android wrapper and root `index.html` are unaffected; the manifest link and service worker are injected only into `pwa/dist/index.html`.

- `manifest.webmanifest`, `sw.js`, `_headers`, `icons/`: static sources, copied into `dist/`.
- `sw.js`: cache-first precache; the cache name contains a hash of the deployed `index.html` (replaced at build), so each deploy swaps caches silently on the next launch.
- `wrangler.jsonc`: assets-only Worker config (`./dist`).
- `dist/`: generated, git-ignored.

Build: `npm run build && npm run build:pwa`

Local test: `cd pwa/dist && python3 -m http.server 8080`, open http://localhost:8080 (localhost counts as a secure context).

Deploy: `npx wrangler deploy --config pwa/wrangler.jsonc` (the first run prompts for Cloudflare login).

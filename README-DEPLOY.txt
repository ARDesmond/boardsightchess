BOARDSIGHT CHESS 2.0 — RUN AND DEPLOY

LOCAL PREVIEW
1. Install a current Node.js runtime if needed.
2. Open a terminal in this folder.
3. Run: node serve.cjs
4. Open http://127.0.0.1:8001
No npm install, build step, API key, account, or backend is required.
Do not open index.html with file://: browser Workers/WASM require HTTP(S).
Any static HTTP server that serves .wasm as application/wasm also works.

CHECKS
node tests.cjs
node engine-tests.cjs
The second command runs the real bundled WASM engine at all eleven levels.

CLOUDFLARE PAGES
Upload the contents of the clean Boardsight-2.0 handoff folder using the
existing Pages direct-upload workflow. index.html must be at the site root.
Include styles.css, app.js, chess.js, openings.js, engine.js, vendor/stockfish,
favicon.svg, site.webmanifest, robots.txt, and _headers.
Keep the Stockfish license and matching source archive available.
serve.cjs and the test/report files are for local development; they do not
need to execute on the host. No Pages Functions or backend is required.
No cross-origin isolation headers are required for this single-thread build.

The optional GA4 hooks remain inactive unless explicitly configured.
The app contains no advertising popup, placeholder, creative or ad timer.
Visual assets live in assets/pieces and favicon.svg. Include them when
uploading the site. No new runtime dependency was added by the reskin.

All work is local. No GitHub login, push, merge, or remote update was made.

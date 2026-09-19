# Stockfish engine provenance

Boardsight uses Stockfish.js 18 Lite single-threaded WASM, npm stockfish 18.0.8.
The bundled JS and WASM are unmodified upstream files renamed to stockfish.js
and stockfish.wasm so the loader finds its companion automatically.

Upstream: https://github.com/nmrugg/stockfish.js
Release: https://www.npmjs.com/package/stockfish/v/18.0.8
Source commit: 93c994592dcf3b4b21052ab925e9b534df9c0918
Original artifacts:
https://unpkg.com/stockfish@18.0.8/bin/stockfish-18-lite-single.js
https://unpkg.com/stockfish@18.0.8/bin/stockfish-18-lite-single.wasm

Copyright 2026 Chess.com, LLC; based on Stockfish by T. Romstad,
M. Costalba, J. Kiiski, G. Linscott and other contributors; nets by Linmiao Xu.
Stockfish is distributed under GPL version 3; see COPYING.txt.
The matching upstream source and build scripts are included in
stockfish-18.0.8-source.zip. Keep this archive and license available with the
engine when redistributing the site. The upstream README, AUTHORS, build.js,
scripts/net.sh and src/emscripten contain build and network-download details.
The engine binary contains its neural network; no additional network fetch
occurs during play. Upstream compilation tools are only needed to rebuild
Stockfish, not to deploy Boardsight.

The build uses a worker without SharedArrayBuffer, COOP or COEP requirements.
Serve stockfish.wasm as application/wasm over HTTP(S). The app sends only FEN
and UCI commands to a same-origin local worker; no external engine service is
used. The engine is loaded on demand for computer play.

SHA-256 of shipped upstream binaries:
stockfish.js: 5243fd9b276cab7dfe3ad1d43ab9ead73568fac76468c614242977a210c4a391
stockfish.wasm: a8fbc05ec6920b56d7485826dcb02c5ffd2826bcbf751cf973046f237a9096f1
The untouched upstream source archive contains its own vendored uglify-js
build tool. It is retained inside that archive for source completeness; it
is not an installed dependency folder in the Boardsight application.

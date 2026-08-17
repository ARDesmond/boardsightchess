# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

BoardSight Chess is a single-file, no-build, no-dependency static web app: a free chess trainer that
visualizes board control (which squares each side attacks) while you play against a simple built-in AI.
There is no `package.json`, no bundler, no framework, and no test suite — everything (styles, chess
engine, AI, and UI) lives inline in `index.html`.

## Files

- `index.html` — the entire application: `<style>` block, then a single `<script>` containing three
  self-contained pieces (in order): a `Chess` engine (IIFE returning `{ Chess }`), a `chooseComputerMove`
  minimax AI (IIFE returning `{ chooseComputerMove }`), and the UI/game controller that builds the DOM and
  wires up events.
- `favicon.svg`, `site.webmanifest` — PWA/icon metadata.
- `robots.txt` — trivial allow-all.
- `README-DEPLOY.txt` — AWS deploy instructions: a private S3 bucket behind a CloudFront distribution
  (Origin Access Control, ACM certificate for HTTPS), with Route 53 alias records pointing
  `boardsightchess.com` at the distribution. Security response headers (nosniff, referrer policy,
  permissions policy) are set via a CloudFront Response Headers Policy rather than a hosting-provider
  headers file. No CI/CD pipeline exists — deploys are a manual `aws s3 sync` plus a CloudFront cache
  invalidation.

## Development workflow

There is no build, lint, or test command. To work on this app:

- Open `index.html` directly in a browser, or serve the directory locally (e.g. `python3 -m http.server`)
  and visit it — either works since there are no build artifacts.
- Verify changes by playing a game in the browser: make a move, confirm the computer replies, check the
  board-control overlay colors update, and check the square inspector panel updates on hover/focus/tap.
- No automated tests exist. Manually re-check: new game / take-back / all three "Control map" modes
  (`always`, `hold` Space-to-reveal, `off`) / checkmate and stalemate end states / castling and en passant
  if touched, and pawn promotion (all four piece types, both colors, including canceling the picker).

## Architecture

### Chess engine (`Chess` class, top of the script)

A from-scratch, dependency-free chess rules engine (not chess.js, though the API intentionally mirrors it:
`fen()`, `move()`, `moves()`, `get()`, `put()`, `undo()`, `isCheckmate()`, etc.). Board state is an 8x8
array (`this.board[y][x]`, `y=0` is rank 1) of `{ color, type }` or `null`. Key internals:

- `move()` only accepts coordinate-notation input (`"e2e4"`, or `{from, to, promotion}`) — no full SAN
  parsing on input, though SAN is *generated* for display via `_sanForMove`.
- Legality is computed by generating pseudo-legal moves (`_pseudoMoves`) then filtering out any that leave
  the mover's own king attacked (`_legalMoves`, via a make/unmake pass using `_makeMove`/`_restoreRecord`).
- `_makeMove(move, commit)` always returns a restore record; `commit: false` is how `_legalMoves` and the
  AI's search probe positions without mutating persistent game history (`moveStack`/`gameHistory`).
- Draw detection covers threefold repetition (`positionCounts` keyed by FEN board+turn+castling+ep),
  insufficient material, stalemate, and the 100-halfmove rule.

### Computer AI (`chooseComputerMove`, second IIFE)

Minimax with alpha-beta pruning over a hand-rolled material + center-distance + pawn-advancement
evaluation (`evaluatePosition`). `depth` comes from the UI's difficulty select (1/2/3). At `depth === 1`
there's a 42% chance of picking a uniformly random legal move instead of searching, so "Beginner" plays
intentionally weakly rather than just searching shallow. Each recursive step clones the position via
`new Chess(chess.fen())` rather than mutating in place — simple but means search cost scales with FEN
serialization, worth knowing before raising default search depth.

### UI / game controller (rest of the script)

Plain DOM manipulation, no virtual DOM: `app.innerHTML` is set once to build the shell, then `renderBoard()`
tears down and rebuilds `#board`'s children on every state change (move, hover, control-map toggle, etc.).
Notable pieces:

- `generateAttackMap()` recomputes, from scratch, every square every piece attacks (independent of the
  engine's legality filtering — this is raw attack coverage, not legal-move targets) and drives both the
  control overlay coloring and the square-inspector panel.
- `overlayColor()` turns per-square attacker counts into an HSL color: blue-only, red-only, or a
  blue-to-red blend for contested squares, with a `map-mode` select (`always` / `hold` Space-to-reveal /
  `off`) gating visibility. Board orientation flips (`orientationSquares()`) when the player is Black.
- `AD_CONFIG` and the `#ad-modal` show a placeholder sponsor image between games (`requestNewGameWithAd` →
  `closeAdAndStart` → `startNewGame`); it's inert until a real creative/click URL is set.
- `promotionPending` + `#promotion-modal` prompt for queen/rook/bishop/knight when a pawn move has more
  than one legal promotion target (`onSquareClick` → `openPromotionPicker` →
  `resolvePromotion`/`cancelPromotion`); `makePlayerMove(from, to, promotion)` threads the choice into
  `game.move()`.
- `trackEvent()` is a no-op unless `window.gtag` exists — GA4 event hooks (`game_start`, `ad_opportunity`,
  `ad_closed`, `take_back`) only fire if a GA4 tag is added; see `README-DEPLOY.txt`.

### Responsive layout

CSS in the `<style>` block handles four breakpoints explicitly: desktop grid, `max-width: 900px` (stacked
single column), `max-width: 620px` (mobile portrait), and a landscape short-height media query for phones
in landscape. When touching layout, check all four, plus `prefers-reduced-motion`.

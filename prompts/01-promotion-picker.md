# Fix: Add a pawn-promotion piece picker

## Codebase context

BoardSight Chess (`boardsightchess.com`) is a single-file, no-build, no-dependency static web
app: a free chess trainer that visualizes board control while you play against a simple built-in
AI. Everything lives inline in one file, `index.html` — a `<style>` block, then a single
`<script>` containing three self-contained pieces in order: a `Chess` engine (IIFE returning
`{ Chess }`), a `chooseComputerMove` minimax AI (IIFE returning `{ chooseComputerMove }`), and a
plain-DOM UI/game controller. There is no framework, no build step, no test suite — read
`CLAUDE.md` at the repo root for the full architecture writeup before starting.

## The problem (from a prior audit, severity 6/10)

The `Chess` engine fully supports underpromotion — `move({from, to, promotion})` accepts
`'q'|'r'|'b'|'n'`, and `_pawnMoves` already generates all four as distinct pseudo-legal moves when
a pawn reaches the last rank (see `PROMOTIONS = ['q','r','b','n']` near the top of the engine
IIFE). But the UI never lets a human player choose: `makePlayerMove(from, to)` hardcodes
`game.move({ from, to, promotion: 'q' })` unconditionally. There is no picker, dialog, or any UI
path to promote to a rook, bishop, or knight. Under FIDE Laws of Chess (Art. 3.7e), promotion
choice belongs to the player, and underpromotion is occasionally forced (e.g. to avoid stalemate,
or a knight promotion delivering a smothered mate) — auto-queening removes real, sometimes
game-critical choice, not just a cosmetic option.

## Task

When a pawn move's destination is on the back rank (rank 8 for White, rank 1 for Black), present a
lightweight piece-choice UI before finalizing the move, then call `game.move({from, to,
promotion: chosenLetter})` with the player's choice.

Relevant existing code to read first:
- `onSquareClick(square)` and `makePlayerMove(from, to)` — the current click-to-move flow.
- `legalTargets` — populated via `game.moves({ square, verbose: true })` when a piece is selected;
  for a promoting pawn this array will contain 4 entries with the same `to` but different
  `promotion` values. `legalByTarget` in `renderBoard()` currently collapses these into one
  move-dot per square (a `Map` keyed by `to`), which is fine for rendering the dot but means you
  need your own detection logic for "is this a promotion move" (check `piece.type === 'p'` and
  target rank is 0 or 7 in 0-indexed terms, i.e. `'1'`/`'8'` in square notation).
- `.modal-backdrop` / `.modal` CSS classes already exist (used for the sponsor-ad modal,
  `#ad-modal`) — reuse this styling language for a promotion picker rather than inventing new
  modal CSS, for visual consistency. A small on-board popover near the target square is also a
  reasonable alternative to a full modal — use your judgment on which reads better against the
  existing board/side-panel layout.
- `PIECES` object (Unicode glyphs like `♕♖♗♘`) — reuse these glyphs for the picker buttons rather
  than adding new assets.

## Constraints

- No build step, no external dependencies/libraries — plain inline HTML/CSS/JS added directly to
  `index.html`, matching the existing code style (see `renderBoard`, `requestNewGameWithAd` for
  established patterns of building/toggling UI).
- Must work correctly for both colors and both board orientations (`orientationSquares()` flips
  the board when the player is Black).
- Should be dismissable/cancelable sensibly (what happens if the player backs out? Look at how
  `closeAdAndStart`/Escape handling works for the ad modal as a reference for the interaction
  pattern, though promotion cancellation semantics are your call — e.g. reverting to no selection
  vs. defaulting to queen).
- Don't touch the AI/minimax side — `chooseComputerMove` already evaluates all four promotion
  options correctly via `game.moves({verbose: true})`; this task is player-facing UI only.

## Verification

No test suite exists — verify manually in a browser (open `index.html` directly, or
`python3 -m http.server` and visit it):
1. Play as White, push a pawn to the 8th rank, confirm the picker appears and each of the four
   choices produces the correct piece on the board.
2. Play as Black, push a pawn to the 1st rank, confirm the same, with correct board orientation.
3. Confirm check/checkmate detection still fires correctly immediately after a promotion (the
   status line and any check/mate `+`/`#` logic depends on post-move state).
4. Confirm capture-promotions (pawn captures a piece while promoting) still work and show the
   picker.
5. Re-run the existing manual regression checklist from `CLAUDE.md` (new game / take-back / all
   three control-map modes / checkmate and stalemate / castling and en passant) to confirm nothing
   else broke, and add "promotion (all four piece types, both colors)" to that checklist in
   `CLAUDE.md` since it's currently missing from the documented manual test list.

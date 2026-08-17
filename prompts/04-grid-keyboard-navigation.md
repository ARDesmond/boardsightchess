# Fix: `role="grid"` board has no arrow-key navigation

## Codebase context

BoardSight Chess (`boardsightchess.com`) is a single-file, no-build, no-dependency static web
app: a free chess trainer that visualizes board control while you play against a simple built-in
AI. Everything lives inline in one file, `index.html` — plain DOM manipulation, no framework. Read
`CLAUDE.md` at the repo root for the full architecture writeup before starting.

## The problem (from a prior audit, severity 5/10)

The board container `#board` has `role="grid"`, and each of its 64 square `<button>`s has
`role="gridcell"` (see the template string that builds the app shell, and the per-square creation
loop in `renderBoard()`). Per the WAI-ARIA Authoring Practices Guide "Grid" pattern
(https://www.w3.org/WAI/ARIA/apg/patterns/grid/), declaring `role="grid"` sets an expectation for
assistive-tech users that arrow keys move a virtual focus cursor between cells using a *roving
tabindex* (exactly one cell is a Tab stop at any time; arrow keys move focus without changing Tab
order elsewhere on the page). None of that is implemented today. Every square button is presumably
its own individual Tab stop with default tab order, so a keyboard user must Tab up to 64 times to
cross the board, and pressing an arrow key while focused on a square currently does nothing —
which will surprise/confuse a screen-reader user who knows the ARIA grid convention and tries it.

## Related work — check before starting

There is a companion audit finding, "keyboard focus is lost after every board render" (severity
6/10, likely addressed in a separate conversation/prompt file named
`02-keyboard-focus-restoration.md` in this same `prompts/` directory). Arrow-key navigation is
pointless if focus resets to `<body>` after every move. **Check whether that fix has already
landed in `index.html`** (look for focus-tracking/restoration logic around `renderBoard()`,
`onSquareClick`, `makePlayerMove`) before starting this task:
- If it has landed, build your roving-tabindex logic on top of its focus-tracking approach rather
  than inventing a second, possibly conflicting one.
- If it hasn't landed yet, this task must *also* ensure focus survives re-renders (at minimum,
  re-apply `tabindex="0"` to the correct square and re-focus it after `renderBoard()` rebuilds the
  DOM), since roving-tabindex arrow navigation is meaningless if the roving element gets destroyed
  on every move.

## Task

Implement the standard ARIA grid roving-tabindex + arrow-key interaction pattern for the 8x8
board:
- Exactly one square has `tabindex="0"` at any time (the "roving" cell — e.g. the currently
  selected square, or the last-focused square); all other squares have `tabindex="-1"`.
- ArrowUp/ArrowDown/ArrowLeft/ArrowRight move focus one square in the corresponding *visual*
  direction. Important: `orientationSquares()` already flips file/rank iteration order when the
  player is Black, so "visual up" must be computed relative to current board orientation, not
  always "+1 rank" — read `orientationSquares()` and `renderBoard()` carefully to understand how
  squares are currently laid out on screen for each orientation before writing the direction math.
- Clamp at board edges (arrow key at the edge either does nothing or wraps — pick one and be
  consistent; clamping with no wraparound is the simpler/more conventional choice for a grid
  pattern, but use your judgment).
- Home/End for jumping to the start/end of a rank is optional/nice-to-have, not required.
- Existing interactions must keep working exactly as before: mouse click, tap, and native
  Enter/Space activation on a focused `<button>` (which already triggers the existing `click`
  handler — don't duplicate or interfere with that).

## Constraints

- No build step, no external dependencies/libraries — plain vanilla JS/DOM added to the existing
  UI-controller section of `index.html`, matching existing style (see `onSquareClick`,
  `renderBoard` for established patterns).
- Must not break the existing global Space-bar handling: `window.addEventListener('keydown', ...)`
  currently uses `event.code === 'Space'` to implement the "hold Space to reveal control map"
  feature when `map-mode` is set to `hold`. Your arrow-key handling must be scoped appropriately
  (e.g. only active when focus is within `#board`) and must not consume/`preventDefault()` the
  Space key or otherwise interfere with that existing feature.
- Must not break the ad modal's own Escape-to-close keyboard handling.

## Verification

No test suite exists — verify manually in a browser, **using only the keyboard**:
1. Tab into the board (should take exactly one Tab stop to enter the grid, thanks to roving
   tabindex), then use arrow keys to reach any square on the board in a handful of keystrokes.
2. Select a piece with Enter/Space, arrow to a legal destination, confirm Enter/Space still makes
   the move.
3. Play a full game as both White and Black (confirm arrow directions are correct in both board
   orientations).
4. Confirm the Space-bar "hold to reveal control map" feature (`map-mode` = "Hold Space to
   reveal") still works correctly and isn't broken by the new keydown handling.
5. If available, spot-check with a screen reader (VoiceOver on macOS, or NVDA on Windows) that
   grid navigation is announced sensibly.
6. Re-run the existing manual regression checklist from `CLAUDE.md` (new game / take-back / all
   three control-map modes / checkmate and stalemate / castling and en passant).

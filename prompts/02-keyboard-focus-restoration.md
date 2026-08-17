# Fix: Keyboard focus is lost after every board render

## Codebase context

BoardSight Chess (`boardsightchess.com`) is a single-file, no-build, no-dependency static web
app: a free chess trainer that visualizes board control while you play against a simple built-in
AI. Everything lives inline in one file, `index.html` — plain DOM manipulation, no virtual DOM,
no framework. Read `CLAUDE.md` at the repo root for the full architecture writeup before starting;
in particular note that `renderBoard()` "tears down and rebuilds `#board`'s children on every
state change (move, hover, control-map toggle, etc.)."

## The problem (from a prior audit, severity 6/10)

Each of the 64 board squares is a real `<button class="square" role="gridcell">`, which is good —
native buttons are Tab-focusable and Enter/Space already trigger their `click` handler, so
keyboard move-making mostly works today. But `renderBoard()` does `boardEl.innerHTML = ''` then
recreates all 64 square buttons from scratch on every move, every new game, and every control-map
toggle. This destroys whatever DOM node currently has keyboard focus. Nothing re-focuses anything
afterward, so focus silently falls back to `<body>`.

In practice: a keyboard-only user Tabs to a piece's square, presses Enter to select it, Tabs to a
destination square, presses Enter to move — and after that move completes, their focus is gone.
To make their next move they must Tab from the very top of the page, through every side-panel
control (play-as select, difficulty select, map-mode select, new-game button, take-back button),
before reaching the board again. This makes playing a full game via keyboard alone impractical,
even though individual squares are technically focusable.

## Task

After `renderBoard()` rebuilds the board's DOM, explicitly restore keyboard focus to a sensible
square instead of letting it fall back to `<body>`.

Relevant existing code to read first:
- `renderBoard()` — the full teardown/rebuild loop that creates each `squareEl` and currently
  attaches `click`, `mouseenter`, and `focus` listeners to it.
- `onSquareClick(square)` — the click-to-move flow; note `selectedSquare` (module-level state,
  currently used to render the `.selected` CSS ring) and `hoveredSquare` (module-level state, used
  only for the mouse-driven square-inspector panel — **do not conflate this with keyboard focus
  tracking; they are different signals with different owners** — mouse hover should keep updating
  the inspector panel, keyboard focus restoration is a separate concern).
- `makePlayerMove(from, to)` and `scheduleComputerMove()` — both call `renderBoard()` after
  mutating game state; both are candidate points where a "square to refocus" should be determined
  (e.g. the move's destination square is a natural place to land focus after a move completes).
- `startNewGame()` — also calls `renderBoard()`; there's no prior focused square on first render,
  so the fix must not throw or behave oddly when nothing was previously focused.
- The `#ad-modal` flow (`requestNewGameWithAd`/`closeAdAndStart`) already does manual focus
  management (`document.querySelector('#ad-close').focus()`) — useful as a local style reference,
  but don't let the promotion/board fix interfere with it.

## Suggested approach (adjust as needed)

Track which square currently has keyboard focus via the existing per-square `focus` event
listener (extend it to record the square, e.g. a module-level `focusedSquare` variable, separate
from `hoveredSquare` and `selectedSquare`). After `renderBoard()` finishes rebuilding the DOM,
look up the new element for the square that should receive focus (destination square after a
move; the same square that was focused if nothing moved, e.g. after a control-map toggle; some
sensible default like the king's square or `a1`/`h8` if nothing was ever focused) and call
`.focus()` on it via `boardEl.querySelector('[data-square="..."]')`.

## Constraints

- No build step, no external dependencies — plain vanilla JS/DOM, matching existing code style.
- Must not break mouse hover behavior (`renderSquareDetails` on `mouseenter` must keep working
  exactly as before).
- Must not break the existing Space-bar "hold to reveal control map" global keydown/keyup
  listeners, or the ad modal's Escape-to-close handling.
- Should behave sensibly on the very first render (no prior focus to restore) and after a
  take-back (`takeBack()` also triggers a re-render).

## Verification

No test suite exists — verify manually in a browser, **using only the keyboard** (Tab, Shift+Tab,
Enter, Space — no mouse):
1. Tab into the board, select a piece, select a destination, confirm the move is made and that
   focus lands on a sensible square afterward rather than resetting to the top of the page.
2. Play several consecutive moves purely via keyboard and confirm you never lose your place.
3. Trigger a computer move (let the AI reply) and confirm focus is still sensible afterward, even
   though the human didn't initiate that particular render.
4. Toggle "Control map" between its three modes and confirm focus survives that re-render too.
5. Take back a move and confirm focus is still sensible.
6. If a screen reader is available (VoiceOver on macOS, NVDA on Windows), spot-check that focus
   changes are announced coherently rather than jumping unpredictably.
7. Re-run the existing manual regression checklist from `CLAUDE.md` (new game / take-back / all
   three control-map modes / checkmate and stalemate / castling and en passant).

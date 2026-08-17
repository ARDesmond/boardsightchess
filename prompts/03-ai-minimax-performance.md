# Fix: AI search re-clones the position via FEN on every node instead of make/unmake

## Codebase context

BoardSight Chess (`boardsightchess.com`) is a single-file, no-build, no-dependency static web
app: a free chess trainer that visualizes board control while you play against a simple built-in
AI. Everything lives inline in one file, `index.html`. Read `CLAUDE.md` at the repo root for the
full architecture writeup before starting. Two relevant excerpts from it:

> `_makeMove(move, commit)` always returns a restore record; `commit: false` is how `_legalMoves`
> and the AI's search probe positions without mutating persistent game history
> (`moveStack`/`gameHistory`).

> Minimax with alpha-beta pruning over a hand-rolled material + center-distance +
> pawn-advancement evaluation (`evaluatePosition`). ... Each recursive step clones the position
> via `new Chess(chess.fen())` rather than mutating in place — simple but means search cost scales
> with FEN serialization, worth knowing before raising default search depth.

## The problem (from a prior audit, severity 5/10)

`minimax()` and `chooseComputerMove()` (in the `chooseComputerMove` IIFE, the second of the three
script sections) both call `new Chess(chess.fen())` at every node of the search tree.
`Chess.fen()` scans all 64 squares building a FEN string; `Chess.load()` (called by the
constructor) then re-parses that string character-by-character and rebuilds the entire 8x8 board
array from scratch. This happens at *every single node* visited during minimax — at difficulty 3
("Challenging", depth 3) with a branching factor of 30+ legal moves per position, that's a
non-trivial amount of redundant string building/parsing, and it's the direct cause of the
"Computer thinking…" latency, worst on slower/mobile devices.

The `Chess` engine already has an efficient in-place alternative used internally for exactly this
kind of "try a move, check something, then undo it" pattern: `_makeMove(move, commit)` (with
`commit: false`) returns a restore record without touching `moveStack`/`gameHistory`, and
`_restoreRecord(record)` puts the board back exactly as it was. `Chess._legalMoves()` already uses
this pair to probe every pseudo-legal move for king safety without ever calling `fen()`/`load()`.
The AI layer doesn't reuse this — it's a separate, less efficient path doing the same conceptual
thing.

## Task

Rewrite the AI's search (`minimax()` and the top-level loop in `chooseComputerMove()`) to use
make/unmake directly on a `Chess` instance instead of constructing `new Chess(chess.fen())` at
every node. This is a **pure performance refactor** — the goal is identical search behavior and
identical move selection, just without the FEN round-trip.

## Design decision to make explicitly

`_makeMove` and `_restoreRecord` are prefixed with `_` (a JS naming convention for "private," not
actually enforced — there are no real private class fields here, so calling
`chess._makeMove(...)` from the separate AI IIFE is *already possible today* with zero engine
changes). Decide, and justify in a short comment or commit message:
- **Option A**: Have the AI reach into `chess._makeMove`/`chess._restoreRecord` directly, treating
  the underscore as documentation-only (matches how `_legalMoves` already crosses this line
  internally).
- **Option B**: Add a small intentionally-public method to the `Chess` class (e.g.
  `withMove(move, fn)` that makes a move, invokes `fn`, and always restores afterward even if `fn`
  throws) so the AI has a real public API to call instead of reaching into internals.

Either is defensible for a single-file app with no external consumers of the `Chess` class; pick
one and be consistent.

## Constraints

- No build step, no external dependencies/libraries.
- Must preserve exact existing behavior that is *not* about the cloning mechanism:
  - The capture-first move ordering heuristic (`moves.sort((a,b) => Number(Boolean(b.captured)) -
    Number(Boolean(a.captured)))`).
  - The depth-1 "Beginner" quirk: a 42% chance of picking a uniformly random legal move instead of
    searching (`Math.random() < 0.42`) — this is intentional, not a bug, don't remove it.
  - Alpha-beta pruning behavior and the terminal-node evaluation via `evaluatePosition`, which
    depends on `chess.isCheckmate()`/`chess.isDraw()` reading correctly against whatever state is
    currently on the board — confirm these still evaluate correctly when called against a
    make/unmake-probed (uncommitted) position rather than a freshly-constructed `Chess` instance.
  - Random tie-breaking among equally-scored best moves in `chooseComputerMove`.
- Always restore state before evaluating a sibling move at the same level, mirroring the pattern
  already established in `Chess._legalMoves()`.
- Update the CLAUDE.md excerpt quoted above once the approach changes — it currently documents the
  FEN-clone behavior as a known characteristic; that documentation should reflect whatever the new
  approach is once this lands.

## Verification

No test suite exists — verify manually:
1. Before making changes, temporarily instrument `chooseComputerMove` to log the chosen move (or
   the `bestScore`/`bestMoves` candidates) for a handful of fixed FEN positions and difficulty
   levels. After the refactor, confirm the same logging produces the same results for the same
   positions (accounting for the intentional randomness sources noted above — you may need to seed
   or temporarily disable those two random branches for a clean A/B comparison, then re-enable
   them). Remove the temporary logging when done.
2. Play full games against the AI at all three difficulty levels in a browser (open `index.html`
   directly or serve via `python3 -m http.server`), confirming no legality regressions and no
   crashes.
3. Informally compare "Computer thinking…" latency before and after at difficulty 3
   ("Challenging") — it should be noticeably faster; this is the whole point of the change.
4. Re-run the existing manual regression checklist from `CLAUDE.md` (new game / take-back / all
   three control-map modes / checkmate and stalemate / castling and en passant).

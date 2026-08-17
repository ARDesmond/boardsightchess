# Fix: Board-control overlay relies on hue alone (colorblind accessibility)

## Codebase context

BoardSight Chess (`boardsightchess.com`) is a single-file, no-build, no-dependency static web
app: a free chess trainer whose entire product premise is visualizing "board control" — which
squares each side attacks — while you play against a simple built-in AI. Everything lives inline
in one file, `index.html`. Read `CLAUDE.md` at the repo root for the full architecture writeup
before starting; in particular:

> `overlayColor()` turns per-square attacker counts into an HSL color: blue-only, red-only, or a
> blue-to-red blend for contested squares, with a `map-mode` select (`always` / `hold`
> Space-to-reveal / `off`) gating visibility.

## The problem (from a prior audit, severity 5/10)

`overlayColor(square, attackMap)` computes an HSL color per square: a blue hue (~215°) for squares
the player controls, a red hue (~347°) for opponent-controlled squares, and a blend that
interpolates hue between them (through purple, ~220°–340°) for contested squares, with lightness
deepening as attacker count increases. This is the **only** visual encoding painted directly onto
the board — there is no pattern, icon, border treatment, or number on the squares themselves to
convey the same information without discriminating hue. Since board control is this app's entire
stated value proposition ("BoardSight"), this makes the core feature partly or fully unreadable at
a glance for colorblind users (deuteranopia, protanopia, tritanopia). A separate text-based
"Square inspector" side panel (`renderSquareDetails`, triggered on hover/focus/tap) already
reports the same mine/theirs attacker counts in plain text — a genuine accessible fallback — but
it requires exploring one square at a time, which defeats the point of an at-a-glance overlay.

## Task

Add a redundant, non-color-dependent visual signal to the control-map overlay so it's legible
without relying on hue discrimination, **without removing the existing color scheme** — color
stays as the primary encoding; this adds a secondary one. This is partly a design decision — use
your judgment, but here are reasonable directions to consider:

- **Numeric badge**: a small corner label on contested/controlled squares showing attacker
  counts (the raw `mine`/`theirs` numbers are already computed inside `overlayColor()` and
  `describeSquare()`/`renderSquareDetails()` — just not currently rendered on the square itself).
- **Fill pattern**: distinct hatching/texture (e.g. one diagonal direction for "mine," the other
  for "theirs," cross-hatch for contested) via CSS `background-image` gradients instead of/in
  addition to a flat color fill.
- **Corner glyph/shape**: a small distinct marker shape or symbol per side instead of/alongside
  color.

Pick one approach (or a combination) and implement it. Weigh visual clutter against legibility —
this has to still look good and not overwhelm a small mobile board.

## Relevant existing code to read first

- `overlayColor(square, attackMap)` and `renderBoard()`'s `.control-overlay` element — where the
  color is currently applied; you'll likely add a sibling element or extra styling here.
- `describeSquare()` / `renderSquareDetails()` — already compute per-square `mine`/`theirs`
  attacker counts; reuse this data rather than recomputing it.
- The `:root` CSS custom properties (`--accent`, `--danger`, etc.) and the existing
  `.legend-swatch` classes in the "Control-map colors" card — match the app's established visual
  language rather than introducing an unrelated new style.
- The `.legend` section in the side panel (the "Control-map colors" card, near
  `<h3>Control-map colors</h3>`) documents the current blue/red/purple/clear scheme — update it to
  document whatever new encoding you add, so users understand how to read the map.

## Constraints

- No build step, no external dependencies/libraries — no icon fonts, no SVG sprite libraries;
  inline SVG or plain CSS/Unicode characters only if you need iconography.
- Must only render when the color overlay itself is visible — respect the existing `map-mode`
  gating (`mapModeEl.value` is `'always'`/`'hold'`/`'off'`, combined with the `holdRevealActive`
  flag for the hold-to-reveal mode). Don't show the new encoding when the overlay itself is
  hidden.
- Must remain legible across all four documented responsive breakpoints — per `CLAUDE.md`:
  "CSS in the `<style>` block handles four breakpoints explicitly: desktop grid, `max-width: 900px`
  (stacked single column), `max-width: 620px` (mobile portrait), and a landscape short-height media
  query for phones in landscape. When touching layout, check all four." Pay particular attention
  to the smallest board size (the `max-width: 620px` breakpoint, where `.board-wrap` caps around
  680px and pieces already use a tight `clamp()` font size) — whatever you add must not become
  illegible or overlap the piece glyph at that size.
- Respect `prefers-reduced-motion` if you add any transition/animation to the new encoding.

## Verification

No test suite exists — verify manually in a browser:
1. Play a game with the control map set to "Always visible," confirm the new encoding renders
   correctly on controlled, contested, and uncontrolled squares.
2. Use a colorblindness simulator — Chrome DevTools → More tools → Rendering → "Emulate vision
   deficiencies" (or Firefox's equivalent) — set it to protanopia, deuteranopia, and tritanopia in
   turn, and confirm the control map remains interpretable (you can tell "mine" from "theirs" from
   "contested") without relying on hue.
3. Check legibility at the smallest mobile board size (resize the browser to the `max-width: 620px`
   breakpoint, or use device emulation) and in the landscape short-height phone layout.
4. Confirm the "Hold Space to reveal" and "Hidden" map-mode settings still correctly gate
   visibility of the new encoding along with the existing color overlay.
5. Update the "Control-map colors" legend card to reflect the new encoding.
6. Re-run the existing manual regression checklist from `CLAUDE.md` (new game / take-back / all
   three control-map modes / checkmate and stalemate / castling and en passant).

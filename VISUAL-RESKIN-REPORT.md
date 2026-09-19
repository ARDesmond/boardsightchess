# Boardsight visual reskin — Parchment & Walnut

Implemented the supplied approved mockup as a shared visual system across
Play Computer, Opening Practice, Sandbox, FEN, settings, inspector, training
feedback, promotion controls and responsive layouts.

## Visual changes
- Central CSS tokens for parchment/ivory page surfaces, cream panels, espresso
  text, walnut frame, antique brass controls, shadows, borders and typography.
- Serif brand/headings with legible system sans-serif interface controls.
- The approved brand mark is displayed from the user's supplied image using
  an SVG viewport crop; it is not regenerated or redesigned. favicon.svg embeds
  the source pixels so header/favicon/app branding has no external dependency.
  The blue Board / red sight wordmark is styled text beside the supplied mark.
- Local classic Cburnett SVG pieces replace the visual Unicode glyph surface,
  retaining the same piece elements, accessibility, pointer targets and move
  presentation state. SVG white/black fills are ivory/charcoal. Artwork source,
  attribution and GPLv2-or-later license are in assets/pieces/.
- Subtle outline control icons, restrained paper/wood styling, consistent
  native form controls, accessible focus rings, and cream promotion surfaces.
- The actual control overlays and intensity formula remain unchanged. Neutral
  square surfaces and the frame integrate their blue/red/purple colors.
- The frame is CSS only; inspector SVG insets align to its inner board.
- Desktop board remains dominant, tablet panels keep the existing two-column
  stack, phone panels stack below the board. A 320px scrollbar overflow was fixed.

## Behavior preservation
chess.js, engine.js and openings.js are byte-identical to the pre-reskin backup.
The control-color calculation, bot timing and coordinate conversion functions
are unchanged. Pointer handlers are unchanged except for adding a data attribute
that selects visual piece artwork. Animations receive the same artwork metadata.
No chess rules, Stockfish settings, Elo presets, opening data, training behavior,
Sandbox rules, FEN logic, controls, cancellation logic or move timing changed.
Touch-action and pointer capture remain as implemented before this visual task.

The one explicit exception requested by the user is advertisements: the inspected
local source still contained the legacy ad flow. Its configuration, markup,
listeners and functions were removed. Play New Game now calls the existing
startNewGame directly, with no interstitial or timed advertising.

## Files
Modified: styles.css, app.js (header/artwork metadata and ad removal only),
favicon.svg, index.html (theme-color), site.webmanifest (theme colors),
README-DEPLOY.txt, HANDOFF-REPORT.md.
Added: assets/pieces/ SVGs + attribution/license; this report.
The supplied original reference image is retained in the working assets folder
for reference, but is not required by the runtime or included separately in the
clean handoff. Its brand pixels are embedded in favicon.svg.
No framework, engine or package-manager changes. No new code dependency.

## Verification
- node tests.cjs: passed all existing chess, repertoire, control-map and
  weakening regression checks.
- node engine-tests.cjs: actual bundled Stockfish, all eleven Elo presets,
  legal moves, cancellation and following request passed.
- node --check app.js passed.
- Byte comparisons confirm the three core files are unchanged; source comparisons
  confirm bot timing, control colors, square mapping and pointer logic preservation.
- Browser checked Play Computer at 600 and 2200+, White and Black setup,
  ad-free New Game, player move and bot reply, and Take Back.
- Checked Boardsight off/on, Clean/Detailed/Full, attacker-count visibility,
  e3 inspector explanation, Opening Practice Black-side Hint and flipped e5
  marker, Recall hiding markers, and mode switches.
- Checked Sandbox clear/start, White knight placement, FEN export, invalid FEN
  feedback and preserved position, and a-file pawn dragging with the new frame.
- Visual inspection: 1440x1080 desktop, 1280x960 desktop, 820x1180 tablet,
  390x844 phone, and 320x740 narrow phone. Corrected narrow overflow.
- No application console errors observed during these checks.

Physical iOS/Android finger gestures were not available to this browser tool.
The pointer/CSS touch contract is preserved, and mouse-style dragging was
verified at phone width; this is not a claim of physical touchscreen certification.
The approximate Elo presets retain their existing calibration limitations.

## Delivery
Run: node serve.cjs, then open http://127.0.0.1:8001.
Static-hosting requirements are unchanged; include assets/pieces and favicon.svg.
New clean folder and ZIP: handoff/Boardsight-Visual-Reskin/ and
handoff/Boardsight-Visual-Reskin.zip. Previous 2.0 ZIP remains a historical snapshot.
No remote repository or live deployment was modified.

Additional visual QA: a temporary promotion-position fixture exercised the
existing promotion chooser, knight underpromotion, resulting SVG piece and
"Draw by insufficient material" game-end status. All passed. The temporary
fixture was removed and is not included in the handoff.

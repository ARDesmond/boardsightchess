// Optional analytics hook. Cloudflare Web Analytics tracks visits and devices
// without any changes here. If a Google Analytics tag is added later, these
// events will automatically report basic product usage without sending moves
// or board positions.
function trackEvent(name, params = {}) {
  if (typeof window.gtag === 'function') {
    window.gtag('event', name, params);
  }
}


const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'];
const PIECES = {
  wp: '♙', wn: '♘', wb: '♗', wr: '♖', wq: '♕', wk: '♔',
  bp: '♟', bn: '♞', bb: '♝', br: '♜', bq: '♛', bk: '♚',
};
const PIECE_NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

const opponent = new StockfishOpponent();
const analysis = new StockfishAnalysis();
const sandboxEngine=new StockfishCandidates();
let sandboxAnalysisVersion=0,sandboxSuggestion=null;
let evalEnabled=false,evalFen=null,evalTimer=null,evalVersion=0,guideEnabled=false,guideKey='';
let mode = 'game', orientation = 'w', generation = 0, botTimer = null;
let animationBusy = false, drag = null, suppressClick = false, inspected = null, releaseVisual = null;
let hintVisible = false, trainingMessage = '', promotionPending = null;
let game = new Chess();
let gameStartTurn='w',customPosition=false;
let gameRootFen=Chess.DEFAULT_POSITION,reviewSession=null,reviewArchive=null,reviewSerial=0;
const reviewEngine=new StockfishReview();
let checkmateTimer=null,checkmatePendingFen=null,checkmateShownFen=null;
let selectedSquare = null;
let legalTargets = [];
let lastMove = null;
let playerColor = 'w';
let computerColor = 'b';
let isComputerThinking = false;

let holdRevealActive = false;
let hoveredSquare = null;

const app = document.querySelector('#app');
app.innerHTML = `
  <main class="app-shell">
    <header class="topbar">
      <div class="brand">
        <div class="brand-heading"><img class="brand-mark" src="favicon.svg" alt="" width="82" height="80"><h1><span class="brand-board">Board</span><span class="brand-sight">sight</span> Chess</h1></div>
        <p>See every square you control, every square your opponent controls, and where the board is contested.</p>
      </div>
      <div class="privacy-badge">No login • No saved games • Free</div>
    </header>

    <nav class="mode-tabs" aria-label="Training mode">
  <button data-mode="game" aria-pressed="true">Play computer</button><button data-mode="opening" aria-pressed="false">Opening practice</button><button data-mode="sandbox" aria-pressed="false">Sandbox</button>
  </nav><section class="main-grid">
      <div class="board-column">
        <div class="status-row">
          <div id="status" class="status" aria-live="polite"></div>
          <div id="thinking" class="thinking hidden">Computer thinking…</div>
        </div>
        <div class="board-toolbar"><button id="sight-toggle" aria-pressed="true">Boardsight ON</button><button id="flip">Flip board</button><button id="inspect-toggle" aria-pressed="false">Inspect squares</button></div>
        <div id="captures-top" class="capture-row"></div>
        <div class="board-stage">
          <div id="eval-panel" class="eval-rail hidden" aria-label="Position evaluation"><span id="eval-top-side">B</span><div class="eval-track" aria-hidden="true"><div id="eval-fill"></div></div><span id="eval-bottom-side">W</span></div>
        <div class="board-wrap">
          <div id="board" class="board" role="grid" aria-label="Chess board"></div>
          <section id="checkmate-result" class="checkmate-result hidden" aria-label="Checkmate result" aria-live="polite">
            <div class="checkmate-card">
              <p class="checkmate-eyebrow">Checkmate</p>
              <div class="checkmate-pieces" aria-hidden="true"><img id="checkmate-winner-piece" class="checkmate-winner-piece" alt=""><img id="checkmate-loser-piece" class="checkmate-loser-piece" alt=""></div>
              <h2 id="checkmate-winner"></h2><p id="checkmate-loser"></p><p id="checkmate-player"></p>
              <button id="checkmate-review" class="primary-button">Walk through game</button><div class="button-pair"><button id="checkmate-close">View final position</button><button id="checkmate-new" class="primary-button">New game</button></div>
            </div>
          </section>
        </div>
        </div>
        <div id="captures-bottom" class="capture-row"></div>
        <section class="board-assistance" aria-label="Playing assistance">
          <div class="assistance-toggles"><button id="eval-toggle" aria-pressed="false">Evaluation OFF</button><button id="guide-toggle" aria-pressed="false">Opening guidance OFF</button></div>
          <div id="eval-details" class="hidden"><output id="eval-score" aria-live="polite">Not evaluated</output><p class="tip">Positive scores favor White; negative scores favor Black. Short Stockfish analysis.</p></div>
          <div id="guide-panel" class="hidden"><p id="opening-name" aria-live="polite"></p><label for="guide-line">Line to pursue</label><select id="guide-line"></select><p id="guide-next" aria-live="polite"></p><p class="tip">Suggestions follow the selected repertoire line and depend on your opponent’s replies. Recognition uses known move orders.</p></div>
        </section>
      </div>

      <aside class="side-panel">
        <section class="card hidden" id="review-panel" aria-label="Game walkthrough">
          <h2>BoardSight walkthrough</h2>
          <div class="coach-layout"><svg class="coach-mascot" viewBox="0 0 212 226" role="img" aria-label="BoardSight, a smiling chessboard coach"><g fill="none" stroke="#674525" stroke-width="9" stroke-linecap="round"><path d="M37 103 Q15 111 10 89"/><path class="coach-wave" d="M176 93 Q203 87 201 58"/><path d="M77 179 L70 208"/><path d="M136 179 L144 208"/></g><g fill="#a77a2a" stroke="#674525" stroke-width="3"><ellipse cx="10" cy="85" rx="9" ry="11"/><ellipse cx="200" cy="53" rx="9" ry="11"/><ellipse cx="66" cy="214" rx="18" ry="8"/><ellipse cx="149" cy="214" rx="18" ry="8"/><rect x="32" y="20" width="148" height="166" rx="13"/></g><rect x="42" y="30" width="16" height="16" fill="#fff4db"/><rect x="58" y="30" width="16" height="16" fill="#aa8057"/><rect x="74" y="30" width="16" height="16" fill="#fff4db"/><rect x="90" y="30" width="16" height="16" fill="#aa8057"/><rect x="106" y="30" width="16" height="16" fill="#fff4db"/><rect x="122" y="30" width="16" height="16" fill="#aa8057"/><rect x="138" y="30" width="16" height="16" fill="#fff4db"/><rect x="154" y="30" width="16" height="16" fill="#aa8057"/><rect x="42" y="46" width="16" height="16" fill="#aa8057"/><rect x="58" y="46" width="16" height="16" fill="#fff4db"/><rect x="74" y="46" width="16" height="16" fill="#aa8057"/><rect x="90" y="46" width="16" height="16" fill="#fff4db"/><rect x="106" y="46" width="16" height="16" fill="#aa8057"/><rect x="122" y="46" width="16" height="16" fill="#fff4db"/><rect x="138" y="46" width="16" height="16" fill="#aa8057"/><rect x="154" y="46" width="16" height="16" fill="#fff4db"/><rect x="42" y="62" width="16" height="16" fill="#8db6d8"/><rect x="58" y="62" width="16" height="16" fill="#8db6d8"/><rect x="74" y="62" width="16" height="16" fill="#8db6d8"/><rect x="90" y="62" width="16" height="16" fill="#8db6d8"/><rect x="106" y="62" width="16" height="16" fill="#fff4db"/><rect x="122" y="62" width="16" height="16" fill="#aa8057"/><rect x="138" y="62" width="16" height="16" fill="#fff4db"/><rect x="154" y="62" width="16" height="16" fill="#aa8057"/><rect x="42" y="78" width="16" height="16" fill="#aa8057"/><rect x="58" y="78" width="16" height="16" fill="#fff4db"/><rect x="74" y="78" width="16" height="16" fill="#aa8057"/><rect x="90" y="78" width="16" height="16" fill="#fff4db"/><rect x="106" y="78" width="16" height="16" fill="#bc8991"/><rect x="122" y="78" width="16" height="16" fill="#bc8991"/><rect x="138" y="78" width="16" height="16" fill="#bc8991"/><rect x="154" y="78" width="16" height="16" fill="#bc8991"/><rect x="42" y="94" width="16" height="16" fill="#fff4db"/><rect x="58" y="94" width="16" height="16" fill="#aa8057"/><rect x="74" y="94" width="16" height="16" fill="#fff4db"/><rect x="90" y="94" width="16" height="16" fill="#b19ac6"/><rect x="106" y="94" width="16" height="16" fill="#b19ac6"/><rect x="122" y="94" width="16" height="16" fill="#aa8057"/><rect x="138" y="94" width="16" height="16" fill="#fff4db"/><rect x="154" y="94" width="16" height="16" fill="#aa8057"/><rect x="42" y="110" width="16" height="16" fill="#aa8057"/><rect x="58" y="110" width="16" height="16" fill="#fff4db"/><rect x="74" y="110" width="16" height="16" fill="#aa8057"/><rect x="90" y="110" width="16" height="16" fill="#fff4db"/><rect x="106" y="110" width="16" height="16" fill="#aa8057"/><rect x="122" y="110" width="16" height="16" fill="#fff4db"/><rect x="138" y="110" width="16" height="16" fill="#aa8057"/><rect x="154" y="110" width="16" height="16" fill="#fff4db"/><rect x="42" y="126" width="16" height="16" fill="#fff4db"/><rect x="58" y="126" width="16" height="16" fill="#aa8057"/><rect x="74" y="126" width="16" height="16" fill="#fff4db"/><rect x="90" y="126" width="16" height="16" fill="#aa8057"/><rect x="106" y="126" width="16" height="16" fill="#fff4db"/><rect x="122" y="126" width="16" height="16" fill="#aa8057"/><rect x="138" y="126" width="16" height="16" fill="#fff4db"/><rect x="154" y="126" width="16" height="16" fill="#aa8057"/><rect x="42" y="142" width="16" height="16" fill="#aa8057"/><rect x="58" y="142" width="16" height="16" fill="#fff4db"/><rect x="74" y="142" width="16" height="16" fill="#aa8057"/><rect x="90" y="142" width="16" height="16" fill="#fff4db"/><rect x="106" y="142" width="16" height="16" fill="#aa8057"/><rect x="122" y="142" width="16" height="16" fill="#fff4db"/><rect x="138" y="142" width="16" height="16" fill="#aa8057"/><rect x="154" y="142" width="16" height="16" fill="#fff4db"/><g stroke="#3c2c20" stroke-width="3"><ellipse cx="83" cy="91" rx="13" ry="17" fill="#fffaf0"/><ellipse cx="130" cy="91" rx="13" ry="17" fill="#fffaf0"/><circle cx="85" cy="94" r="6" fill="#3c2c20"/><circle cx="128" cy="94" r="6" fill="#3c2c20"/><path d="M72 67 Q83 60 94 66 M119 66 Q130 60 140 67" fill="none" stroke-linecap="round"/><path d="M83 118 Q106 137 130 118 Q106 155 83 118Z" fill="#fffaf0"/></g><rect x="38" y="161" width="136" height="20" rx="5" fill="#674525"/><text x="106" y="176" text-anchor="middle" font-family="Georgia,serif" font-weight="bold" font-size="16" fill="#fff4db">BoardSight</text></svg><div class="coach-bubble" role="status" aria-live="polite"><h3 id="coach-title">Let's learn from this game</h3><p id="coach-tip"></p><p id="coach-line"></p><p id="coach-score" class="tip"></p></div></div>
          <p id="review-progress" aria-live="polite"></p>
          <div class="button-pair"><button id="review-stop-prev">Previous tip</button><button id="review-stop-next">Next tip</button></div>
          <div class="button-pair"><button id="review-played">Show played move</button><button id="review-best">Show stronger move</button></div>
          <button id="review-before" class="secondary-button">Before this move</button>
          <p id="review-position" aria-live="polite"></p>
          <div class="review-navigation"><button id="review-first" aria-label="Starting position">|‹</button><button id="review-prev" aria-label="Previous move">‹</button><button id="review-next" aria-label="Next move">›</button><button id="review-last" aria-label="Final position">›|</button></div>
          <div id="review-moves" class="review-moves" aria-label="Game moves"></div>
          <div class="control-group"><label for="review-side">Retry as</label><select id="review-side"><option value="w">White</option><option value="b">Black</option></select></div>
          <div class="control-group"><label for="review-strength">Computer strength</label><select id="review-strength">${BOT_LEVELS.map(elo=>`<option value="${elo}" ${elo===1000?'selected':''}>${elo}${elo===2200?'+':''}</option>`).join('')}</select></div>
          <button id="review-retry-position" class="primary-button">Play from here</button>
          <div class="button-pair"><button id="review-analyze">Analyze game</button><button id="review-cancel" class="hidden">Stop analysis</button></div>
          <button id="review-exit" class="secondary-button">Return to game</button>
          <p class="tip">Short Stockfish analysis finds up to six learning stops. Scores are estimates, not a complete verdict. Your original game stays available in this tab.</p>
        </section>
        <section class="card hidden" id="opening-panel">
          <h2>Opening practice</h2>
          <div class="control-group"><label for="opening">Opening</label><select id="opening"></select></div>
          <div class="control-group"><label for="variation">Variation</label><select id="variation"></select></div>
          <div class="control-group"><label for="practice-side">Practice as</label><select id="practice-side"><option value="w">White</option><option value="b">Black</option></select></div>
          <div class="control-group"><label for="training">Training</label><select id="training"><option value="guided">Guided</option><option value="hint">Hint</option><option value="recall">Recall</option></select></div>
          <p id="progress" aria-live="polite"></p><button id="hint" class="secondary-button">Hint</button>
          <button id="restart-line" class="secondary-button">Restart line</button>
          <p class="tip">Outlined destinations belong to your repertoire. Other legal moves receive feedback and leave this practice position unchanged.</p>
        </section>
        <section class="card hidden" id="sandbox-panel">
          <h2>Position builder</h2><p class="tip">Choose a piece, then tap a square. Choose Move to drag or tap pieces freely.</p>
          <div id="piece-tray" class="piece-tray"></div>
          <div class="control-group"><label for="side-to-move">Side to move</label><select id="side-to-move"><option value="w">White</option><option value="b">Black</option></select></div>
          <div class="control-group"><label for="castling">Castling rights</label><input id="castling" value="KQkq" placeholder="KQkq or -"></div>
          <div class="control-group"><label for="en-passant">En passant target</label><input id="en-passant" value="-" placeholder="e3, e6 or -"></div>
          <button id="apply-rights" class="secondary-button">Apply position settings</button>
          <div class="button-pair"><button id="clear-board">Clear board</button><button id="start-position">Starting position</button></div>
          <label for="fen">FEN position</label><textarea id="fen" rows="3" spellcheck="false"></textarea>
          <div class="button-pair"><button id="import-fen">Import FEN</button><button id="export-fen">Export FEN</button></div>
          <p id="fen-message" aria-live="polite"></p>
          <div class="control-group"><label for="sandbox-play-as">Play position as</label><select id="sandbox-play-as"><option value="w">White</option><option value="b">Black</option></select></div>
          <div class="control-group"><label for="sandbox-difficulty">Computer strength</label><select id="sandbox-difficulty">
            ${BOT_LEVELS.map(elo=>`<option value="${elo}" ${elo===1000?'selected':''}>${elo}${elo===2200?'+':''}</option>`).join('')}
          </select></div>
          <button id="play-sandbox" class="primary-button">Play this position</button>
          <p id="sandbox-play-status" aria-live="polite"></p>
          <button id="analyze-sandbox" class="primary-button">Analyze position · top 3 moves</button>
          <button id="cancel-sandbox-analysis" class="secondary-button hidden">Cancel analysis</button>
          <p id="sandbox-analysis-status" aria-live="polite"></p><div id="sandbox-candidates" class="sandbox-candidates"></div>
          <p class="tip">Moves are ranked for the side to move. Scores favor White when positive, Black when negative. Select a suggestion to highlight it; the position stays unchanged. Apply position settings before analyzing.</p>
        </section>
        <section class="card">
          <h2>Game setup</h2><div id="game-setup">
          <div class="control-group">
            <label for="play-as">Play as</label>
            <select id="play-as">
              <option value="w">White</option>
              <option value="b">Black</option>
              <option value="random">Random</option>
            </select>
          </div>
          <div class="control-group">
            <label for="difficulty">Approx. Elo</label>
            <select id="difficulty">
              ${BOT_LEVELS.map(elo=>`<option value="${elo}" ${elo===1000?'selected':''}>${elo}${elo===2200?'+':''}</option>`).join('')}
            </select>
          </div>
          </div><div class="control-group"><label for="map-mode">Control map</label>
            <select id="map-mode">
              <option value="always">Always visible</option>
              <option value="hold">Hold Space to reveal</option>
              <option value="off">Hidden</option>
            </select>
          </div>
          <div class="control-group"><label for="detail">Visualization</label><select id="detail"><option value="clean">Clean</option><option value="detailed">Detailed</option><option value="full">Full</option></select></div>
          <div class="button-stack">
            <button id="new-game" class="primary-button">Play New Game</button><button id="review-open" class="secondary-button hidden">Walk through game</button>
            <button id="undo" class="secondary-button">Take Back Move</button><button id="retry-bot" class="secondary-button hidden">Retry computer move</button><p class="tip" id="game-info">Stockfish • Approximate ratings, not measured human Elo.</p>
          </div>
        </section>

        <section class="card">
          <h3>Control-map colors</h3>
          <div class="legend">
            <div class="legend-item"><span class="legend-swatch blue"></span>Your control</div>
            <div class="legend-item"><span class="legend-swatch red"></span>Opponent control</div>
            <div class="legend-item"><span class="legend-swatch purple"></span>Contested</div>
            <div class="legend-item"><span class="legend-swatch clear"></span>Uncontrolled</div>
          </div>
        </section>

        <section class="card">
          <h3>Square inspector</h3>
          <div id="square-details" class="square-details">Hover over or tap a square to see its attackers.</div>
          <p class="tip">The color becomes stronger as more pieces cover a square. Purple shifts toward whichever side has more coverage.</p>
        </section>
      </aside>
    </section>
    <p class="tip engine-credit">Computer play: <a href="vendor/stockfish/README.md">Stockfish 18 Lite</a> · <a href="vendor/stockfish/COPYING.txt">GPLv3</a> · <a href="vendor/stockfish/stockfish-18.0.8-source.zip">Engine source</a></p>
  </main>

`;

const boardEl = document.querySelector('#board');
const statusEl = document.querySelector('#status');
const thinkingEl = document.querySelector('#thinking');
const detailsEl = document.querySelector('#square-details');
const playAsEl = document.querySelector('#play-as');
const difficultyEl = document.querySelector('#difficulty');
const mapModeEl = document.querySelector('#map-mode');

function colorName(color) {
  return color === 'w' ? 'White' : 'Black';
}

function opposite(color) {
  return color === 'w' ? 'b' : 'w';
}

function squareToCoords(square) {
  return { x: FILES.indexOf(square[0]), y: Number(square[1]) - 1 };
}

function coordsToSquare(x, y) {
  if (x < 0 || x > 7 || y < 0 || y > 7) return null;
  return `${FILES[x]}${RANKS[y]}`;
}

function boardPieceAt(x, y) {
  const square = coordsToSquare(x, y);
  return square ? game.get(square) : null;
}

function pushAttack(map, square, attacker) {
  if (!square) return;
  map[square].push(attacker);
}

function generateAttackMap() {
  const map = {};
  for (const file of FILES) {
    for (const rank of RANKS) map[`${file}${rank}`] = [];
  }

  for (const file of FILES) {
    for (const rank of RANKS) {
      const from = `${file}${rank}`;
      const piece = game.get(from);
      if (!piece) continue;
      const { x, y } = squareToCoords(from);
      const attacker = { from, color: piece.color, type: piece.type };

      if (piece.type === 'p') {
        const direction = piece.color === 'w' ? 1 : -1;
        pushAttack(map, coordsToSquare(x - 1, y + direction), attacker);
        pushAttack(map, coordsToSquare(x + 1, y + direction), attacker);
      }

      if (piece.type === 'n') {
        const jumps = [[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]];
        for (const [dx, dy] of jumps) pushAttack(map, coordsToSquare(x + dx, y + dy), attacker);
      }

      if (piece.type === 'k') {
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            if (dx || dy) pushAttack(map, coordsToSquare(x + dx, y + dy), attacker);
          }
        }
      }

      if (['b', 'r', 'q'].includes(piece.type)) {
        const directions = [];
        if (['b', 'q'].includes(piece.type)) directions.push([1,1],[1,-1],[-1,1],[-1,-1]);
        if (['r', 'q'].includes(piece.type)) directions.push([1,0],[-1,0],[0,1],[0,-1]);

        for (const [dx, dy] of directions) {
          let nx = x + dx;
          let ny = y + dy;
          while (nx >= 0 && nx < 8 && ny >= 0 && ny < 8) {
            const target = coordsToSquare(nx, ny);
            pushAttack(map, target, attacker);
            if (boardPieceAt(nx, ny)) break;
            nx += dx;
            ny += dy;
          }
        }
      }
    }
  }
  return map;
}

function overlayColor(square, attackMap) {
  const mapMode = mapModeEl.value;
  const visible = mapMode === 'always' || (mapMode === 'hold' && holdRevealActive);
  if (!visible) return 'transparent';

  const attackers = attackMap[square];
  const mine = attackers.filter(a => a.color === playerColor).length;
  const theirs = attackers.filter(a => a.color === computerColor).length;
  if (!mine && !theirs) return 'transparent';

  // Translucent influence preserves the light/dark board geometry. Extra
  // attackers deepen the hue without covering up pieces or coordinates.
  if (mine && !theirs) {
    const lightness = Math.max(48, 72 - (Math.min(mine, 4) - 1) * 8);
    return `hsl(215 66% ${lightness}% / .43)`;
  }

  if (theirs && !mine) {
    const lightness = Math.max(48, 72 - (Math.min(theirs, 4) - 1) * 8);
    return `hsl(347 62% ${lightness}% / .43)`;
  }

  const total = mine + theirs;
  const balance = (mine - theirs) / total; // +1 = blue, -1 = red
  const hue = balance >= 0
    ? 278 - balance * 58
    : 278 + (-balance) * 62;
  const lightness = Math.max(46, 68 - (Math.min(total, 6) - 2) * 5);
  return `hsl(${Math.round(hue)} 52% ${lightness}% / .48)`;
}

function orientationSquares() {
  const ranks = orientation === 'w' ? [...RANKS].reverse() : [...RANKS];
  const files = orientation === 'w' ? [...FILES] : [...FILES].reverse();
  const squares = [];
  for (const rank of ranks) {
    for (const file of files) squares.push(`${file}${rank}`);
  }
  return { squares, files, ranks };
}

function renderBoard() {
  if(animationBusy)return;
  const attackMap = generateAttackMap();
  const { squares } = orientationSquares();

  if (drag) return;
  const focused = document.activeElement?.dataset.square;
  boardEl.innerHTML = '';
  const destinations = mode==='opening' && game.turn()===playerColor && (document.querySelector('#training').value==='guided'||hintVisible) ? acceptedMoves().map(m=>m.slice(2,4)) : [];
  for (const square of squares) {
    const { x, y } = squareToCoords(square);
    const piece = game.get(square);
    const isLight = (x + y) % 2 === 1;
    const squareEl = document.createElement('button');
    squareEl.type = 'button';
    squareEl.className = `square ${isLight ? 'light' : 'dark'}`;
    squareEl.dataset.square = square;
    squareEl.setAttribute('role', 'gridcell');
    squareEl.setAttribute('aria-label', describeSquare(square, attackMap));

    if (destinations.includes(square)) squareEl.classList.add('opening-target');
    if (selectedSquare === square) squareEl.classList.add('selected');
    if(mode==='sandbox'&&sandboxSuggestion&&(square===sandboxSuggestion.slice(0,2)||square===sandboxSuggestion.slice(2,4)))squareEl.classList.add('opening-target');
    const legalTarget=mode!=='sandbox'&&legalTargets.find(move=>move.to===square);
    if(legalTarget){
      const marker=document.createElement('span');marker.className='legal-marker'+(legalTarget.captured?' capture-marker':'');marker.setAttribute('aria-hidden','true');squareEl.appendChild(marker);
      squareEl.setAttribute('aria-label',squareEl.getAttribute('aria-label')+(legalTarget.captured?', legal capture':', legal move'));
    }
    if (lastMove && (lastMove.from === square || lastMove.to === square)) squareEl.classList.add('last-move');

    const overlay = document.createElement('span');
    overlay.className = 'control-overlay';
    overlay.style.backgroundColor = overlayColor(square, attackMap);
    squareEl.appendChild(overlay);

    if (piece) {
      const pieceEl = document.createElement('span');
      pieceEl.className = `piece ${piece.color === 'w' ? 'white' : 'black'}`;
      pieceEl.dataset.art = piece.color + piece.type;
      pieceEl.draggable = false;
      if (mode==='sandbox' || (piece.color===playerColor && game.turn()===playerColor)) pieceEl.classList.add('draggable-piece');
      pieceEl.textContent = PIECES[`${piece.color}${piece.type}`];
      pieceEl.setAttribute('aria-hidden', 'true');
      squareEl.appendChild(pieceEl);
    }


    const rankVisible = orientation === 'w' ? square[0] === 'a' : square[0] === 'h';
    const fileVisible = orientation === 'w' ? square[1] === '1' : square[1] === '8';
    if (rankVisible) {
      const rank = document.createElement('span');
      rank.className = 'coordinate rank';
      rank.textContent = square[1];
      squareEl.appendChild(rank);
    }
    if (fileVisible) {
      const file = document.createElement('span');
      file.className = 'coordinate file';
      file.textContent = square[0];
      squareEl.appendChild(file);
    }

    const attackers=attackMap[square], white=attackers.filter(a=>a.color==='w').length, black=attackers.length-white;
    const detail=document.querySelector('#detail').value;
    if (mapVisible() && (detail==='full' || (detail==='detailed' && white && black))) {
      const count=document.createElement('span');count.className='control-count';count.textContent=white+' : '+black;squareEl.appendChild(count);
    }
    squareEl.addEventListener('click', () => {if(!suppressClick)onSquareClick(square);});
    squareEl.addEventListener('mouseenter', () => {
      hoveredSquare = square;
      renderSquareDetails(square, attackMap);
    });
    squareEl.addEventListener('focus', () => renderSquareDetails(square, attackMap));
    boardEl.appendChild(squareEl);
  }

  const detailSquare=$('#inspect-toggle').getAttribute('aria-pressed')==='true'?inspected:hoveredSquare;
  if (detailSquare) renderSquareDetails(detailSquare, attackMap);
  if(focused) boardEl.querySelector('[data-square="'+focused+'"]').focus({preventScroll:true});
  renderStatus(); renderExtras(); syncCheckmateResult();
}

function describeSquare(square, attackMap) {
  const piece = game.get(square);
  const attackers = attackMap[square];
  const mine = attackers.filter(a => a.color === playerColor).length;
  const theirs = attackers.filter(a => a.color === computerColor).length;
  const occupant = piece ? `${colorName(piece.color)} ${PIECE_NAMES[piece.type]}` : 'empty';
  return `${square}, ${occupant}, your coverage ${mine}, opponent coverage ${theirs}`;
}

function renderSquareDetails(square, attackMap) {
  const attackers = attackMap[square];
  const mine = attackers.filter(a => a.color === 'w');
  const theirs = attackers.filter(a => a.color === 'b');
  const format = list => list.length
    ? list.map(a => `${PIECE_NAMES[a.type]} on ${a.from}`).join(', ')
    : 'none';
  detailsEl.innerHTML = `
    <strong>${square.toUpperCase()}</strong><br>
    White attackers (${mine.length}): ${format(mine)}<br>
    Black attackers (${theirs.length}): ${format(theirs)}
  `;
}

function clearSelection() {
  selectedSquare = null;
  legalTargets = [];
}

function onSquareClick(square) {
  if(reviewSession){inspected=square;renderBoard();return;}
  inspected=square; renderSquareDetails(square,generateAttackMap());
  if(document.querySelector('#inspect-toggle').getAttribute('aria-pressed')==='true'){drawInspector();return;}
  if(animationBusy || promotionPending)return;
  if(mode==='sandbox') {
    if(trayChoice!=='move'){invalidate(); if(trayChoice==='erase')game.remove(square);else game.put({color:trayChoice[0],type:trayChoice[1]},square);clearSelection();syncSandbox();renderBoard();return;}
    if(selectedSquare && selectedSquare!==square){executeMove(selectedSquare,square);return;}
    selectedSquare=game.get(square)?square:null;renderBoard();return;
  }
  if(isComputerThinking || game.isGameOver() || game.turn()!==playerColor)return;
  if(selectedSquare && selectedSquare!==square && legalTargets.some(m=>m.to===square)){attemptMove(selectedSquare,square);return;}
  if(game.get(square)?.color===playerColor){selectedSquare=square;legalTargets=game.moves({square,verbose:true});}else clearSelection();
  renderBoard();
}
function makePlayerMove(from,to){attemptMove(from,to);}

function hideCheckmateResult(){
  clearTimeout(checkmateTimer);checkmateTimer=null;checkmatePendingFen=null;
  $('#checkmate-result').classList.add('hidden');
  boardEl.querySelectorAll('.checkmate-king').forEach(piece=>piece.classList.remove('checkmate-king'));
}
function syncCheckmateResult(){
  if(reviewSession){hideCheckmateResult();return;}
  if(mode==='sandbox'||!game.isCheckmate()){
    hideCheckmateResult();checkmateShownFen=null;return;
  }
  const fen=game.fen();
  if(checkmateShownFen===fen||checkmatePendingFen===fen)return;
  hideCheckmateResult();checkmatePendingFen=fen;
  checkmateTimer=setTimeout(()=>{
    checkmateTimer=null;checkmatePendingFen=null;
    if(mode==='sandbox'||game.fen()!==fen||!game.isCheckmate())return;
    checkmateShownFen=fen;
    const loser=game.turn(),winner=opposite(loser);
    $('#checkmate-winner').textContent=colorName(winner)+' wins';
    $('#checkmate-loser').textContent=colorName(loser)+' loses by checkmate.';
    $('#checkmate-player').textContent=winner===playerColor?'You won. Well played!':'Computer won. Try another game.';
    $('#checkmate-winner-piece').src='assets/pieces/'+winner+'K.svg';
    $('#checkmate-loser-piece').src='assets/pieces/'+loser+'K.svg';
    for(const square of boardEl.querySelectorAll('[data-square]')){
      const piece=game.get(square.dataset.square);
      if(piece?.type==='k'&&piece.color===loser)square.querySelector('.piece')?.classList.add('checkmate-king');
    }
    $('#checkmate-result').classList.remove('hidden');
  },1000);
}
function renderStatus() {
  if(reviewSession){statusEl.textContent='Review · '+(reviewSession.preview==='stronger'?'suggested alternative':reviewSession.cursor?'after '+reviewMoveName(reviewSession.data,reviewSession.cursor-1):'starting position');return;}
  if (game.isCheckmate()) {
    statusEl.textContent = `${colorName(opposite(game.turn()))} wins by checkmate.`;
    return;
  }
  if (game.isStalemate()) {
    statusEl.textContent = 'Draw by stalemate.';
    return;
  }
  if (game.isThreefoldRepetition()) {
    statusEl.textContent = 'Draw by threefold repetition.';
    return;
  }
  if (game.isInsufficientMaterial()) {
    statusEl.textContent = 'Draw by insufficient material.';
    return;
  }
  if (game.isDraw()) {
    statusEl.textContent = 'The game is a draw.';
    return;
  }

  const turn = colorName(game.turn());
  const check = game.inCheck() ? ' — check!' : '';
  statusEl.textContent = `${turn} to move${check}`;
}

function scheduleComputerMove() {
  if(reviewSession||mode==='sandbox'||game.turn()!==computerColor||game.isGameOver()||isComputerThinking)return;
  const accepted=mode==='opening'?acceptedMoves():[];
  if(mode==='opening'&&!accepted.length){renderExtras();return;}
  stopEvaluation();
  const token=generation, fen=game.fen(), started=performance.now(), delay=900+Math.random()*900;
  isComputerThinking=true;thinkingEl.classList.remove('hidden');document.querySelector('#retry-bot').classList.add('hidden');
  if(evalEnabled){$('#eval-score').textContent='Waiting for computer move…';$('#eval-fill').style.height='50%';}
  const result=mode==='opening'?Promise.resolve(accepted[Math.floor(Math.random()*accepted.length)]):opponent.choose(fen,Number(difficultyEl.value),game.moves({verbose:true}).map(uci));
  result.then(move=>{
    if(token!==generation||fen!==game.fen())return;
    botTimer=setTimeout(()=>{if(token!==generation||fen!==game.fen())return;isComputerThinking=false;thinkingEl.classList.add('hidden');executeMove(move.slice(0,2),move.slice(2,4),move[4]||'q');},Math.max(0,delay-(performance.now()-started)));
  }).catch(error=>{if(token!==generation||error.message==='cancelled')return;isComputerThinking=false;thinkingEl.classList.add('hidden');statusEl.textContent=error.message;document.querySelector('#retry-bot').classList.remove('hidden');});
}

function resolvePlayerColor() {
  const choice = playAsEl.value;
  if (choice === 'random') return Math.random() < 0.5 ? 'w' : 'b';
  return choice;
}

function startNewGame(fen) {
  if(reviewSession)closeReview(false);stopReviewSearch();
  invalidate();checkmateShownFen=null;
  customPosition=typeof fen==='string';
  game = customPosition?new Chess(fen):new Chess();
  gameStartTurn=game.turn();gameRootFen=game.fen();
  playerColor = mode==='opening'?document.querySelector('#practice-side').value:resolvePlayerColor();
  orientation=playerColor;hintVisible=false;trainingMessage='';inspected=null;
  computerColor = opposite(playerColor);
  selectedSquare = null;
  legalTargets = [];
  lastMove = null;
  hoveredSquare = null;

  isComputerThinking = false;
  thinkingEl.classList.add('hidden');
  renderBoard();
  trackEvent('game_start', {
    player_color: playerColor === 'w' ? 'white' : 'black',
    computer_strength: difficultyEl.value,
    control_map: mapModeEl.value,
  });
  if (game.turn() === computerColor) scheduleComputerMove();
}

function takeBack() {
  if(reviewSession)return;
  invalidate();
  if (!game.history().length) return;
  if (playerColor !== gameStartTurn && game.history().length === 1) return;

  game.undo();
  if (game.turn() !== playerColor && game.history().length) game.undo();
  lastMove = null;
  clearSelection();
  trackEvent('take_back');
  hintVisible=false;trainingMessage='';
  renderBoard();
  scheduleComputerMove();
}

document.querySelector('#new-game').addEventListener('click', startNewGame);
document.querySelector('#checkmate-close').addEventListener('click',hideCheckmateResult);
document.querySelector('#checkmate-new').addEventListener('click',()=>{mode='game';for(const button of document.querySelectorAll('[data-mode]'))button.setAttribute('aria-pressed',String(button.dataset.mode===mode));$('#opening-panel').classList.add('hidden');startNewGame();});
document.querySelector('#undo').addEventListener('click', takeBack);
mapModeEl.addEventListener('change', renderBoard);

window.addEventListener('keydown', event => {
  if (!/INPUT|TEXTAREA|SELECT|BUTTON/.test(event.target.tagName) && event.code === 'Space' && mapModeEl.value === 'hold' && !event.repeat) {
    event.preventDefault();
    holdRevealActive = true;
    renderBoard();
  }
});
window.addEventListener('keyup', event => {
  if (event.code === 'Space' && mapModeEl.value === 'hold') {
    holdRevealActive = false;
    renderBoard();
  }
});
window.addEventListener('blur', () => {
  if (holdRevealActive) {
    holdRevealActive = false;
    renderBoard();
  }
});



  
// Mode, animation, and pointer state are deliberately independent of Chess.
let trayChoice='move';
const $=selector=>document.querySelector(selector);
const uci=move=>move.from+move.to+(move.promotion||'');
function mapVisible(){return mapModeEl.value==='always'||(mapModeEl.value==='hold'&&holdRevealActive);}
function acceptedMoves(){return repertoireMoves(OPENINGS.find(o=>o.id===$('#opening').value),$('#variation').value,game.history({verbose:true}).map(uci));}
function invalidate(){
  hideCheckmateResult();
  clearSandboxAnalysis();
  stopEvaluation();
  ++generation;clearTimeout(botTimer);opponent.cancel();isComputerThinking=false;animationBusy=false;
  thinkingEl.classList.add('hidden');$('#retry-bot').classList.add('hidden');
  cancelDrag();document.querySelectorAll('.motion-piece,.inspector-lines,.promotion-choice').forEach(el=>el.remove());
  promotionPending=null;releaseVisual=null;
}
function renderExtras(){
  renderAssistance();
  $('#sight-toggle').textContent=mapVisible()?'Boardsight ON':'Boardsight OFF';
  $('#sight-toggle').setAttribute('aria-pressed',String(mapVisible()));
  $('#game-setup').classList.toggle('hidden',!!reviewSession||mode!=='game'||game.history().length>0);
  $('#game-setup').previousElementSibling.textContent=mode==='game'&&!reviewSession?'Game & Boardsight':'Boardsight';
  $('#undo').classList.toggle('hidden',!!reviewSession||mode==='sandbox');
  $('#undo').disabled=!game.history().length||(playerColor!==gameStartTurn&&game.history().length===1);
  $('#new-game').classList.toggle('hidden',!!reviewSession||mode!=='game');
  const canReview=mode==='game'&&((game.isGameOver()&&game.history().length)||reviewArchive);
  $('#review-open').classList.toggle('hidden',!!reviewSession||!canReview);
  $('#review-open').textContent=game.isGameOver()&&game.history().length?'Walk through game':'Previous game walkthrough';
  $('.board-assistance').classList.toggle('hidden',!!reviewSession);
  $('.app-shell').classList.toggle('reviewing',!!reviewSession);
  if(reviewSession)renderReview();
  $('#game-info').textContent=reviewSession?'Reviewing '+colorName(reviewSession.data.player)+' moves':mode==='game'?`You: ${colorName(playerColor)} · Stockfish ≈ ${difficultyEl.value}${difficultyEl.value==='2200'?'+':''} Elo`:mode==='sandbox'?'Blue: White · Red: Black':'Practicing '+colorName(playerColor);
  if(mode==='sandbox')statusEl.textContent='Sandbox · '+colorName(game.turn())+' to move';
  if(mode==='opening'){
    const moves=acceptedMoves();
    $('#progress').textContent=(!moves.length?'Line complete. Restart to practice again.':trainingMessage||`${game.history().length} half-moves played · ${colorName(playerColor)} practice`)+' '+game.history().join(' ');
    $('#hint').classList.toggle('hidden',$('#training').value!=='hint'||!moves.length);
    if(!moves.length)statusEl.textContent='Opening complete';
  }
  drawInspector();
}
function drawInspector(){
  document.querySelector('.inspector-lines')?.remove();
  if(!inspected||!mapVisible()||$('#inspect-toggle').getAttribute('aria-pressed')!=='true')return;
  const squares=orientationSquares().squares;
  const center=s=>{const i=squares.indexOf(s);return [i%8*100+50,Math.floor(i/8)*100+50];};
  const [tx,ty]=center(inspected);
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 800 800');svg.classList.add('inspector-lines');svg.setAttribute('aria-hidden','true');
  for(const attacker of generateAttackMap()[inspected]){
    const [x,y]=center(attacker.from),line=document.createElementNS(svg.namespaceURI,'line');
    for(const [key,value] of Object.entries({x1:x,y1:y,x2:tx,y2:ty,stroke:attacker.color===playerColor?'#075985':'#9f1239','stroke-width':4,'stroke-dasharray':'8 6'}))line.setAttribute(key,value);
    svg.appendChild(line);
  }
  boardEl.parentElement.appendChild(svg);
}
function attemptMove(from,to){
  if(animationBusy||promotionPending||isComputerThinking)return;
  const legal=game.moves({square:from,verbose:true}).filter(m=>m.to===to);
  if(!legal.length)return;
  if(mode==='opening'&&!acceptedMoves().some(m=>m.startsWith(from+to))){releaseVisual=null;trainingMessage='That move is legal, but outside this repertoire. Try again.';renderExtras();return;}
  if(legal.some(m=>m.promotion)){
    promotionPending={from,to};const box=document.createElement('div');box.className='promotion-choice';box.setAttribute('role','group');box.setAttribute('aria-label','Choose promotion');
    for(const type of ['q','r','b','n']){const b=document.createElement('button');b.textContent=PIECE_NAMES[type];b.onclick=()=>{box.remove();promotionPending=null;executeMove(from,to,type);};box.appendChild(b);}
    const cancel=document.createElement('button');cancel.textContent='Cancel';cancel.onclick=()=>{box.remove();promotionPending=null;};box.appendChild(cancel);
    boardEl.parentElement.appendChild(box);box.firstChild.focus();return;
  }
  executeMove(from,to);
}
function animatePiece(piece,from,to){
  const source=boardEl.querySelector(`[data-square="${from}"]`),target=boardEl.querySelector(`[data-square="${to}"]`);
  if(!source||!target)return Promise.resolve();
  const a=releaseVisual?.from===from?releaseVisual.rect:source.getBoundingClientRect(),b=target.getBoundingClientRect();
  if(releaseVisual?.from===from)releaseVisual=null;
  source.querySelector('.piece')?.classList.add('moving-hidden');
  const ghost=document.createElement('span');ghost.className='piece motion-piece '+(piece.color==='w'?'white':'black');ghost.textContent=PIECES[piece.color+piece.type];ghost.dataset.art=piece.color+piece.type;
  Object.assign(ghost.style,{left:a.left+'px',top:a.top+'px',width:a.width+'px',height:a.height+'px',fontSize:a.width*.82+'px'});document.body.appendChild(ghost);
  const animation=ghost.animate([{transform:'translate(0,0)'},{transform:`translate(${b.left-a.left}px,${b.top-a.top}px)`}],{duration:matchMedia('(prefers-reduced-motion: reduce)').matches?0:230,easing:'cubic-bezier(.2,.7,.2,1)',fill:'forwards'});
  return animation.finished.catch(()=>{}).then(()=>ghost.remove());
}
async function executeMove(from,to,promotion='q'){
  if(reviewSession||animationBusy)return;
  const piece=game.get(from);if(!piece)return;
  const token=generation;let move;
  if(mode==='sandbox'){
    clearSandboxAnalysis();
    game.remove(from);game.put(piece,to);move={from,to};
  }else{
    try{move=game.move({from,to,promotion});}catch{return;}
  }
  // Rules commit first; old DOM remains solely to present the transition.
  lastMove=move;clearSelection();hintVisible=false;trainingMessage=mode==='opening'?'Correct — within the repertoire.':'';animationBusy=true;
  const animations=[animatePiece(piece,from,to)];
  if(move.castle)animations.push(animatePiece({color:piece.color,type:'r'},(move.castle==='king'?'h':'a')+from[1],(move.castle==='king'?'f':'d')+from[1]));
  await Promise.all(animations);if(token!==generation)return;
  animationBusy=false;if(mode==='sandbox')syncSandbox();renderBoard();scheduleComputerMove();
}
function squareAt(clientX,clientY){
  const rect=boardEl.getBoundingClientRect();let x=Math.floor((clientX-rect.left)/rect.width*8),y=Math.floor((clientY-rect.top)/rect.height*8);
  if(x<0||x>7||y<0||y>7)return null;return orientationSquares().squares[y*8+x];
}
function cancelDrag(){
  if(!drag)return;
  drag.ghost?.remove();drag.source?.classList.remove('moving-hidden');
  try{boardEl.releasePointerCapture(drag.id);}catch{}
  drag=null;boardEl.querySelectorAll('.drop-target,.drag-origin').forEach(el=>el.classList.remove('drop-target','drag-origin'));
}
boardEl.addEventListener('pointerdown',event=>{
  if(reviewSession)return;
  if(event.button!==0||drag||animationBusy||promotionPending||$('#inspect-toggle').getAttribute('aria-pressed')==='true')return;
  const source=event.target.closest('.piece'),square=source?.closest('[data-square]')?.dataset.square,piece=square&&game.get(square);
  if(!piece || (mode!=='sandbox'&&(isComputerThinking||piece.color!==playerColor||game.turn()!==playerColor||game.isGameOver())) || (mode==='sandbox'&&trayChoice!=='move'))return;
  drag={id:event.pointerId,from:square,piece,source,x:event.clientX,y:event.clientY,active:false,touch:event.pointerType==='touch'};
  boardEl.setPointerCapture(event.pointerId);
});
boardEl.addEventListener('pointermove',event=>{
  if(!drag||drag.id!==event.pointerId)return;
  if(!drag.active&&Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<7)return;
  event.preventDefault();
  if(!drag.active){
    drag.active=true;drag.source.classList.add('moving-hidden');drag.source.parentElement.classList.add('drag-origin');
    const size=boardEl.getBoundingClientRect().width/8;drag.size=size;
    drag.ghost=document.createElement('span');drag.ghost.className='piece motion-piece dragging '+(drag.piece.color==='w'?'white':'black');drag.ghost.textContent=PIECES[drag.piece.color+drag.piece.type];drag.ghost.dataset.art=drag.piece.color+drag.piece.type;
    Object.assign(drag.ghost.style,{width:size+'px',height:size+'px',fontSize:size*.88+'px'});document.body.appendChild(drag.ghost);
  }
  Object.assign(drag.ghost.style,{left:event.clientX-drag.size/2+'px',top:event.clientY-drag.size/2-(drag.touch?drag.size*.35:0)+'px'});
  boardEl.querySelector('.drop-target')?.classList.remove('drop-target');const target=squareAt(event.clientX,event.clientY);if(target)boardEl.querySelector(`[data-square="${target}"]`).classList.add('drop-target');
},{passive:false});
boardEl.addEventListener('pointerup',event=>{
  if(!drag||drag.id!==event.pointerId)return;
  const {from,active,ghost,source}=drag,to=squareAt(event.clientX,event.clientY);
  if(!active){cancelDrag();suppressClick=true;setTimeout(()=>suppressClick=false,0);onSquareClick(from);return;}
  suppressClick=true;setTimeout(()=>suppressClick=false,0);
  const valid=to&&to!==from&&(mode==='sandbox'||game.moves({square:from,verbose:true}).some(m=>m.to===to));
  if(!valid){
    const a=ghost.getBoundingClientRect(),b=source.getBoundingClientRect();
    ghost.animate([{transform:'translate(0,0)'},{transform:`translate(${b.left-a.left}px,${b.top-a.top}px)`}],{duration:matchMedia('(prefers-reduced-motion: reduce)').matches?0:180}).finished.catch(()=>{}).then(()=>{cancelDrag();renderBoard();});return;
  }
  releaseVisual={from,rect:ghost.getBoundingClientRect()};
  cancelDrag();if(mode==='sandbox')executeMove(from,to);else attemptMove(from,to);
});
boardEl.addEventListener('pointercancel',()=>{cancelDrag();renderBoard();});
boardEl.addEventListener('lostpointercapture',()=>{if(drag&&!drag.active)cancelDrag();});
boardEl.addEventListener('dragstart',event=>event.preventDefault());
boardEl.addEventListener('contextmenu',event=>{if(event.target.closest('.piece'))event.preventDefault();});
window.addEventListener('blur',()=>{cancelDrag();if(!animationBusy)renderBoard();});
window.addEventListener('resize',()=>{cancelDrag();if(animationBusy){invalidate();renderBoard();scheduleComputerMove();}});
function syncSandbox(){
  clearSandboxAnalysis();
  $('#side-to-move').value=game.turn();$('#castling').value=game.fen().split(' ')[2];$('#en-passant').value=game.epSquare||'-';$('#fen').value=game.fen();
}
function loadSandbox(fen){
  try{const next=new Chess(fen);invalidate();game=next;lastMove=null;clearSelection();syncSandbox();renderBoard();$('#fen-message').textContent='Position loaded. Geometric control includes pinned pieces; incomplete positions are allowed for study.';}
  catch(error){$('#fen-message').textContent=error.message+' — position unchanged.';}
}
function updateVariations(){
  const opening=OPENINGS.find(o=>o.id===$('#opening').value);
  $('#variation').innerHTML='<option value="family">Opening family · varied replies</option>'+opening.lines.map((line,i)=>`<option value="${i}">${line.name}</option>`).join('');
}
$('#opening').innerHTML=OPENINGS.map(o=>`<option value="${o.id}">${o.name}</option>`).join('');updateVariations();
$('#opening').onchange=()=>{updateVariations();startNewGame();};
for(const id of ['variation','practice-side'])$('#'+id).onchange=startNewGame;
$('#training').onchange=()=>{hintVisible=false;renderBoard();};
$('#hint').onclick=()=>{hintVisible=true;trainingMessage='Look for the outlined destination.';renderBoard();};
$('#restart-line').onclick=startNewGame;
$('#retry-bot').onclick=scheduleComputerMove;
$('#detail').onchange=renderBoard;
$('#sight-toggle').onclick=()=>{mapModeEl.value=mapVisible()?'off':'always';holdRevealActive=false;renderBoard();};
$('#flip').onclick=()=>{invalidate();orientation=opposite(orientation);renderBoard();scheduleComputerMove();};
$('#inspect-toggle').onclick=()=>{cancelDrag();const button=$('#inspect-toggle');button.setAttribute('aria-pressed',String(button.getAttribute('aria-pressed')!=='true'));clearSelection();renderBoard();};
for(const button of document.querySelectorAll('[data-mode]'))button.onclick=()=>{
  if(reviewSession)closeReview(false);
  invalidate();mode=button.dataset.mode;for(const b of document.querySelectorAll('[data-mode]'))b.setAttribute('aria-pressed',String(b===button));
  $('#opening-panel').classList.toggle('hidden',mode!=='opening');$('#sandbox-panel').classList.toggle('hidden',mode!=='sandbox');
  $('#inspect-toggle').setAttribute('aria-pressed','false');
  if(mode==='sandbox'){$('#sandbox-play-as').value=playAsEl.value==='b'?'b':'w';$('#sandbox-difficulty').value=difficultyEl.value;playerColor='w';computerColor='b';clearSelection();syncSandbox();renderBoard();}else startNewGame();
};
for(const choice of ['move','erase',...Object.keys(PIECES)]){
  const b=document.createElement('button');b.type='button';b.textContent=PIECES[choice]||choice;if(PIECES[choice])b.dataset.art=choice;b.setAttribute('aria-label',PIECES[choice]?colorName(choice[0])+' '+PIECE_NAMES[choice[1]]:choice);b.setAttribute('aria-pressed',String(choice==='move'));
  b.onclick=()=>{trayChoice=choice;clearSelection();for(const el of b.parentElement.children)el.setAttribute('aria-pressed',String(el===b));renderBoard();};$('#piece-tray').appendChild(b);
}
$('#play-sandbox').onclick=()=>{
  if(mode!=='sandbox'||animationBusy)return;
  const status=$('#sandbox-play-status');
  try{
    const fields=game.fen().split(' ');
    fields[1]=$('#side-to-move').value;
    fields[2]=$('#castling').value.trim();
    fields[3]=$('#en-passant').value.trim();
    const position=new Chess(fields.join(' '));
    const error=sandboxAnalysisError(position);
    if(error){status.textContent=error;return;}
    if(position.isGameOver()){status.textContent='This position is already game over. Edit it before playing.';return;}
    playAsEl.value=$('#sandbox-play-as').value;
    difficultyEl.value=$('#sandbox-difficulty').value;
    mode='game';
    for(const button of document.querySelectorAll('[data-mode]'))button.setAttribute('aria-pressed',String(button.dataset.mode===mode));
    $('#opening-panel').classList.add('hidden');$('#sandbox-panel').classList.add('hidden');
    $('#inspect-toggle').setAttribute('aria-pressed','false');
    status.textContent='';
    startNewGame(position.fen());
  }catch(error){status.textContent=error.message+' — position unchanged.';}
};
$('#clear-board').onclick=()=>loadSandbox('8/8/8/8/8/8/8/8 w - - 0 1');
$('#start-position').onclick=()=>loadSandbox(Chess.DEFAULT_POSITION);
$('#import-fen').onclick=()=>loadSandbox($('#fen').value);
$('#export-fen').onclick=()=>{$('#fen').value=game.fen();$('#fen').focus();$('#fen').select();$('#fen-message').textContent='FEN selected. Copy to save or share.';};
$('#apply-rights').onclick=()=>{const f=game.fen().split(' ');f[1]=$('#side-to-move').value;f[2]=$('#castling').value.trim();f[3]=$('#en-passant').value.trim();loadSandbox(f.join(' '));};
$('#side-to-move').onchange=()=>$('#apply-rights').click();
window.addEventListener('keydown',event=>{
  if(event.key.toLowerCase()==='b'&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!event.repeat&&!/INPUT|SELECT|TEXTAREA|BUTTON/.test(event.target.tagName))$('#sight-toggle').click();
  if(event.key==='Escape'){cancelDrag();document.querySelector('.promotion-choice')?.remove();promotionPending=null;clearSelection();renderBoard();}
});
function stopEvaluation(){clearTimeout(evalTimer);analysis.cancel();evalFen=null;++evalVersion;}
function renderAssistance(){
  const materialValues={p:1,n:3,b:3,r:5,q:9,k:0};
  const material={w:0,b:0};
  for(const file of FILES)for(const rank of RANKS){
    const piece=game.get(file+rank);
    if(piece)material[piece.color]+=materialValues[piece.type]||0;
  }
  for(const [id,color] of [['captures-top',opposite(orientation)],['captures-bottom',orientation]]){
    const row=$('#'+id);row.replaceChildren();
    const label=document.createElement('span');label.textContent=colorName(color)+' captured: ';row.appendChild(label);
    const captures=mode==='sandbox'?[]:game.history({verbose:true}).filter(move=>move.color===color&&move.captured);
    for(const move of captures){const img=document.createElement('img');img.src='assets/pieces/'+opposite(color)+move.captured.toUpperCase()+'.svg';img.alt=colorName(opposite(color))+' '+PIECE_NAMES[move.captured];row.appendChild(img);}
    if(!captures.length)row.appendChild(document.createTextNode(mode==='sandbox'?'Not tracked in Sandbox':'None'));
    const advantage=material[color]-material[opposite(color)];
    if(advantage>0){
      const score=document.createElement('strong');score.className='material-advantage';
      score.textContent=' +'+advantage;
      score.title=colorName(color)+' is ahead by '+advantage+' material points (pawn 1, knight/bishop 3, rook 5, queen 9).';
      score.setAttribute('aria-label',colorName(color)+' is ahead by '+advantage+' material points');
      row.appendChild(score);
    }
  }
  if(reviewSession){stopEvaluation();return;}
  $('#guide-panel').classList.toggle('hidden',!guideEnabled);
  if(guideEnabled){
    const history=game.history({verbose:true}).map(uci);
    let lines=mode==='sandbox'||customPosition?[]:openingContinuations(history);
    if(mode==='opening'){
      const opening=OPENINGS.find(item=>item.id===$('#opening').value);
      const practiceLines=$('#variation').value==='family'?opening.lines:[opening.lines[Number($('#variation').value)]];
      lines=lines.filter(line=>practiceLines.some(practice=>practice.moves.join(' ')===line.key));
    }
    const select=$('#guide-line');select.replaceChildren();
    for(const line of lines){const option=document.createElement('option');option.value=line.key;option.textContent=line.name;select.appendChild(option);}
    if(lines.some(line=>line.key===guideKey))select.value=guideKey;
    guideKey=select.value;select.disabled=!lines.length;
    const line=lines.find(line=>line.key===guideKey);
    const common=lines.length&&lines.every(item=>item.name.split(' — ')[0]===lines[0].name.split(' — ')[0]);
    $('#opening-name').textContent=mode==='sandbox'||customPosition?'Opening recognition is unavailable for edited positions.':!lines.length?'Out of book — no matching line in this repertoire.':!history.length?'Starting position — choose a line to explore.':common?'Opening: '+lines[0].name.split(' — ')[0]:'Several openings remain possible — choose a continuation.';
    const next=line?.moves[history.length];
    if(next){const preview=new Chess(game.fen());const move=preview.move(next);$('#guide-next').textContent=colorName(game.turn())+' next: '+move.san+' ('+next.slice(0,2)+' → '+next.slice(2,4)+')'+(game.turn()!==playerColor?' — opponent’s reply; your move follows.':'.');}
    else $('#guide-next').textContent=line?'Selected repertoire line complete.':'No book suggestion for this position.';
  }
  $('#eval-panel').classList.toggle('hidden',!evalEnabled);
  $('#eval-details').classList.toggle('hidden',!evalEnabled);
  $('.board-stage').classList.toggle('has-evaluation',evalEnabled);
  $('#eval-panel').classList.toggle('black-at-bottom',orientation==='b');
  $('#eval-top-side').textContent=orientation==='w'?'B':'W';
  $('#eval-bottom-side').textContent=orientation==='w'?'W':'B';
  if(!evalEnabled)return;
  if(mode==='sandbox'){stopEvaluation();$('#eval-score').textContent='Unavailable in Sandbox';return;}
  if(game.isGameOver()){stopEvaluation();$('#eval-score').textContent=game.isCheckmate()?colorName(opposite(game.turn()))+' wins':'Draw';$('#eval-fill').style.height=game.isCheckmate()?(game.turn()==='b'?'100%':'0%'):'50%';return;}
  if(isComputerThinking){$('#eval-score').textContent='Waiting for computer move…';return;}
  const fen=game.fen();if(evalFen===fen)return;
  stopEvaluation();evalFen=fen;const version=evalVersion;
  $('#eval-score').textContent='Analyzing…';$('#eval-fill').style.height='50%';
  evalTimer=setTimeout(async()=>{
    if(isComputerThinking||version!==evalVersion)return;
    try{const score=await analysis.analyze(fen);if(version!==evalVersion||game.fen()!==fen||!evalEnabled)return;
      $('#eval-score').textContent=score.kind==='mate'?(score.value>=0?'White':'Black')+' mates in '+Math.abs(score.value):(score.value>=0?'+':'')+(score.value/100).toFixed(2);
      const advantage=score.kind==='mate'?Math.sign(score.value)*10000:score.value;
      $('#eval-fill').style.height=(50+49*Math.tanh(advantage/500))+'%';
    }catch(error){if(version===evalVersion&&error.message!=='cancelled'){$('#eval-score').textContent='Analysis unavailable — toggle to retry';}}
  },250);
}
$('#eval-toggle').onclick=()=>{evalEnabled=!evalEnabled;stopEvaluation();$('#eval-toggle').textContent='Evaluation '+(evalEnabled?'ON':'OFF');$('#eval-toggle').setAttribute('aria-pressed',String(evalEnabled));renderAssistance();};
$('#guide-toggle').onclick=()=>{guideEnabled=!guideEnabled;$('#guide-toggle').textContent='Opening guidance '+(guideEnabled?'ON':'OFF');$('#guide-toggle').setAttribute('aria-pressed',String(guideEnabled));renderAssistance();};
$('#guide-line').onchange=()=>{guideKey=$('#guide-line').value;renderAssistance();};
function clearSandboxAnalysis(){
  ++sandboxAnalysisVersion;sandboxEngine.cancel();sandboxSuggestion=null;
  $('#sandbox-candidates').replaceChildren();$('#sandbox-analysis-status').textContent='';
  $('#analyze-sandbox').disabled=false;$('#cancel-sandbox-analysis').classList.add('hidden');
}
$('#cancel-sandbox-analysis').onclick=()=>{clearSandboxAnalysis();$('#sandbox-analysis-status').textContent='Analysis cancelled.';renderBoard();};
for(const id of ['fen','castling','en-passant'])$('#'+id).addEventListener('input',()=>{clearSandboxAnalysis();renderBoard();});
$('#analyze-sandbox').onclick=async()=>{
  if(mode!=='sandbox'||animationBusy)return;
  clearSandboxAnalysis();clearSelection();renderBoard();
  const fen=game.fen(),error=sandboxAnalysisError(game);
  if(error){$('#sandbox-analysis-status').textContent=error;return;}
  const legal=game.moves({verbose:true}).map(uci);
  if(!legal.length){$('#sandbox-analysis-status').textContent=game.inCheck()?'Checkmate — no legal moves.':'Stalemate — no legal moves.';return;}
  const version=sandboxAnalysisVersion;
  $('#analyze-sandbox').disabled=true;$('#cancel-sandbox-analysis').classList.remove('hidden');
  $('#sandbox-analysis-status').textContent='Analyzing '+colorName(game.turn())+' to move…';
  try{
    const candidates=await sandboxEngine.analyze(fen,legal);
    if(version!==sandboxAnalysisVersion||fen!==game.fen()||mode!=='sandbox')return;
    $('#sandbox-analysis-status').textContent=`${candidates.length} suggested moves for ${colorName(game.turn())} · depth ${candidates[0].depth}`;
    for(const [index,candidate] of candidates.entries()){
      const preview=new Chess(fen),move=preview.move(candidate.move),button=document.createElement('button');
      const score=candidate.kind==='mate'?(candidate.value>=0?'White':'Black')+' mates in '+Math.abs(candidate.value):(candidate.value>=0?'+':'')+(candidate.value/100).toFixed(2);
      button.textContent=`${index+1}. ${move.san} (${move.from} → ${move.to}) · ${score}`;button.setAttribute('aria-pressed','false');
      button.onclick=()=>{if(game.fen()!==fen)return;sandboxSuggestion=candidate.move;for(const sibling of button.parentElement.children)sibling.setAttribute('aria-pressed',String(sibling===button));renderBoard();};
      $('#sandbox-candidates').appendChild(button);
    }
  }catch(error){if(version===sandboxAnalysisVersion&&error.message!=='cancelled')$('#sandbox-analysis-status').textContent=error.message;}
  finally{if(version===sandboxAnalysisVersion){$('#analyze-sandbox').disabled=false;$('#cancel-sandbox-analysis').classList.add('hidden');}}
};


// Reviews use an immutable move/FEN snapshot. Navigation never undoes the live game.
function reviewSnapshot(){
  const moves=game.history({verbose:true}),position=new Chess(gameRootFen),frames=[position.fen()];
  for(const move of moves){position.move({from:move.from,to:move.to,promotion:move.promotion||'q'});frames.push(position.fen());}
  return {root:gameRootFen,moves,frames,player:playerColor,strength:difficultyEl.value,results:{},stops:[],complete:false};
}
function reviewPosition(index){
  const position=new Chess(reviewSession.data.root);
  for(let i=0;i<index;i++){const move=reviewSession.data.moves[i];position.move({from:move.from,to:move.to,promotion:move.promotion||'q'});}
  return position;
}
function reviewMoveName(data,index){
  const fields=data.frames[index].split(' '),move=data.moves[index];
  return fields[5]+(move.color==='w'?'. ':'… ')+move.san;
}
function reviewScore(score){return score.kind==='mate'?(score.value>0?'White':'Black')+' mates in '+Math.abs(score.value):(score.value>=0?'+':'')+(score.value/100).toFixed(2);}
function reviewLoss(best,played,color){
  const sign=color==='w'?1:-1,b=best.value*sign,p=played.value*sign;
  if(best.kind==='mate'&&b>0&&!(played.kind==='mate'&&p>0))return {kind:'missed-mate',weight:8000};
  if(played.kind==='mate'&&p<0&&!(best.kind==='mate'&&b<0))return {kind:'allows-mate',weight:10000};
  if(best.kind==='cp'&&played.kind==='cp'&&Math.min(best.depth,played.depth)>=8&&b-p>=150)return {kind:'opportunity',loss:b-p,weight:Math.min(7000,b-p)};
  return null;
}
function reviewLine(fen,pv){
  const position=new Chess(fen),line=[];
  for(const uciMove of pv.slice(0,4)){try{const move=position.move(uciMove);if(!move)break;line.push(move.san);}catch{break;}}
  return line.join(' → ');
}
function reviewTip(result){
  const data=reviewSession.data,move=data.moves[result.index],before=new Chess(data.frames[result.index]);
  const alternative=before.move(result.best.move),after=new Chess(data.frames[result.index]);after.move({from:move.from,to:move.to,promotion:move.promotion||'q'});
  let lesson=result.kind==='allows-mate'?'This gives your opponent a forced mating line. Before moving, check their checks and threats to your king.':result.kind==='missed-mate'?'You had a forced mating line here. Look for forcing checks before choosing a quieter move.':'This move gave away a significant part of your advantage or made a difficult position worse.';
  const reply=result.played.pv?.[1];
  if(reply){try{const response=after.move(reply);if(response.captured)lesson+=' After your move, '+colorName(response.color)+' can capture your '+PIECE_NAMES[response.captured]+' on '+response.to+' with '+response.san+'.';else if(response.san.includes('+'))lesson+=' Their reply '+response.san+' puts your king in check.';}catch{}}
  if(alternative.captured)lesson+=' The alternative captures a '+PIECE_NAMES[alternative.captured]+' on '+alternative.to+'.';
  else if(alternative.san.includes('+')&&!alternative.san.includes('#'))lesson+=' The alternative starts with a forcing check.';
  return 'You played '+move.san+'. '+lesson+' Try '+alternative.san+' and compare the continuation.';
}
function stopReviewSearch(){++reviewSerial;reviewEngine.cancel();if(reviewSession)reviewSession.analyzing=false;}
function openReview(){
  if(animationBusy||reviewSession)return;
  const data=mode==='game'&&game.isGameOver()&&game.history().length?reviewSnapshot():reviewArchive;
  if(!data)return;
  const returnState={game,mode,orientation,lastMove,customPosition,gameRootFen,gameStartTurn,playerColor,computerColor};
  stopReviewSearch();invalidate();reviewArchive=data;
  reviewSession={data,returnState,cursor:0,preview:null,activeTip:null,analyzing:false,userMoved:false};
  mode='game';playerColor=data.player;computerColor=opposite(playerColor);orientation=playerColor;
  $('#review-side').value=data.player;$('#review-strength').value=data.strength;
  $('#review-panel').classList.remove('hidden');
  $('#review-moves').replaceChildren();
  const first=document.createElement('button');first.textContent='Start';first.onclick=()=>goReview(0);$('#review-moves').appendChild(first);
  data.moves.forEach((move,index)=>{const button=document.createElement('button');button.textContent=reviewMoveName(data,index);button.setAttribute('aria-label','Position after '+reviewMoveName(data,index));button.dataset.ply=index+1;button.onclick=()=>goReview(index+1);$('#review-moves').appendChild(button);});
  goReview(0,false);$('#review-exit').focus({preventScroll:true});
  if(!data.complete)analyzeReview();else if(data.stops.length)selectReviewTip(data.stops[0]);
}
function closeReview(render=true){
  if(!reviewSession)return;
  const state=reviewSession.returnState;stopReviewSearch();reviewSession=null;invalidate();
  ({game,mode,orientation,lastMove,customPosition,gameRootFen,gameStartTurn,playerColor,computerColor}=state);
  $('#review-panel').classList.add('hidden');clearSelection();
  if(render){renderBoard();scheduleComputerMove();}
}
function goReview(index,user=true,keepTip=false){
  if(!reviewSession)return;
  const session=reviewSession;
  session.cursor=Math.max(0,Math.min(session.data.moves.length,index));session.preview=null;
  if(user)session.userMoved=true;if(!keepTip)session.activeTip=null;
  game=reviewPosition(session.cursor);lastMove=session.cursor?session.data.moves[session.cursor-1]:null;clearSelection();renderBoard();renderReview();
}
function selectReviewTip(tip){reviewSession.activeTip=tip;goReview(tip.index,false,true);}
function renderReview(){
  if(!reviewSession)return;
  const session=reviewSession,data=session.data,tip=session.activeTip,stopIndex=tip?data.stops.findIndex(stop=>stop.index===tip.index):-1;
  $('#review-stop-prev').disabled=stopIndex<=0;$('#review-stop-next').disabled=!data.stops.length||stopIndex===data.stops.length-1;
  $('#review-played').disabled=!tip;$('#review-best').disabled=!tip;$('#review-before').disabled=!tip;
  $('#review-first').disabled=session.cursor===0&&!session.preview;$('#review-prev').disabled=session.cursor===0&&!session.preview;
  $('#review-next').disabled=session.cursor>=data.moves.length;$('#review-last').disabled=session.cursor===data.moves.length&&!session.preview;
  $('#review-retry-position').disabled=game.isGameOver();
  $('#review-analyze').disabled=session.analyzing;$('#review-analyze').textContent=data.complete?'Analyze again':'Analyze game';
  $('#review-cancel').classList.toggle('hidden',!session.analyzing);
  $('#review-position').textContent=session.preview==='stronger'?'Suggested alternative to '+reviewMoveName(data,tip.index):session.cursor?'After '+reviewMoveName(data,session.cursor-1):'Starting position · '+colorName(game.turn())+' to move';
  for(const button of $('#review-moves').children)button.setAttribute('aria-current',String(Number(button.dataset.ply||0)===session.cursor&&!session.preview));
  if(tip){
    $('#coach-title').textContent='Learning stop '+(stopIndex+1)+' of '+data.stops.length+' · '+reviewMoveName(data,tip.index);
    $('#coach-tip').textContent=reviewTip(tip);
    $('#coach-line').textContent='Stronger line: '+reviewLine(data.frames[tip.index],tip.best.pv);
    $('#coach-score').textContent='Best alternative: '+reviewScore(tip.best)+' · Played move: '+reviewScore(tip.played)+' · scores favor White when positive.';
  }else{
    $('#coach-title').textContent=session.analyzing?'Let’s find your learning moments':data.complete&&!data.stops.length?'No clear mistake found in this short review':'Let’s walk through your game';
    $('#coach-tip').textContent=session.analyzing?'I’m checking your '+colorName(data.player)+' moves. You can already rewind with the arrows. When tips are ready, use Next tip to visit a learning stop.':data.stops.length?'Use Next tip to pause before a move worth revisiting. Compare what you played with the stronger move, then try it yourself.':'Use the arrows or move list to replay the game. Try a position with Play from here. Short analysis can miss deeper ideas.';
    $('#coach-line').textContent='';$('#coach-score').textContent='';
  }
}
async function analyzeReview(){
  if(!reviewSession)return;
  stopReviewSearch();const token=reviewSerial,session=reviewSession,data=session.data;
  session.analyzing=true;data.complete=false;
  const playerMoves=data.moves.map((move,index)=>({move,index})).filter(item=>item.move.color===data.player);
  let done=0;renderReview();
  try{
    for(const {move,index} of playerMoves){
      if(token!==reviewSerial||reviewSession!==session)return;
      $('#review-progress').textContent='Checking your move '+(done+1)+' of '+playerMoves.length+' · '+reviewMoveName(data,index);
      if(!data.results[index]){
        const position=new Chess(data.frames[index]),legal=position.moves({verbose:true}).map(uci),playedMove=uci(move);
        const best=await reviewEngine.analyze(data.frames[index],legal);
        if(token!==reviewSerial||reviewSession!==session)return;
        const played=best.move===playedMove?best:await reviewEngine.analyze(data.frames[index],legal,playedMove);
        if(token!==reviewSerial||reviewSession!==session)return;
        const loss=best.move===playedMove?null:reviewLoss(best,played,data.player);
        data.results[index]={index,best,played,...(loss||{}),learning:!!loss};
      }
      ++done;
      data.stops=Object.values(data.results).filter(result=>result.learning).sort((a,b)=>b.weight-a.weight).slice(0,6).sort((a,b)=>a.index-b.index);
      if(session.activeTip&&!data.stops.some(stop=>stop.index===session.activeTip.index))session.activeTip=null;
      renderReview();
    }
    data.complete=true;session.analyzing=false;
    $('#review-progress').textContent='Review ready · '+done+' of your moves checked · '+data.stops.length+' learning '+(data.stops.length===1?'stop':'stops');
    if(!session.userMoved&&!session.activeTip&&data.stops.length)selectReviewTip(data.stops[0]);else renderReview();
  }catch(error){
    if(token!==reviewSerial||reviewSession!==session)return;
    session.analyzing=false;$('#review-progress').textContent=error.message+' Your replay and completed tips are still available.';renderReview();
  }finally{if(token===reviewSerial)reviewEngine.cancel();}
}
$('#review-open').onclick=openReview;$('#checkmate-review').onclick=openReview;
$('#review-exit').onclick=()=>closeReview();
$('#review-first').onclick=()=>goReview(0);$('#review-prev').onclick=()=>goReview(reviewSession.cursor-1);$('#review-next').onclick=()=>goReview(reviewSession.cursor+1);$('#review-last').onclick=()=>goReview(reviewSession.data.moves.length);
$('#review-stop-prev').onclick=()=>{const stops=reviewSession.data.stops,index=stops.findIndex(stop=>stop.index===reviewSession.activeTip?.index);if(index>0)selectReviewTip(stops[index-1]);};
$('#review-stop-next').onclick=()=>{const stops=reviewSession.data.stops,index=stops.findIndex(stop=>stop.index===reviewSession.activeTip?.index);if(index+1<stops.length)selectReviewTip(stops[index+1]);};
$('#review-before').onclick=()=>goReview(reviewSession.activeTip.index,true,true);
$('#review-played').onclick=()=>goReview(reviewSession.activeTip.index+1,true,true);
$('#review-best').onclick=()=>{const session=reviewSession;game=reviewPosition(session.activeTip.index);lastMove=game.move(session.activeTip.best.move);session.cursor=session.activeTip.index;session.preview='stronger';session.userMoved=true;clearSelection();renderBoard();renderReview();};
$('#review-analyze').onclick=()=>{reviewSession.data.results={};reviewSession.data.stops=[];reviewSession.activeTip=null;analyzeReview();};
$('#review-cancel').onclick=()=>{stopReviewSearch();$('#review-progress').textContent='Analysis stopped. Replay and completed tips remain available.';renderReview();};
$('#review-retry-position').onclick=()=>{
  if(!reviewSession||game.isGameOver())return;
  const fen=game.fen(),side=$('#review-side').value,strength=$('#review-strength').value;
  reviewArchive=reviewSession.data;closeReview(false);playAsEl.value=side;difficultyEl.value=strength;mode='game';startNewGame(fen);
};

startNewGame();

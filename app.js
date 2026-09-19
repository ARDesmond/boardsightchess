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
let mode = 'game', orientation = 'w', generation = 0, botTimer = null;
let animationBusy = false, drag = null, suppressClick = false, inspected = null, releaseVisual = null;
let hintVisible = false, trainingMessage = '', promotionPending = null;
let game = new Chess();
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
        <div class="board-wrap">
          <div id="board" class="board" role="grid" aria-label="Chess board"></div>
        </div>
      </div>

      <aside class="side-panel">
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
            <button id="new-game" class="primary-button">Play New Game</button>
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
  renderStatus(); renderExtras();
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

function renderStatus() {
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
  if(mode==='sandbox'||game.turn()!==computerColor||game.isGameOver()||isComputerThinking)return;
  const accepted=mode==='opening'?acceptedMoves():[];
  if(mode==='opening'&&!accepted.length){renderExtras();return;}
  const token=generation, fen=game.fen(), started=performance.now(), delay=900+Math.random()*900;
  isComputerThinking=true;thinkingEl.classList.remove('hidden');document.querySelector('#retry-bot').classList.add('hidden');
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

function startNewGame() {
  invalidate();
  game = new Chess();
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
  if (computerColor === 'w') scheduleComputerMove();
}

function takeBack() {
  invalidate();
  if (!game.history().length) return;
  if (playerColor === 'b' && game.history().length === 1) return;

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
  ++generation;clearTimeout(botTimer);opponent.cancel();isComputerThinking=false;animationBusy=false;
  thinkingEl.classList.add('hidden');$('#retry-bot').classList.add('hidden');
  cancelDrag();document.querySelectorAll('.motion-piece,.inspector-lines,.promotion-choice').forEach(el=>el.remove());
  promotionPending=null;releaseVisual=null;
}
function renderExtras(){
  $('#sight-toggle').textContent=mapVisible()?'Boardsight ON':'Boardsight OFF';
  $('#sight-toggle').setAttribute('aria-pressed',String(mapVisible()));
  $('#game-setup').classList.toggle('hidden',mode!=='game'||game.history().length>0);
  $('#game-setup').previousElementSibling.textContent=mode==='game'?'Game & Boardsight':'Boardsight';
  $('#undo').classList.toggle('hidden',mode==='sandbox');
  $('#undo').disabled=!game.history().length||(playerColor==='b'&&game.history().length===1);
  $('#new-game').classList.toggle('hidden',mode!=='game');
  $('#game-info').textContent=mode==='game'?`You: ${colorName(playerColor)} · Stockfish ≈ ${difficultyEl.value}${difficultyEl.value==='2200'?'+':''} Elo`:mode==='sandbox'?'Blue: White · Red: Black':'Practicing '+colorName(playerColor);
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
  if(animationBusy)return;
  const piece=game.get(from);if(!piece)return;
  const token=generation;let move;
  if(mode==='sandbox'){
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
  invalidate();mode=button.dataset.mode;for(const b of document.querySelectorAll('[data-mode]'))b.setAttribute('aria-pressed',String(b===button));
  $('#opening-panel').classList.toggle('hidden',mode!=='opening');$('#sandbox-panel').classList.toggle('hidden',mode!=='sandbox');
  $('#inspect-toggle').setAttribute('aria-pressed','false');
  if(mode==='sandbox'){playerColor='w';computerColor='b';clearSelection();syncSandbox();renderBoard();}else startNewGame();
};
for(const choice of ['move','erase',...Object.keys(PIECES)]){
  const b=document.createElement('button');b.type='button';b.textContent=PIECES[choice]||choice;if(PIECES[choice])b.dataset.art=choice;b.setAttribute('aria-label',PIECES[choice]?colorName(choice[0])+' '+PIECE_NAMES[choice[1]]:choice);b.setAttribute('aria-pressed',String(choice==='move'));
  b.onclick=()=>{trayChoice=choice;clearSelection();for(const el of b.parentElement.children)el.setAttribute('aria-pressed',String(el===b));renderBoard();};$('#piece-tray').appendChild(b);
}
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
startNewGame();

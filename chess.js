
'use strict';
const { Chess } = (() => {
const FILES = ['a','b','c','d','e','f','g','h'];
const PROMOTIONS = ['q','r','b','n'];

function clonePiece(piece) {
  return piece ? { ...piece } : null;
}

function squareToIndex(square) {
  if (!square || square.length !== 2) return null;
  const x = FILES.indexOf(square[0]);
  const y = Number(square[1]) - 1;
  if (x < 0 || y < 0 || y > 7) return null;
  return { x, y };
}

function indexToSquare(x, y) {
  if (x < 0 || x > 7 || y < 0 || y > 7) return null;
  return `${FILES[x]}${y + 1}`;
}

class Chess {
  constructor(fen = Chess.DEFAULT_POSITION) {
    this.load(fen);
  }

  static DEFAULT_POSITION = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  load(fen) {
    const parts = fen.trim().split(/\s+/);
    if (parts.length !== 6) throw new Error('FEN requires six fields');
    const [placement, turn, castling, ep, halfmove = '0', fullmove = '1'] = parts;
    if (!/^[wb]$/.test(turn) || !/^(?:-|K?Q?k?q?)$/.test(castling) || !castling ||
        !/^(?:-|[a-h][36])$/.test(ep) || !/^\d+$/.test(halfmove) || !/^[1-9]\d*$/.test(fullmove)) throw new Error('Invalid FEN metadata');
    const board = Array.from({ length: 8 }, () => Array(8).fill(null));
    const ranks = placement.split('/');
    if (ranks.length !== 8) throw new Error('Invalid FEN placement');

    for (let fenRank = 0; fenRank < 8; fenRank++) {
      let x = 0;
      const y = 7 - fenRank;
      for (const char of ranks[fenRank]) {
        if (/[1-8]/.test(char)) {
          x += Number(char);
        } else {
          if (!/[prnbqkPRNBQK]/.test(char) || x >= 8) throw new Error('Invalid FEN piece');
          const color = char === char.toUpperCase() ? 'w' : 'b';
          const type = char.toLowerCase();
          board[y][x] = { color, type };
          x += 1;
        }
      }
      if (x !== 8) throw new Error('Invalid FEN rank');
    }

    this.board = board;
    this.turnColor = turn;
    this.castling = {
      K: castling.includes('K'), Q: castling.includes('Q'),
      k: castling.includes('k'), q: castling.includes('q'),
    };
    this.epSquare = ep === '-' ? null : ep;
    this.halfmoveClock = Number(halfmove) || 0;
    this.fullmoveNumber = Number(fullmove) || 1;
    this.moveStack = [];
    this.gameHistory = [];
    this.positionCounts = new Map();
    this._incrementPosition();
    return true;
  }

  reset() {
    return this.load(Chess.DEFAULT_POSITION);
  }

  get(square) {
    const idx = squareToIndex(square);
    if (!idx) return null;
    return clonePiece(this.board[idx.y][idx.x]);
  }

  put(piece, square) {
    const idx = squareToIndex(square);
    if (!idx || !piece || !['w','b'].includes(piece.color) || !'pnbrqk'.includes(piece.type)) return false;
    this.board[idx.y][idx.x] = clonePiece(piece);
    return true;
  }

  remove(square) {
    const idx = squareToIndex(square);
    if (!idx) return null;
    const piece = this.board[idx.y][idx.x];
    this.board[idx.y][idx.x] = null;
    return clonePiece(piece);
  }

  turn() { return this.turnColor; }

  history(options = {}) {
    return options.verbose ? this.gameHistory.map(m => ({ ...m })) : this.gameHistory.map(m => m.san || `${m.from}${m.to}`);
  }

  fen() {
    const rows = [];
    for (let y = 7; y >= 0; y--) {
      let row = '';
      let empty = 0;
      for (let x = 0; x < 8; x++) {
        const piece = this.board[y][x];
        if (!piece) {
          empty += 1;
          continue;
        }
        if (empty) { row += empty; empty = 0; }
        const letter = piece.color === 'w' ? piece.type.toUpperCase() : piece.type;
        row += letter;
      }
      if (empty) row += empty;
      rows.push(row);
    }
    const rights = ['K','Q','k','q'].filter(k => this.castling[k]).join('') || '-';
    return `${rows.join('/')} ${this.turnColor} ${rights} ${this.epSquare || '-'} ${this.halfmoveClock} ${this.fullmoveNumber}`;
  }

  _positionKey() {
    return this.fen().split(' ').slice(0, 4).join(' ');
  }

  _incrementPosition() {
    const key = this._positionKey();
    this.positionCounts.set(key, (this.positionCounts.get(key) || 0) + 1);
  }

  _decrementPosition() {
    const key = this._positionKey();
    const count = this.positionCounts.get(key) || 0;
    if (count <= 1) this.positionCounts.delete(key);
    else this.positionCounts.set(key, count - 1);
  }

  moves(options = {}) {
    let moves = this._legalMoves();
    if (options.square) moves = moves.filter(m => m.from === options.square);
    if (options.verbose) return moves.map(m => ({ ...m }));
    return moves.map(m => m.san || `${m.from}${m.to}${m.promotion || ''}`);
  }

  move(input) {
    if (!input) throw new Error('Move required');
    let from;
    let to;
    let promotion = 'q';
    if (typeof input === 'string') {
      const match = input.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/i);
      if (!match) throw new Error('Only coordinate notation is supported');
      [, from, to, promotion = 'q'] = match;
    } else {
      ({ from, to } = input);
      promotion = input.promotion || promotion;
    }

    const candidates = this._legalMoves().filter(m => m.from === from && m.to === to);
    if (!candidates.length) throw new Error(`Illegal move: ${from}-${to}`);
    const chosen = candidates.find(m => !m.promotion || m.promotion === promotion) || candidates[0];
    const beforeTurn = this.turnColor;
    this._makeMove(chosen, true);
    const result = { ...chosen };
    result.san = input.skipSan ? `${result.from}${result.to}${result.promotion || ''}` : this._sanForMove(result, beforeTurn);
    this.gameHistory[this.gameHistory.length - 1].san = result.san;
    return result;
  }

  undo() {
    if (!this.moveStack.length) return null;
    this._decrementPosition();
    const record = this.moveStack.pop();
    const move = this.gameHistory.pop();
    this._restoreRecord(record);
    return move ? { ...move } : null;
  }

  inCheck() {
    return this._isKingAttacked(this.turnColor);
  }

  isCheck() { return this.inCheck(); }

  isCheckmate() {
    return this.inCheck() && this._legalMoves().length === 0;
  }

  isStalemate() {
    return !this.inCheck() && this._legalMoves().length === 0;
  }

  isThreefoldRepetition() {
    return [...this.positionCounts.values()].some(count => count >= 3);
  }

  isInsufficientMaterial() {
    const pieces = [];
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const p = this.board[y][x];
        if (p) pieces.push({ ...p, x, y });
      }
    }
    const nonKings = pieces.filter(p => p.type !== 'k');
    if (nonKings.length === 0) return true;
    if (nonKings.length === 1 && ['b','n'].includes(nonKings[0].type)) return true;
    if (nonKings.every(p => p.type === 'b')) {
      const colors = new Set(nonKings.map(p => (p.x + p.y) % 2));
      return colors.size === 1;
    }
    return false;
  }

  isDraw() {
    return this.isStalemate() || this.isInsufficientMaterial() || this.isThreefoldRepetition() || this.halfmoveClock >= 100;
  }

  isGameOver() {
    return this.isCheckmate() || this.isDraw();
  }

  _legalMoves() {
    const pseudo = this._pseudoMoves(this.turnColor);
    const legal = [];
    for (const move of pseudo) {
      const record = this._makeMove(move, false);
      const illegal = this._isKingAttacked(move.color);
      this._restoreRecord(record);
      if (!illegal && move.captured !== 'k') legal.push(move);
    }
    return legal;
  }

  _pseudoMoves(color) {
    const moves = [];
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const piece = this.board[y][x];
        if (!piece || piece.color !== color) continue;
        const from = indexToSquare(x, y);
        if (piece.type === 'p') this._pawnMoves(moves, from, x, y, piece);
        else if (piece.type === 'n') this._jumpMoves(moves, from, x, y, piece, [[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]]);
        else if (piece.type === 'k') this._kingMoves(moves, from, x, y, piece);
        else this._slidingMoves(moves, from, x, y, piece);
      }
    }
    return moves;
  }

  _baseMove(from, to, piece, extras = {}) {
    const target = this.get(to);
    return {
      color: piece.color,
      piece: piece.type,
      from,
      to,
      captured: target?.type,
      flags: target ? 'c' : 'n',
      san: '',
      ...extras,
    };
  }

  _pawnMoves(moves, from, x, y, piece) {
    const dir = piece.color === 'w' ? 1 : -1;
    const startRank = piece.color === 'w' ? 1 : 6;
    const promotionRank = piece.color === 'w' ? 7 : 0;
    const oneY = y + dir;
    const one = indexToSquare(x, oneY);
    if (one && !this.board[oneY][x]) {
      if (oneY === promotionRank) {
        for (const promotion of PROMOTIONS) moves.push(this._baseMove(from, one, piece, { promotion, flags: 'p' }));
      } else {
        moves.push(this._baseMove(from, one, piece));
        const twoY = y + dir * 2;
        const two = indexToSquare(x, twoY);
        if (y === startRank && !this.board[twoY][x]) moves.push(this._baseMove(from, two, piece, { flags: 'b' }));
      }
    }

    for (const dx of [-1, 1]) {
      const tx = x + dx;
      const ty = y + dir;
      const to = indexToSquare(tx, ty);
      if (!to) continue;
      const target = this.board[ty][tx];
      if (target && target.color !== piece.color) {
        if (ty === promotionRank) {
          for (const promotion of PROMOTIONS) moves.push(this._baseMove(from, to, piece, { promotion, captured: target.type, flags: 'cp' }));
        } else {
          moves.push(this._baseMove(from, to, piece));
        }
      } else if (!target && this.epSquare === to && this.board[y][tx]?.type === 'p' && this.board[y][tx]?.color !== piece.color) {
        moves.push(this._baseMove(from, to, piece, { captured: 'p', flags: 'e', enPassant: true }));
      }
    }
  }

  _jumpMoves(moves, from, x, y, piece, jumps) {
    for (const [dx, dy] of jumps) {
      const to = indexToSquare(x + dx, y + dy);
      if (!to) continue;
      const target = this.get(to);
      if (!target || target.color !== piece.color) moves.push(this._baseMove(from, to, piece));
    }
  }

  _kingMoves(moves, from, x, y, piece) {
    const jumps = [];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (dx || dy) jumps.push([dx,dy]);
    this._jumpMoves(moves, from, x, y, piece, jumps);

    const enemy = piece.color === 'w' ? 'b' : 'w';
    const rank = piece.color === 'w' ? 0 : 7;
    const kingRight = piece.color === 'w' ? 'K' : 'k';
    const queenRight = piece.color === 'w' ? 'Q' : 'q';
    const home = indexToSquare(4, rank);
    if (from !== home || this._isSquareAttacked(from, enemy)) return;

    if (this.castling[kingRight]) {
      const rook = this.board[rank][7];
      if (rook?.type === 'r' && rook.color === piece.color && !this.board[rank][5] && !this.board[rank][6]
        && !this._isSquareAttacked(indexToSquare(5, rank), enemy)
        && !this._isSquareAttacked(indexToSquare(6, rank), enemy)) {
        moves.push(this._baseMove(from, indexToSquare(6, rank), piece, { flags: 'k', castle: 'king' }));
      }
    }
    if (this.castling[queenRight]) {
      const rook = this.board[rank][0];
      if (rook?.type === 'r' && rook.color === piece.color && !this.board[rank][1] && !this.board[rank][2] && !this.board[rank][3]
        && !this._isSquareAttacked(indexToSquare(3, rank), enemy)
        && !this._isSquareAttacked(indexToSquare(2, rank), enemy)) {
        moves.push(this._baseMove(from, indexToSquare(2, rank), piece, { flags: 'q', castle: 'queen' }));
      }
    }
  }

  _slidingMoves(moves, from, x, y, piece) {
    const directions = [];
    if (['b','q'].includes(piece.type)) directions.push([1,1],[1,-1],[-1,1],[-1,-1]);
    if (['r','q'].includes(piece.type)) directions.push([1,0],[-1,0],[0,1],[0,-1]);
    for (const [dx, dy] of directions) {
      let tx = x + dx;
      let ty = y + dy;
      while (tx >= 0 && tx < 8 && ty >= 0 && ty < 8) {
        const to = indexToSquare(tx, ty);
        const target = this.board[ty][tx];
        if (!target) moves.push(this._baseMove(from, to, piece));
        else {
          if (target.color !== piece.color) moves.push(this._baseMove(from, to, piece));
          break;
        }
        tx += dx;
        ty += dy;
      }
    }
  }

  _isKingAttacked(color) {
    let kingSquare = null;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const p = this.board[y][x];
        if (p?.type === 'k' && p.color === color) kingSquare = indexToSquare(x, y);
      }
    }
    if (!kingSquare) return true;
    return this._isSquareAttacked(kingSquare, color === 'w' ? 'b' : 'w');
  }

  _isSquareAttacked(square, byColor) {
    const idx = squareToIndex(square);
    const { x, y } = idx;

    const pawnSourceY = y + (byColor === 'w' ? -1 : 1);
    for (const sx of [x - 1, x + 1]) {
      if (sx >= 0 && sx < 8 && pawnSourceY >= 0 && pawnSourceY < 8) {
        const p = this.board[pawnSourceY][sx];
        if (p?.color === byColor && p.type === 'p') return true;
      }
    }

    const knightJumps = [[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]];
    for (const [dx, dy] of knightJumps) {
      const tx = x + dx, ty = y + dy;
      if (tx < 0 || tx > 7 || ty < 0 || ty > 7) continue;
      const p = this.board[ty][tx];
      if (p?.color === byColor && p.type === 'n') return true;
    }

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (!dx && !dy) continue;
        const tx = x + dx, ty = y + dy;
        if (tx < 0 || tx > 7 || ty < 0 || ty > 7) continue;
        const p = this.board[ty][tx];
        if (p?.color === byColor && p.type === 'k') return true;
      }
    }

    const rays = [
      [1,0,['r','q']],[-1,0,['r','q']],[0,1,['r','q']],[0,-1,['r','q']],
      [1,1,['b','q']],[1,-1,['b','q']],[-1,1,['b','q']],[-1,-1,['b','q']],
    ];
    for (const [dx, dy, types] of rays) {
      let tx = x + dx, ty = y + dy;
      while (tx >= 0 && tx < 8 && ty >= 0 && ty < 8) {
        const p = this.board[ty][tx];
        if (p) {
          if (p.color === byColor && types.includes(p.type)) return true;
          break;
        }
        tx += dx; ty += dy;
      }
    }
    return false;
  }

  _makeMove(move, commit) {
    const from = squareToIndex(move.from);
    const to = squareToIndex(move.to);
    const movingPiece = clonePiece(this.board[from.y][from.x]);
    const capturedPiece = move.enPassant
      ? clonePiece(this.board[from.y][to.x])
      : clonePiece(this.board[to.y][to.x]);

    const record = {
      move: { ...move },
      board: this.board.map(row => row.map(clonePiece)),
      turnColor: this.turnColor,
      castling: { ...this.castling },
      epSquare: this.epSquare,
      halfmoveClock: this.halfmoveClock,
      fullmoveNumber: this.fullmoveNumber,
    };

    this.board[from.y][from.x] = null;
    if (move.enPassant) this.board[from.y][to.x] = null;
    this.board[to.y][to.x] = move.promotion ? { color: movingPiece.color, type: move.promotion } : movingPiece;

    if (move.castle === 'king') {
      this.board[to.y][5] = this.board[to.y][7];
      this.board[to.y][7] = null;
    } else if (move.castle === 'queen') {
      this.board[to.y][3] = this.board[to.y][0];
      this.board[to.y][0] = null;
    }

    if (movingPiece.type === 'k') {
      if (movingPiece.color === 'w') { this.castling.K = false; this.castling.Q = false; }
      else { this.castling.k = false; this.castling.q = false; }
    }
    if (movingPiece.type === 'r') {
      if (move.from === 'a1') this.castling.Q = false;
      if (move.from === 'h1') this.castling.K = false;
      if (move.from === 'a8') this.castling.q = false;
      if (move.from === 'h8') this.castling.k = false;
    }
    if (capturedPiece?.type === 'r') {
      if (move.to === 'a1') this.castling.Q = false;
      if (move.to === 'h1') this.castling.K = false;
      if (move.to === 'a8') this.castling.q = false;
      if (move.to === 'h8') this.castling.k = false;
    }

    this.epSquare = null;
    if (movingPiece.type === 'p' && Math.abs(to.y - from.y) === 2) {
      this.epSquare = indexToSquare(from.x, (from.y + to.y) / 2);
    }

    this.halfmoveClock = movingPiece.type === 'p' || capturedPiece ? 0 : this.halfmoveClock + 1;
    if (this.turnColor === 'b') this.fullmoveNumber += 1;
    this.turnColor = this.turnColor === 'w' ? 'b' : 'w';

    if (commit) {
      const stored = { ...move, captured: capturedPiece?.type || move.captured };
      this.moveStack.push(record);
      this.gameHistory.push(stored);
      this._incrementPosition();
    }
    return record;
  }

  _restoreRecord(record) {
    this.board = record.board.map(row => row.map(clonePiece));
    this.turnColor = record.turnColor;
    this.castling = { ...record.castling };
    this.epSquare = record.epSquare;
    this.halfmoveClock = record.halfmoveClock;
    this.fullmoveNumber = record.fullmoveNumber;
  }

  _sanForMove(move, movingColor) {
    if (move.castle === 'king') return 'O-O';
    if (move.castle === 'queen') return 'O-O-O';
    const pieceLetter = move.piece === 'p' ? '' : move.piece.toUpperCase();
    const capture = move.captured || move.enPassant;
    const pawnFile = move.piece === 'p' && capture ? move.from[0] : '';
    let san = `${pieceLetter}${pawnFile}${capture ? 'x' : ''}${move.to}${move.promotion ? `=${move.promotion.toUpperCase()}` : ''}`;
    if (this.isCheckmate()) san += '#';
    else if (this.inCheck()) san += '+';
    return san;
  }
}

return { Chess };
})();


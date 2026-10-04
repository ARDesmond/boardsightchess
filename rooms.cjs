'use strict';
const { randomBytes, randomInt, createHash } = require('node:crypto');
const { Chess } = require('./chess.js');
const hash = token => createHash('sha256').update(token).digest('hex');
const fail = (message, status = 409) => { const error = new Error(message); error.status = status; throw error; };
const DAY = 86400000;

// One authoritative room manager per service replica. Transport never accepts a FEN.
class Rooms {
  constructor({ snapshot, now = Date.now, save = () => {}, emit = () => {} } = {}) {
    this.now = now; this.save = save; this.emit = emit;
    this.sessions = new Map(snapshot?.sessions || []);
    this.rooms = new Map(snapshot?.rooms || []);
    this.games = new Map(); this.queue = new Map(); this.connections = new Map();
    for (const room of this.rooms.values()) this.game(room);
    this.sweep();
  }
  persist() { this.save({ schema: 1, sessions: [...this.sessions], rooms: [...this.rooms] }); }
  session(token) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) fail('Guest session expired. Reload to reconnect.', 401);
    const id = hash(token), session = this.sessions.get(id);
    if (!session) fail('Guest session expired. Reload to reconnect.', 401);
    return { id, session };
  }
  createSession() {
    this.sweep();
    if (this.sessions.size >= 5000) fail('Online play is busy. Please try again later.', 503);
    const token = randomBytes(32).toString('hex');
    this.sessions.set(hash(token), { room: null, name: 'Guest', touched: this.now() });
    this.persist(); return token;
  }
  game(room) {
    if (!this.games.has(room.code)) {
      const game = new Chess();
      for (const move of room.moves) { if (!game.move(move)) throw new Error('Invalid saved game'); }
      this.games.set(room.code, game);
    }
    return this.games.get(room.code);
  }
  connected(id) { return (this.connections.get(id) || 0) > 0; }
  connect(id) {
    this.connections.set(id, (this.connections.get(id) || 0) + 1);
    this.sessions.get(id).touched = this.now(); this.notify(id);
  }
  disconnect(id) {
    this.connections.set(id, Math.max(0, (this.connections.get(id) || 0) - 1));
    if (!this.connected(id) && this.queue.delete(id)) this.emit(id);
    this.notify(id);
  }
  view(id) {
    const session = this.sessions.get(id), room = this.rooms.get(session?.room);
    if (!session) fail('Guest session expired.', 401);
    if (!room) return { room: null, queued: this.queue.has(id), name: session.name };
    const color = room.players.w === id ? 'w' : 'b', other = color === 'w' ? 'b' : 'w';
    return {
      queued: false, name: session.name,
      room: { code: room.code, kind: room.kind, sight: room.sight, status: room.status,
        version: room.version, moves: [...room.moves], fen: this.game(room).fen(),
        yourColor: color, white: room.names.w, black: room.names.b || 'Waiting for opponent',
        opponentConnected: !!room.players[other] && this.connected(room.players[other]),
        result: room.result, drawOffer: room.drawOffer || null }
    };
  }
  notify(id) {
    const room = this.rooms.get(this.sessions.get(id)?.room);
    if (room) for (const player of Object.values(room.players)) { if (player) this.emit(player); }
    else this.emit(id);
  }
  name(id, value) {
    const name = typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 24) : '';
    this.sessions.get(id).name = name || 'Guest';
    this.sessions.get(id).touched = this.now();
  }
  available(id) {
    const old = this.rooms.get(this.sessions.get(id).room);
    if (old && old.status !== 'finished') fail('Finish or leave your current room first.');
    this.sessions.get(id).room = null; this.queue.delete(id);
  }
  newRoom(id, { name, color = 'random', sight = true, kind = 'private' } = {}) {
    this.sweep(); this.available(id); this.name(id, name);
    if (this.rooms.size >= 1000) fail('Online play is busy. Please try again later.', 503);
    if (!['w', 'b', 'random'].includes(color)) fail('Choose White, Black, or Random.', 400);
    if (typeof sight !== 'boolean') fail('Invalid Boardsight setting.', 400);
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let code;
    do { code = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join(''); } while (this.rooms.has(code));
    if (color === 'random') color = randomInt(2) ? 'b' : 'w';
    const room = { code, kind, sight, status: 'waiting', version: 1, moves: [],
      players: { w: null, b: null }, names: { w: '', b: '' }, created: this.now(), touched: this.now(), result: null };
    room.players[color] = id; room.names[color] = this.sessions.get(id).name;
    this.rooms.set(code, room); this.sessions.get(id).room = code;
    this.persist(); this.notify(id); return this.view(id);
  }
  join(id, { code, name } = {}) {
    code = typeof code === 'string' ? code.trim().toUpperCase() : '';
    const room = this.rooms.get(code);
    if (!room) fail('Room not found. Check the six-character code.', 404);
    if (Object.values(room.players).includes(id)) return this.view(id);
    if (room.status !== 'waiting') fail('This room is full or the game has ended.');
    this.available(id); this.name(id, name);
    const color = room.players.w ? 'b' : 'w';
    room.players[color] = id; room.names[color] = this.sessions.get(id).name;
    this.sessions.get(id).room = code; room.status = 'playing'; room.touched = this.now(); ++room.version;
    this.persist(); this.notify(id); return this.view(id);
  }
  quickplay(id, { name, sight = true } = {}) {
    if (typeof sight !== 'boolean') fail('Invalid Boardsight setting.', 400);
    if (!this.connected(id)) fail('Reconnect before starting Quickplay.');
    this.available(id); this.name(id, name);
    for (const [other, entry] of this.queue) {
      if (other !== id && entry.sight === sight && this.connected(other)) {
        this.queue.delete(other);
        const match = this.newRoom(other, { name: this.sessions.get(other).name, sight, kind: 'quickplay' });
        return this.join(id, { code: match.room.code, name });
      }
    }
    this.queue.set(id, { sight, since: this.now() }); this.persist(); this.emit(id); return this.view(id);
  }
  cancel(id) { this.queue.delete(id); this.emit(id); return this.view(id); }
  own(id, version) {
    const room = this.rooms.get(this.sessions.get(id)?.room);
    if (!room || !Object.values(room.players).includes(id)) fail('Join a room first.', 403);
    if (room.status !== 'playing') fail('This game is not in progress.');
    if (!Number.isInteger(version) || room.version !== version) fail('The board changed. Please try your move again.');
    return { room, color: room.players.w === id ? 'w' : 'b', game: this.game(room) };
  }
  finish(room, result) { room.status = 'finished'; room.result = result; room.drawOffer = null; room.touched = this.now(); }
  move(id, { move, version } = {}) {
    const { room, color, game } = this.own(id, version);
    if (room.drawOffer) fail('Play is paused until the draw offer is accepted or declined.');
    if (game.turn() !== color) fail('Wait for your opponent’s turn.');
    if (typeof move !== 'string' || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)) fail('Invalid move.', 400);
    const legal = game.moves({ verbose: true }).find(m => m.from + m.to + (m.promotion || '') === move);
    if (!legal) fail('That move is not legal.', 400);
    game.move(move); room.moves.push(move); room.drawOffer = null; room.touched = this.now(); ++room.version;
    if (game.isCheckmate()) this.finish(room, { winner: color, reason: 'checkmate' });
    else if (game.isDraw()) this.finish(room, { winner: null, reason: game.isStalemate() ? 'stalemate' : game.isThreefoldRepetition() ? 'threefold repetition' : game.isInsufficientMaterial() ? 'insufficient material' : 'fifty-move rule' });
    this.persist(); this.notify(id); return this.view(id);
  }
  action(id, { action, version } = {}) {
    const { room, color } = this.own(id, version);
    if (action === 'resign') this.finish(room, { winner: color === 'w' ? 'b' : 'w', reason: 'resignation' });
    else if (action === 'offer-draw') {
      if (room.drawOffer) fail('A draw offer is already pending.'); room.drawOffer = color;
    } else if (action === 'accept-draw') {
      if (!room.drawOffer || room.drawOffer === color) fail('No opponent draw offer to accept.');
      this.finish(room, { winner: null, reason: 'draw agreement' });
    } else if (action === 'decline-draw') {
      if (!room.drawOffer || room.drawOffer === color) fail('No opponent draw offer to decline.'); room.drawOffer = null;
    } else fail('Unknown game action.', 400);
    ++room.version; room.touched = this.now(); this.persist(); this.notify(id); return this.view(id);
  }
  leave(id) {
    const session = this.sessions.get(id), room = this.rooms.get(session.room);
    if (room?.status === 'playing') fail('Resign before leaving a game in progress.');
    if (room?.status === 'waiting') { this.rooms.delete(room.code); this.games.delete(room.code); }
    session.room = null; this.queue.delete(id); session.touched = this.now();
    this.persist(); this.emit(id); return this.view(id);
  }
  sweep() {
    const now = this.now();
    for (const [code, room] of this.rooms) {
      const expired = now - room.touched > (room.status === 'waiting' ? 1800000 : room.status === 'finished' ? DAY : 7 * DAY);
      if (expired) {
        this.rooms.delete(code); this.games.delete(code);
        for (const id of Object.values(room.players)) if (id && this.sessions.has(id)) { this.sessions.get(id).room = null; this.emit(id); }
      }
    }
    for (const [id, session] of this.sessions) {
      if (!session.room && !this.connected(id) && now - session.touched > 7 * DAY) this.sessions.delete(id);
    }
    for (const [id, entry] of this.queue) if (!this.connected(id) || now - entry.since > 1800000) { this.queue.delete(id); this.emit(id); }
  }
}
module.exports = { Rooms };

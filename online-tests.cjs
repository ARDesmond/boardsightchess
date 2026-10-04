'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Rooms } = require('./rooms.cjs');
function setup() {
  let now = 1000000, saved;
  const rooms = new Rooms({ now: () => now, save: value => saved = JSON.parse(JSON.stringify(value)) });
  const player = () => { const token = rooms.createSession(); const { id } = rooms.session(token); rooms.connect(id); return { token, id }; };
  return { rooms, a: player(), b: player(), c: player(), snapshot: () => saved, advance: ms => now += ms };
}
function match(context, sight = true) {
  const { rooms, a, b } = context;
  const created = rooms.newRoom(a.id, { name: 'Alice', color: 'w', sight });
  rooms.join(b.id, { name: 'Bob', code: created.room.code.toLowerCase() });
  return created.room.code;
}
function move(context, player, uci) { return context.rooms.move(player.id, { move: uci, version: context.rooms.view(player.id).room.version }); }
test('guest tokens are private and invalid tokens cannot obtain seats', () => {
  const context = setup(); match(context);
  assert.throws(() => context.rooms.session('not-a-token'), /expired/);
  assert.throws(() => context.rooms.session('a'.repeat(64)), /expired/);
  const text = JSON.stringify(context.rooms.view(context.a.id));
  assert.ok(!text.includes(context.a.token)); assert.ok(!text.includes(context.a.id));
  assert.ok(!JSON.stringify(context.snapshot()).includes(context.a.token));
});
test('private room colors, settings, normalization, full room and membership', () => {
  const context = setup(); const code = match(context, false), { rooms, a, b, c } = context;
  assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(rooms.view(a.id).room.yourColor, 'w'); assert.equal(rooms.view(b.id).room.yourColor, 'b');
  assert.equal(rooms.view(a.id).room.sight, false);
  assert.throws(() => rooms.join(c.id, { code }), /full/);
  assert.throws(() => rooms.move(c.id, { move: 'e2e4', version: 2 }), /Join/);
  assert.throws(() => rooms.newRoom(a.id), /current room/);
});
test('server rejects illegal, out-of-turn, stale and duplicate moves', () => {
  const context = setup(); match(context); const { rooms, a, b } = context;
  assert.throws(() => move(context, b, 'e7e5'), /turn/);
  assert.throws(() => move(context, a, 'e2e5'), /not legal/);
  assert.throws(() => move(context, a, '<script>'), /Invalid/);
  const version = rooms.view(a.id).room.version;
  move(context, a, 'e2e4');
  assert.throws(() => rooms.move(a.id, { move: 'e2e4', version }), /board changed/);
  assert.throws(() => rooms.move(b.id, { move: 'e7e5', version }), /board changed/);
  move(context, b, 'e7e5');
  assert.equal(rooms.view(a.id).room.fen, rooms.view(b.id).room.fen);
  assert.deepEqual(rooms.view(a.id).room.moves, ['e2e4', 'e7e5']);
});
test('checkmate ends the game and further moves are rejected', () => {
  const context = setup(); match(context);
  move(context, context.a, 'f2f3'); move(context, context.b, 'e7e5'); move(context, context.a, 'g2g4'); move(context, context.b, 'd8h4');
  const state = context.rooms.view(context.a.id).room;
  assert.equal(state.status, 'finished'); assert.deepEqual(state.result, { winner: 'b', reason: 'checkmate' });
  assert.throws(() => move(context, context.a, 'g4g5'), /not in progress/);
});
test('threefold repetition is authoritative', () => {
  const context = setup(); match(context);
  for (let i = 0; i < 2; ++i) {
    move(context, context.a, 'g1f3'); move(context, context.b, 'g8f6'); move(context, context.a, 'f3g1'); move(context, context.b, 'f6g8');
  }
  assert.deepEqual(context.rooms.view(context.a.id).room.result, { winner: null, reason: 'threefold repetition' });
});
test('draw offers pause both players until declined or accepted and cannot be self-accepted', () => {
  const context = setup(); match(context); const { rooms, a, b } = context;
  const action = (player, action) => rooms.action(player.id, { action, version: rooms.view(player.id).room.version });
  action(a, 'offer-draw'); assert.throws(() => action(a, 'accept-draw'), /No opponent/);
  const offered = rooms.view(a.id).room;
  assert.throws(() => move(context, a, 'e2e4'), /paused/);
  assert.throws(() => move(context, b, 'e7e5'), /paused/);
  assert.deepEqual(rooms.view(a.id).room.moves, []);
  assert.equal(rooms.view(a.id).room.version, offered.version);
  action(b, 'decline-draw'); assert.equal(rooms.view(a.id).room.drawOffer, null);
  move(context, a, 'e2e4');
  action(b, 'offer-draw'); assert.throws(() => move(context, b, 'e7e5'), /paused/);
  action(a, 'decline-draw'); move(context, b, 'e7e5');
  action(a, 'offer-draw'); action(b, 'accept-draw');
  assert.equal(rooms.view(a.id).room.result.reason, 'draw agreement');
});
test('leaving requires resignation and completed rooms remain available to opponent', () => {
  const context = setup(); match(context); const { rooms, a, b } = context;
  assert.throws(() => rooms.leave(a.id), /Resign/);
  move(context, a, 'e2e4'); rooms.action(a.id, { action: 'resign', version: rooms.view(a.id).room.version });
  rooms.leave(a.id); assert.equal(rooms.view(a.id).room, null);
  assert.equal(rooms.view(b.id).room.result.winner, 'b'); assert.deepEqual(rooms.view(b.id).room.moves, ['e2e4']);
});
test('Quickplay pairs compatible humans, never self-matches, and supports cancel', () => {
  const context = setup(), { rooms, a, b, c } = context;
  assert.equal(rooms.quickplay(a.id, { sight: true }).queued, true);
  assert.equal(rooms.quickplay(a.id, { sight: true }).room, null);
  assert.equal(rooms.quickplay(b.id, { sight: false }).queued, true);
  const paired = rooms.quickplay(c.id, { sight: true });
  assert.equal(paired.room.kind, 'quickplay'); assert.equal(paired.room.code, rooms.view(a.id).room.code);
  assert.equal(rooms.view(b.id).queued, true); rooms.cancel(b.id); assert.equal(rooms.view(b.id).queued, false);
});
test('disconnect removes a search and reconnect retains seat and move history', () => {
  const context = setup(), { rooms, a, b } = context;
  rooms.quickplay(a.id); rooms.disconnect(a.id); assert.equal(rooms.view(a.id).queued, false);
  rooms.connect(a.id); match(context); move(context, a, 'e2e4');
  rooms.disconnect(b.id); assert.equal(rooms.view(a.id).room.opponentConnected, false);
  rooms.connect(b.id); assert.equal(rooms.view(a.id).room.opponentConnected, true);
  assert.deepEqual(rooms.view(b.id).room.moves, ['e2e4']);
});
test('atomic snapshot can restore guest membership, board and repetition history after restart', () => {
  const context = setup(); match(context); move(context, context.a, 'e2e4'); move(context, context.b, 'e7e5');
  const restored = new Rooms({ snapshot: context.snapshot(), now: () => 1000000 });
  const id = restored.session(context.a.token).id;
  assert.equal(restored.view(id).room.fen, context.rooms.view(id).room.fen);
  assert.equal(restored.view(id).room.yourColor, 'w'); assert.equal(restored.view(id).room.opponentConnected, false);
});
test('waiting rooms expire, completed games expire, and active games survive short disconnects', () => {
  const context = setup(); const { rooms, a, b } = context;
  rooms.newRoom(a.id); context.advance(1800001); rooms.sweep(); assert.equal(rooms.view(a.id).room, null);
  match(context); context.advance(3600000); rooms.sweep(); assert.equal(rooms.view(b.id).room.status, 'playing');
  rooms.action(a.id, { action: 'resign', version: rooms.view(a.id).room.version });
  context.advance(86400001); rooms.sweep(); assert.equal(rooms.view(b.id).room, null);
});
test('castling and promotion must match legal moves exactly', () => {
  const context = setup(); match(context);
  for (const [side, uci] of [['a','e2e4'],['b','e7e5'],['a','g1f3'],['b','b8c6'],['a','f1c4'],['b','g8f6'],['a','e1g1']]) move(context, context[side], uci);
  assert.match(context.rooms.view(context.a.id).room.fen.split(' ')[0], /RNBQ1RK1/);
  assert.throws(() => move(context, context.b, 'a7a6q'), /not legal/);
});

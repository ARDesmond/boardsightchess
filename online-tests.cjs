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
  assert.equal(rooms.view(a.id).room.notice.text, 'Black denied the draw');
  assert.throws(() => move(context, a, 'e2e4'), /resumes/); context.advance(2000);
  move(context, a, 'e2e4');
  action(b, 'offer-draw'); assert.throws(() => move(context, b, 'e7e5'), /paused/);
  action(a, 'decline-draw'); context.advance(2000); move(context, b, 'e7e5');
  action(a, 'offer-draw'); action(b, 'accept-draw');
  assert.equal(rooms.view(a.id).room.result.reason, 'draw agreement');
});
test('leaving closes rooms and completed results remain available to opponent', () => {
  const context = setup(); match(context); const { rooms, a, b } = context;
  move(context, a, 'e2e4'); rooms.action(a.id, { action: 'resign', version: rooms.view(a.id).room.version });
  rooms.leave(a.id); assert.equal(rooms.view(a.id).room, null);
  assert.equal(rooms.view(b.id).room.closed, true); assert.equal(rooms.view(b.id).room.result.winner, 'b'); assert.deepEqual(rooms.view(b.id).room.moves, ['e2e4']);
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
  match(context); context.advance(20000); rooms.sweep(); assert.equal(rooms.view(b.id).room.status, 'playing');
  rooms.action(a.id, { action: 'resign', version: rooms.view(a.id).room.version });
  context.advance(86400001); rooms.sweep(); assert.equal(rooms.view(b.id).room, null);
});
test('castling and promotion must match legal moves exactly', () => {
  const context = setup(); match(context);
  for (const [side, uci] of [['a','e2e4'],['b','e7e5'],['a','g1f3'],['b','b8c6'],['a','f1c4'],['b','g8f6'],['a','e1g1']]) move(context, context[side], uci);
  assert.match(context.rooms.view(context.a.id).room.fen.split(' ')[0], /RNBQ1RK1/);
  assert.throws(() => move(context, context.b, 'a7a6q'), /not legal/);
});
test('rematch requires mutual consent, swaps seats and resets game with increasing versions', () => {
  const c = setup(), code = match(c, false), { rooms, a, b } = c;
  const rematch = (player, action, version = rooms.view(player.id).room.version) => rooms.rematch(player.id, { action, version });
  assert.throws(() => rematch(a, 'offer'), /Finish/);
  move(c, a, 'e2e4');
  rooms.action(b.id, { action: 'resign', version: rooms.view(b.id).room.version });
  const endVersion = rooms.view(a.id).room.version;
  rematch(a, 'offer');
  assert.throws(() => rematch(a, 'accept'), /opponent/);
  assert.throws(() => rematch(b, 'accept', endVersion), /changed/);
  rematch(b, 'decline'); assert.equal(rooms.view(a.id).room.rematchOffer, null);
  rematch(b, 'offer'); rematch(b, 'cancel');
  rematch(a, 'offer');
  const restored = new Rooms({ snapshot: c.snapshot(), now: () => 1000000 });
  assert.equal(restored.view(b.id).room.rematchOffer, 'w');
  rematch(b, 'accept');
  const fresh = rooms.view(a.id).room;
  assert.equal(fresh.code, code); assert.equal(fresh.sight, false); assert.equal(fresh.round, 2);
  assert.equal(fresh.yourColor, 'b'); assert.equal(fresh.white, 'Bob'); assert.equal(fresh.black, 'Alice');
  assert.equal(fresh.status, 'playing'); assert.equal(fresh.result, null); assert.deepEqual(fresh.moves, []);
  assert.ok(fresh.version > endVersion); assert.equal(rooms.game(rooms.rooms.get(code)).history().length, 0);
  assert.throws(() => rematch(b, 'accept'), /Finish/);
  assert.throws(() => move(c, a, 'e7e5'), /turn/);
  move(c, b, 'e2e4'); move(c, a, 'e7e5');
});
test('leaving or joining another room invalidates rematch eligibility and pending requests', () => {
  for (const leaveBy of ['leave', 'newRoom']) {
    const c = setup(); match(c); const { rooms, a, b } = c;
    rooms.action(a.id, { action: 'resign', version: rooms.view(a.id).room.version });
    rooms.rematch(a.id, { action: 'offer', version: rooms.view(a.id).room.version });
    rooms[leaveBy](b.id, { name: 'Bob' });
    assert.equal(rooms.view(a.id).room.rematchOffer, null);
    assert.equal(rooms.view(a.id).room.opponentAvailable, false);
    assert.throws(() => rooms.rematch(a.id, { action: 'offer', version: rooms.view(a.id).room.version }), /left/);
  }
});


test('untimed activity resets only for thinking player and expires authoritatively after sixty seconds', () => {
  const c=setup(); match(c); const {rooms,a,b}=c;
  const action=(p,value)=>rooms.action(p.id,{action:value,version:rooms.view(p.id).room.version});
  c.advance(30000); rooms.tick(); assert.equal(rooms.view(a.id).room.status,'playing');
  assert.equal(rooms.view(a.id).room.idleDeadline-rooms.view(a.id).serverTime,30000);
  assert.throws(()=>action(b,'keep-playing'),/thinking/);
  action(a,'keep-playing'); c.advance(59999); rooms.tick(); assert.equal(rooms.view(a.id).room.status,'playing');
  c.advance(1); assert.throws(()=>move(c,a,'e2e4'),/not in progress/);
  assert.deepEqual(rooms.view(a.id).room.result,{winner:'b',reason:'inactivity surrender'});
  rooms.tick(); assert.equal(rooms.view(a.id).room.idleDeadline,null);
});
test('moves and rematches reset inactivity; draw decisions pause it and decline resumes after two seconds', () => {
  const c=setup(); match(c); const {rooms,a,b}=c;
  const action=(p,value)=>rooms.action(p.id,{action:value,version:rooms.view(p.id).room.version});
  c.advance(45000); move(c,a,'e2e4'); assert.equal(rooms.view(a.id).room.idleDeadline-rooms.view(a.id).serverTime,60000);
  action(a,'offer-draw'); c.advance(120000); rooms.tick(); assert.equal(rooms.view(a.id).room.status,'playing');
  action(b,'decline-draw'); assert.equal(rooms.view(a.id).room.notice.text,'Black denied the draw');
  c.advance(1999); assert.throws(()=>move(c,b,'e7e5'),/resumes/);
  c.advance(1); move(c,b,'e7e5'); assert.equal(rooms.view(a.id).room.notice,null);
  action(a,'resign'); rooms.rematch(a.id,{action:'offer',version:rooms.view(a.id).room.version});
  rooms.rematch(b.id,{action:'accept',version:rooms.view(b.id).room.version});
  assert.equal(rooms.view(a.id).room.idleDeadline-rooms.view(a.id).serverTime,60000);
});
test('leaving active game closes room, awards remaining player and prevents rematches and joins', () => {
  const c=setup(); const code=match(c); const {rooms,a,b}=c;
  rooms.leave(a.id); const room=rooms.view(b.id).room;
  assert.equal(room.closed,true); assert.deepEqual(room.result,{winner:'b',reason:'opponent left'});
  assert.throws(()=>rooms.rematch(b.id,{action:'offer',version:room.version}),/left/);
  assert.throws(()=>rooms.join(c.c.id,{code}),/full/);
});

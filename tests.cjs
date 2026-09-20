const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const ctx=vm.createContext({console});vm.runInContext(fs.readFileSync('chess.js','utf8')+fs.readFileSync('openings.js','utf8')+fs.readFileSync('engine.js','utf8')+';globalThis.api={Chess,OPENINGS,repertoireMoves,selectCandidate,openingContinuations};',ctx);
const {Chess,OPENINGS,repertoireMoves,selectCandidate,openingContinuations}=ctx.api;
assert.equal(openingContinuations([]).length,12);
assert.equal(openingContinuations(['d2d4','d7d5','c2c4']).length,4);
assert.equal(openingContinuations(['a2a3']).length,0);
for(const line of openingContinuations([]))for(let i=0;i<=line.moves.length;i++)assert(openingContinuations(line.moves.slice(0,i)).some(candidate=>candidate.key===line.key));
const captureHistory=new Chess();for(const move of ['e2e4','d7d5','e4d5'])captureHistory.move(move);
assert.equal(captureHistory.history({verbose:true}).filter(move=>move.color==='w'&&move.captured).length,1);
captureHistory.undo();assert.equal(captureHistory.history({verbose:true}).filter(move=>move.captured).length,0);
function perft(g,d){if(!d)return 1;let n=0;for(const m of g.moves({verbose:true})){const r=g._makeMove(m,false);n+=perft(g,d-1);g._restoreRecord(r);}return n;}
assert.equal(perft(new Chess(),3),8902);
const castle=new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');castle.move('e1g1');assert.equal(castle.get('f1').type,'r');castle.undo();assert.equal(castle.get('h1').type,'r');
const ep=new Chess('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');ep.move('e5d6');assert.equal(ep.get('d5'),null);
for(const p of ['q','r','b','n']){const g=new Chess('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');g.move('a7a8'+p);assert.equal(g.get('a8').type,p);}
const mate=new Chess();for(const m of ['f2f3','e7e5','g2g4','d8h4'])mate.move(m);assert(mate.isCheckmate());
const g=new Chess(),before=g.fen();for(const f of ['bad','8/8/8/8/8/8/8/7x w - - 0 1','8/8/8/8/8/8/8/8 z - - 0 1']){assert.throws(()=>g.load(f));assert.equal(g.fen(),before);}
for(const o of OPENINGS)for(const line of o.lines){const b=new Chess();for(const move of line.moves)b.move(move);}
assert.equal(repertoireMoves(OPENINGS.find(o=>o.id==='queens'),'family',['d2d4','d7d5','c2c4']).length,4);
const candidates=[0,-40,-100,-200,-400,-900].map((score,i)=>({score,move:String(i)}));
let previous=Infinity;
for(const rating of [200,400,600,800,1000,1200]){let loss=0;for(let i=0;i<10000;i++)loss-=candidates[Number(selectCandidate(candidates,rating,()=>i/10000))].score;loss/=10000;assert(loss<previous);previous=loss;console.log('Rating',rating,'mean candidate loss',loss.toFixed(1));}
console.log('PASS: perft 8902; castling/undo; en passant; four promotions; mate; atomic FEN rejection; every repertoire line; four family branches; weakening progression.');
// Additional board-control and special-position checks.
assert.equal(perft(new Chess('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1'),2),2039);
const repetition=new Chess();for(let i=0;i<2;i++)for(const m of ['g1f3','g8f6','f3g1','f6g8'])repetition.move(m);assert(repetition.isThreefoldRepetition());
assert(new Chess('7k/5K2/6Q1/8/8/8/8/8 b - - 0 1').isStalemate());
assert(new Chess('7k/8/8/8/8/8/8/K7 w - - 0 1').isInsufficientMaterial());
const app=fs.readFileSync('app.js','utf8');
const attackContext=vm.createContext({game:new Chess(),FILES:['a','b','c','d','e','f','g','h'],RANKS:['1','2','3','4','5','6','7','8']});
vm.runInContext(app.slice(app.indexOf('function colorName('),app.indexOf('function overlayColor('))+';globalThis.map=generateAttackMap();',attackContext);
assert.equal(attackContext.map.e3.filter(a=>a.color==='w').length,2);assert.equal(attackContext.map.e4.length,0);assert(attackContext.map.f3.some(a=>a.from==='g1'));
console.log('PASS: Kiwipete perft 2039, repetition, stalemate, material draw, pawn/knight control.');

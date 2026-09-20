const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),{spawn}=require('child_process');
class Worker {
  constructor(){this.process=spawn(process.execPath,['vendor/stockfish/stockfish.js']);let buffer='';this.process.stdout.on('data',b=>{buffer+=b;let i;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i).trim();buffer=buffer.slice(i+1);this.onmessage?.({data:line});}});this.process.on('error',e=>this.onerror?.(e));}
  postMessage(s){this.process.stdin.write(s+'\n');}
  terminate(){this.process.kill();}
}
const context=vm.createContext({Worker,setTimeout,clearTimeout,console});vm.runInContext(fs.readFileSync('chess.js','utf8')+fs.readFileSync('engine.js','utf8')+';globalThis.api={Chess,StockfishOpponent,StockfishAnalysis,BOT_LEVELS};',context);
const {Chess,StockfishOpponent,StockfishAnalysis,BOT_LEVELS}=context.api;
(async()=>{
 const opponent=new StockfishOpponent(),g=new Chess();g.move('e2e4');
 const legal=g.moves({verbose:true}).map(m=>m.from+m.to+(m.promotion||''));
 for(const rating of BOT_LEVELS){const m=await opponent.choose(g.fen(),rating,legal);assert(legal.includes(m));console.log(rating,m);}
 const cancelled=opponent.choose(g.fen(),200,legal).then(()=>assert.fail('Cancellation resolved'),e=>assert.equal(e.message,'cancelled'));opponent.cancel();await cancelled;
 const next=await opponent.choose(g.fen(),2200,legal);assert(legal.includes(next));opponent.cancel();
 console.log('PASS: real WASM engine, all 11 levels, legal replies, cancellation and subsequent request.');
 const analysis=new StockfishAnalysis();
 for(const turn of ['w','b']){const score=await analysis.analyze('7k/8/8/8/8/8/3Q4/4K3 '+turn+' - - 0 1');assert(score.kind==='mate'||score.value>300);assert(score.value>0);}
 const interrupted=analysis.analyze(g.fen()).then(()=>assert.fail('Analysis cancellation resolved'),e=>assert.equal(e.message,'cancelled'));analysis.cancel();await interrupted;
 assert((await analysis.analyze(g.fen())).kind);analysis.cancel();
 console.log('PASS: analysis White perspective for either turn, cancellation and restart.');
})().catch(e=>{console.error(e);process.exitCode=1;});


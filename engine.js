'use strict';
const BOT_LEVELS = [200,400,600,800,1000,1200,1400,1600,1800,2000,2200];
// Weight every evaluated candidate, avoiding periodic random-legal blunders.
function selectCandidate(candidates, rating, random=Math.random) {
  const sorted=candidates.slice().sort((a,b)=>b.score-a.score);
  if(!sorted.length) return null;
  const weakness=Math.max(0,Math.min(1,(1400-rating)/1200));
  const temperature=18+weakness*210;
  const ceiling=60+weakness*440;
  const eligible=sorted.filter(c=>sorted[0].score-c.score<=ceiling);
  const weights=eligible.map(c=>Math.exp((c.score-sorted[0].score)/temperature));
  let draw=random()*weights.reduce((a,b)=>a+b,0);
  return (eligible.find((c,i)=>(draw-=weights[i])<=0)||eligible[0]).move;
}
class StockfishOpponent {
  constructor(){this.worker=null;this.pending=null;this.serial=0;}
  cancel(){
    ++this.serial;
    if(this.pending){this.pending.reject(new Error('cancelled'));this.pending=null;}
    if(this.worker){this.worker.terminate();this.worker=null;}
  }
  async choose(fen,rating,legalMoves){
    this.cancel(); const id=this.serial;
    return new Promise((resolve,reject)=>{
      const worker=new Worker('vendor/stockfish/stockfish.js'); this.worker=worker;
      const iterations=new Map(); let minElo=1320; let finished=false;
      const candidateCount=Math.min(64,legalMoves.length);
      const timer=setTimeout(()=>done(null,new Error('Engine timed out. Retry the computer move.')),20000);
      const done=(move,error)=>{
        if(finished) return; finished=true; clearTimeout(timer);
        worker.terminate(); if(this.worker===worker)this.worker=null;
        if(this.pending?.id===id)this.pending=null;
        error?reject(error):resolve(move);
      };
      this.pending={id,reject:error=>done(null,error)};
      worker.onerror=()=>done(null,new Error('Stockfish could not load. Serve this folder over HTTP and retry.'));
      worker.onmessage=({data})=>{
        if(id!==this.serial)return;
        const line=String(data);
        const minimum=line.match(/option name UCI_Elo .* min (\d+)/); if(minimum)minElo=Number(minimum[1]);
        if(line==='uciok'){
          const native=rating>=minElo;
          worker.postMessage('setoption name Hash value 16');
          worker.postMessage('setoption name UCI_LimitStrength value '+native);
          if(native)worker.postMessage('setoption name UCI_Elo value '+rating);
          worker.postMessage('setoption name MultiPV value '+(native?1:candidateCount));
          worker.postMessage('isready');
        }
        if(line==='readyok'){
          worker.postMessage('position fen '+fen);
          worker.postMessage('go movetime '+(rating>=minElo?850:650));
        }
        const pv=line.match(/info depth (\d+).*?score (cp|mate) (-?\d+).*? pv ([a-h][1-8][a-h][1-8][qrbn]?)/);
        if(pv && !/bound/.test(line)){
          const move=pv[4],depth=Number(pv[1]),raw=Number(pv[3]);
          const score=pv[2]==='cp'?raw:Math.sign(raw)*(100000-Math.abs(raw));
          if(!iterations.has(depth))iterations.set(depth,new Map());
          iterations.get(depth).set(move,{move,score,depth});
        }
        if(line.startsWith('bestmove ')){
          let move=line.split(' ')[1];
          if(rating<minElo){
            // Never favor only the first, strongest PVs of an unfinished iteration.
            const depths=[...iterations.keys()].sort((a,b)=>b-a);
            const complete=depths.find(d=>iterations.get(d).size>=candidateCount);
            const depth=complete??depths.reduce((best,d)=>iterations.get(d).size>(iterations.get(best)?.size||0)?d:best,depths[0]);
            const evaluated=[...(iterations.get(depth)?.values()||[])].filter(c=>legalMoves.includes(c.move));
            move=selectCandidate(evaluated,rating)||move;
          }
          if(!legalMoves.includes(move))return done(null,new Error('Engine returned an invalid move. Retry.'));
          done(move);
        }
      };
      worker.postMessage('uci');
    });
  }
}

// Analysis has its own cancellable worker; the UI pauses it during bot searches.
class StockfishAnalysis extends StockfishOpponent {
  analyze(fen) {
    this.cancel();
    return new Promise((resolve,reject)=>{
      const worker=new Worker('vendor/stockfish/stockfish.js');this.worker=worker;
      let score=null,finished=false;
      const done=(error)=>{if(finished)return;finished=true;clearTimeout(timer);worker.terminate();this.worker=null;this.pending=null;error?reject(error):resolve(score);};
      const timer=setTimeout(()=>done(new Error('Analysis timed out')),20000);
      this.pending={reject:done};
      worker.onerror=()=>done(new Error('Analysis unavailable'));
      worker.onmessage=({data})=>{
        const line=String(data);
        if(line==='uciok'){worker.postMessage('setoption name Hash value 16');worker.postMessage('isready');}
        if(line==='readyok'){worker.postMessage('position fen '+fen);worker.postMessage('go movetime 700');}
        const match=line.match(/score (cp|mate) (-?\d+)/);
        if(match&&!/bound/.test(line))score={kind:match[1],value:Number(match[2])*(fen.split(' ')[1]==='w'?1:-1)};
        if(line.startsWith('bestmove '))done(score?null:new Error('No evaluation available'));
      };
      worker.postMessage('uci');
    });
  }
}

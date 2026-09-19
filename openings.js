'use strict';
// Coordinate moves are data, never screen coordinates. Shared prefixes form a
// repertoire tree at runtime, with all compatible continuations accepted.
const OPENINGS = [
  {id:'ruy', name:'Ruy Lopez', lines:[
    {name:'Morphy Defense', moves:'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1 f8e7'},
    {name:'Berlin Defense', moves:'e2e4 e7e5 g1f3 b8c6 f1b5 g8f6 e1g1 f6e4 d2d4 e4d6'}]},
  {id:'italian', name:'Italian Game', lines:[
    {name:'Giuoco Piano', moves:'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3 g8f6 d2d3 d7d6'},
    {name:'Two Knights', moves:'e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 d2d3 f8c5'}]},
  {id:'scotch', name:'Scotch Game', lines:[{name:'Classical', moves:'e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 f3d4 f8c5 c1e3 d8f6'}]},
  {id:'queens', name:"Queen’s Gambit", lines:[
    {name:'Declined', moves:'d2d4 d7d5 c2c4 e7e6 b1c3 g8f6 c1g5 f8e7 e2e3 e8g8'},
    {name:'Accepted', moves:'d2d4 d7d5 c2c4 d5c4 g1f3 g8f6 e2e3 e7e6 f1c4 c7c5'},
    {name:'Slav Defense', moves:'d2d4 d7d5 c2c4 c7c6 g1f3 g8f6 b1c3 d5c4 a2a4 c8f5'},
    {name:'Chigorin Defense', moves:'d2d4 d7d5 c2c4 b8c6 g1f3 c8g4 c4d5 g4f3'}]},
  {id:'kings', name:'King’s Gambit', lines:[{name:'Accepted', moves:'e2e4 e7e5 f2f4 e5f4 g1f3 g7g5 f1c4 f8g7'}]},
  {id:'london', name:'London System', lines:[{name:'Classical setup', moves:'d2d4 d7d5 g1f3 g8f6 c1f4 e7e6 e2e3 f8d6 f1d3 e8g8'}]},
  {id:'english', name:'English Opening', lines:[{name:'Symmetrical', moves:'c2c4 c7c5 b1c3 b8c6 g1f3 g8f6 g2g3 g7g6 f1g2 f8g7'}]}
];
for (const opening of OPENINGS) for (const line of opening.lines) line.moves = line.moves.split(' ');
// Dedicated entries share the same source lines as the family.
for (const [id, name, index] of [['qgd','Queen’s Gambit Declined',0],['qga','Queen’s Gambit Accepted',1],['slav','Slav Defense',2]]) {
  OPENINGS.push({id, name, lines:[OPENINGS.find(o=>o.id==='queens').lines[index]]});
}
function repertoireMoves(opening, variation, history) {
  const lines = variation === 'family' ? opening.lines : [opening.lines[Number(variation)]];
  return [...new Set(lines.filter(line => history.every((move,i)=>line.moves[i]===move))
    .map(line=>line.moves[history.length]).filter(Boolean))];
}

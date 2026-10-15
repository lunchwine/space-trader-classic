const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const E=require('../src/engine.js');let checks=0;
function check(fn){fn();checks++;}
let s=E.newFixtureGame();E.trade(s,'WATER',10,'buy');E.beginTravel(s,1);
check(()=>assert.ok(s.encounter));
let restored=E.deserialize(E.serialize(s));
for(let i=0;i<100&&s.trip&&!s.ended;i++){
  if(s.pending){
    check(()=>assert.throws(()=>E.trade(s,'WATER',1,'sell'),/journey/));
    E.acknowledge(s);E.acknowledge(restored);
  }else{E.combat(s,'flee');E.combat(restored,'flee');}
  check(()=>assert.deepEqual(restored,s));
}
check(()=>assert.equal(s.pending.kind,'arrival'));
check(()=>assert.equal(s.current,1));check(()=>assert.equal(s.days,1));
check(()=>assert.equal(s.ship.fuel,5));check(()=>assert.equal(s.ship.cargo.WATER,10));
check(()=>assert.throws(()=>E.service(s,'fuel'),/journey/));
const arrivalRng=s.rng;E.acknowledge(s);check(()=>assert.equal(s.rng,arrivalRng));
E.trade(s,'WATER',10,'sell');E.service(s,'fuel');
check(()=>assert.equal(s.ship.cargo.WATER,0));check(()=>assert.equal(s.ship.fuel,14));
check(()=>assert.throws(()=>E.trade(s,'WATER',-2,'buy')));
check(()=>assert.throws(()=>E.deserialize('{"version":3}')));
check(()=>assert.throws(()=>E.beginTravel(s,7),/fuel/));
const legacy=E.newFixtureGame();delete legacy.pending;check(()=>assert.deepEqual(E.deserialize(E.serialize(legacy)),legacy));
check(()=>assert.throws(()=>E.deserialize(JSON.stringify({...legacy,pending:{kind:'arrival',target:7}})),/checkpoint/));
let actions=0,arrivals=0,encounters=0,results=0,deaths=0;
for(let seed=0;seed<60;seed++){
  s=E.newFixtureGame(seed,seed%5);
  for(let step=0;step<160&&!s.ended;step++){
    if(s.pending){s.pending.kind==='arrival'?arrivals++:results++;E.acknowledge(s);}
    else if(s.encounter){encounters++;E.combat(s,step%4===0?'attack':'flee');}
    else{
      for(const g of E.data.goods)if(s.ship.cargo[g.id]&&s.prices.sell[g.id])E.trade(s,g.id,999,'sell');
      E.service(s,'fuel');E.service(s,'repair');
      const destinations=s.systems.filter(x=>x.id!==s.current&&E.distance(x,s.systems[s.current])<=s.ship.fuel);
      if(!destinations.length)break;
      E.beginTravel(s,destinations[step%destinations.length].id);
    }
    actions++;
    check(()=>assert.deepEqual(E.deserialize(E.serialize(s)),s));
    check(()=>assert.ok(s.credits>=0&&s.ship.fuel>=0&&s.ship.hull>=0&&E.filled(s.ship)<=15));
    if(s.pending?.kind==='result')check(()=>assert.equal(s.encounter,null));
    if(s.ended){deaths++;check(()=>assert.equal(s.pending.title,'Journey over'));}
  }
}
const result={checks,actions,arrivals,encounterActions:encounters,resultAcknowledgements:results,deaths,failures:0};
fs.writeFileSync(path.join(__dirname,'out/integration-summary.json'),JSON.stringify(result,null,2)+'\n');console.log(result);

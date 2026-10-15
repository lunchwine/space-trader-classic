const E=require('../src/engine'),assert=require('node:assert/strict'),fs=require('node:fs');
let worlds=0,routes=0,jumps=0,encounters=0,checkpoints=0,missions=0,wormholes=0;const types=new Set();
const reload=s=>{const a=E.deserialize(E.serialize(s));assert.deepEqual(a,s);checkpoints++;return a;};
function jump(s,id){const before=E.copy(s),cost=E.travelCost(s,id);E.beginTravel(s,id);assert.equal(s.days,before.days+1);assert.equal(s.ship.fuel,before.ship.fuel-cost.fuel);assert.equal(s.credits,before.credits-cost.fee);if(cost.fee)wormholes++;jumps++;
 let guard=0;
 while(s.trip&&!s.ended){assert.ok(guard++<500);s=reload(s);if(s.encounter){if((s.encounter.kind||'PIRATE')==='PIRATE')types.add(s.encounter.opponent.type);encounters++;const direct=E.copy(s);const action=s.encounter.kind==='POLICE'&&s.encounter.state==='INSPECTION'?'submit':['IGNORE','FLEE','SURRENDER','BUY','SELL'].includes(s.encounter.state)?'continue':'flee';E.combat(direct,action);E.combat(s,action);assert.deepEqual(s,direct);}else{assert.equal(s.pending.kind,'result');const direct=E.copy(s);E.acknowledge(direct);E.acknowledge(s);assert.deepEqual(s,direct);}}
 assert.equal(s.ended,false);assert.equal(s.current,id);assert.equal(s.pending.kind,'arrival');s=reload(s);E.acknowledge(s);assert.equal(s.trip,null);return s;
}
for(let seed=0;seed<30;seed++){
 let s=E.newGame(seed,0,{randomQuestSystems:seed%2===1});worlds++;assert.equal(s.systems.length,120);assert.equal(new Set(s.wormholes).size,6);s=reload(s);
 for(const sys of s.systems){const route=E.routeTo(s,sys.id);assert.ok(route!==null,`${seed}: ${sys.name}`);let a=s.current;for(const b of route){assert.ok(E.distance(s.systems[a],s.systems[b])<=14||E.wormholeExists(s,a,b));a=b;}assert.equal(a,sys.id);routes++;}
 const q=E.japoriQuest(s);for(const target of [q.origin,q.target]){
  const route=E.routeTo(s,target);for(const id of route){E.service(s,'fuel');assert.equal(s.ship.fuel,14);s=jump(s,id);}
  assert.equal(E.questAvailable(s),target===q.origin?'offer':'delivery');E.openQuest(s);s=reload(s);E.respondQuest(s,target===q.origin?'yes':'continue');s=reload(s);E.respondQuest(s,'continue');s=reload(s);
 }
 assert.equal(s.quests.japori.status,2);assert.equal(E.cargoCapacity(s),15);assert.equal(Object.values(s.quests.japori.reward).reduce((a,b)=>a+b,0),2);missions++;
}
// A wormhole is a directed edge: no fuel, original 25 * fuel-price fee.
for(let i=0;i<6;i++){let s=E.newGame(2000,0);s.current=s.wormholes[i];s.ship.fuel=0;s.prices=E.determinePrices(s.systems[s.current],6,0,new E.JavaRandom(9));const target=E.wormholeTarget(s);assert.notEqual(E.wormholeTarget(s,target),s.current);s=jump(s,target);assert.equal(s.arrivedViaWormhole,true);assert.equal(s.ship.fuel,0);}
let s=E.newGame(2000,2);s.current=s.wormholes[0];s.credits=49;const original=E.serialize(s);assert.throws(()=>E.beginTravel(s,E.wormholeTarget(s)),/credits/);assert.equal(E.serialize(s),original);
// Imported fixture saves preserve the original eight-system world and RNG.
for(const status of [0,1,2]){let old=E.newFixtureGame(2000);old.quests.japori.status=status;old.quests.japori.deliveryAvailable=status!==2;assert.deepEqual(E.deserialize(E.serialize(old)),old);}
for(const edit of [s=>s.wormholes[1]=s.wormholes[0],s=>s.quests.japori.target=119,s=>s.systems[1].qty.WATER=-1,s=>s.ship.fuel=-1]){const bad=E.newGame();edit(bad);assert.throws(()=>E.deserialize(E.serialize(bad)));}
const result={worlds,routes,jumps,encounters,savedCheckpoints:checkpoints,completedMissions:missions,wormholeJumps:wormholes,pirateShipTypes:[...types].sort(),failures:0};fs.writeFileSync(__dirname+'/out/generation-integration-summary.json',JSON.stringify(result,null,2)+'\n');console.log(result);

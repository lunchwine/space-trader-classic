const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const E=require('../src/engine.js');let checks=0;const check=f=>{f();checks++;};
let s=E.newFixtureGame();const before=E.serialize(s);E.openQuest(s);E.respondQuest(s,'no');check(()=>assert.equal(E.serialize(s),before));
E.trade(s,'WATER',6,'buy');E.openQuest(s);const nofit=E.serialize(s);
check(()=>assert.throws(()=>E.respondQuest(s,'yes'),/ten empty/));check(()=>assert.equal(E.serialize(s),nofit));
E.respondQuest(s,'no');E.trade(s,'WATER',1,'sell');E.openQuest(s);E.respondQuest(s,'yes');
check(()=>assert.equal(E.cargoCapacity(s),5));check(()=>assert.equal(s.ship.cargo.MEDICINE,0));
check(()=>assert.throws(()=>E.trade(s,'WATER',1,'buy'),/journey/));
E.respondQuest(s,'continue');check(()=>assert.throws(()=>E.trade(s,'WATER',1,'buy'),/bays/));
check(()=>assert.throws(()=>E.openQuest(s),/available/));
let blocked=E.newFixtureGame();blocked.policeScore=-6;check(()=>assert.equal(E.questAvailable(blocked),null));
check(()=>assert.throws(()=>E.openQuest(blocked),/available/));
// Original Android v1 experiment saves had no quests; initialize the new mission.
const legacy=E.newFixtureGame();delete legacy.quests;const upgraded=E.deserialize(E.serialize(legacy));
check(()=>assert.equal(upgraded.quests.japori.status,0));check(()=>assert.equal(upgraded.current,legacy.current));
check(()=>assert.equal(upgraded.rng,legacy.rng));
const invalid=E.newFixtureGame();invalid.quests.japori.status=1;invalid.ship.cargo.WATER=6;
check(()=>assert.throws(()=>E.deserialize(E.serialize(invalid)),/capacity/));
const badSkills=E.newFixtureGame();badSkills.ship.skills.trader=null;check(()=>assert.throws(()=>E.deserialize(E.serialize(badSkills)),/skills/));
let completed=0,stages=0,encounters=0;
for(let seed=0;seed<30;seed++){
 s=E.newFixtureGame(seed,seed%3);E.openQuest(s);E.respondQuest(s,'yes');
 let restored=E.deserialize(E.serialize(s));E.respondQuest(s,'continue');E.respondQuest(restored,'continue');
 for(const target of [1,2,3,7]){
  for(const state of [s,restored]){E.service(state,'fuel');E.service(state,'repair');E.beginTravel(state,target);}
  for(let step=0;step<500&&(s.trip||s.pending);step++){
   check(()=>assert.deepEqual(restored,s));check(()=>assert.deepEqual(E.deserialize(E.serialize(s)),s));
   check(()=>assert.equal(E.cargoCapacity(s),5));stages++;
   if(s.encounter){encounters++;E.combat(s,'flee');E.combat(restored,'flee');}
   else{E.acknowledge(s);E.acknowledge(restored);}
   check(()=>assert.equal(s.ended,false));
  }
  check(()=>assert.equal(s.current,target));check(()=>assert.equal(s.quests.japori.status,1));
 }
 check(()=>assert.equal(E.questAvailable(s),'delivery'));const credits=s.credits;
 E.openQuest(s);E.openQuest(restored);const rngBefore=s.rng;
 check(()=>assert.deepEqual(E.deserialize(E.serialize(s)),s));
 E.respondQuest(s,'continue');E.respondQuest(restored,'continue');
 check(()=>assert.deepEqual(restored,s));check(()=>assert.equal(s.credits,credits));check(()=>assert.notEqual(s.rng,rngBefore));
 check(()=>assert.equal(Object.values(s.quests.japori.reward).reduce((a,b)=>a+b),2));
 check(()=>assert.equal(E.cargoCapacity(s),15));check(()=>assert.equal(s.pending.step,'reward'));
 const after=E.serialize(s);restored=E.deserialize(after);check(()=>assert.deepEqual(restored,s));
 E.respondQuest(restored,'continue');check(()=>assert.throws(()=>E.openQuest(restored),/available/));
 check(()=>assert.equal(restored.rng,s.rng));E.respondQuest(s,'continue');
 check(()=>assert.equal(E.questAvailable(s),null));completed++;
}
const result={checks,completedMissions:completed,savedJourneyStages:stages,encounterActions:encounters,failures:0};
fs.writeFileSync(path.join(__dirname,'out/quest-integration-summary.json'),JSON.stringify(result,null,2)+'\n');console.log(result);

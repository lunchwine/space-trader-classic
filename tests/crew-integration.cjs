const E=require('../src/engine'),assert=require('node:assert/strict'),fs=require('node:fs');let checks=0,hires=0,departures=0;
const check=(a,b)=>{assert.deepEqual(a,b);checks++;},reload=s=>{const x=E.deserialize(E.serialize(s));check(x,s);return x;};
function fixture(seed=2000,type='GRASSHOPPER',difficulty=0){const s=E.newGame(seed,difficulty);s.ship=E.makeShip(type);s.credits=100000;s.autoFuel=s.autoRepair=true;s.current=s.mercenaries[1].system;s.prices=E.determinePrices(s.systems[s.current],E.effectiveSkill(s.ship,'trader',difficulty),0,new E.JavaRandom(123));return s;}
function manage(s,op,id){const before=E.copy(s);E.openCrew(s,op,id);s=reload(s);E.respondCrew(s,true);check(s.credits,before.credits);check(s.days,before.days);check(s.rng,before.rng);check(s.pending.step,'complete');s=reload(s);const after=E.copy(s);E.respondCrew(s,true);check(s.ship,after.ship);check(s.credits,after.credits);return s;}
function finish(s){let guard=0;while(s.trip){assert.ok(guard++<300);if(s.pending?.kind==='decision')E.respondEncounter(s,true);else if(s.encounter){const a=s.encounter.kind==='POLICE'&&s.encounter.state==='INSPECTION'?'submit':['IGNORE','FLEE','SURRENDER','BUY','SELL'].includes(s.encounter.state)?'continue':'flee';E.combat(s,a);}else E.acknowledge(s);assert.equal(s.ended,false);s=reload(s);}E.acknowledge(s);return s;}
for(let seed=2000;seed<2030;seed++){
 let s=fixture(seed);const original=E.serialize(s),m=E.forHire(s);check(m.id,1);E.openCrew(s,'hire',m.id);s=reload(s);E.respondCrew(s,false);check(E.serialize(s),original);
 const before=E.copy(s);s=manage(s,'hire',m.id);hires++;check(s.ship.hiredCrew,[m]);check(E.forHire(s),null);check(E.mercenaryMoney(s),Object.values(m.skills).reduce((a,b)=>a+b,0)*3);
 for(const k of Object.keys(s.ship.skills))check(E.effectiveSkill(s.ship,k,s.difficulty),Math.max(s.ship.skills[k],m.skills[k])+1);
 check(s.prices.sell,before.prices.sell);if(m.skills.trader<=5)check(s.prices,before.prices);
 const n=s.mercenaries[2];s.current=n.system;E.recalculateBuyPrices(s);s=manage(s,'hire',n.id);hires++;check(E.mercenaryMoney(s),E.hirePrice(s,m)+E.hirePrice(s,n));
 assert.throws(()=>E.openCrew(s,'hire',n.id),/not available/);checks++;s.current=s.mercenaries[3].system;assert.throws(()=>E.openCrew(s,'hire',3),/quarters/);checks++;
 const wage=E.mercenaryMoney(s),target=s.systems.find(t=>t.id!==s.current&&E.distance(t,s.systems[s.current])<=15&&!E.wormholeExists(s,s.current,t.id));s.credits=wage-1;const blocked=E.serialize(s);assert.throws(()=>E.beginTravel(s,target.id),/departure costs/);check(E.serialize(s),blocked);
 s.credits=100000;const cash=s.credits;E.beginTravel(s,target.id);check(s.credits,cash-wage-(s.pending?.services?.cost||0));departures++;s=reload(s);assert.throws(()=>E.openCrew(s,'dismiss',m.id),/journey/);checks++;s=finish(s);check(s.ship.hiredCrew.map(c=>c.id),[1,2]);check(s.log.filter(l=>l.text.startsWith('Paid ')).length,1);
 // Dismiss the first member, keep the second, then release all skills/wages.
 s=manage(s,'dismiss',m.id);check(s.ship.hiredCrew.map(c=>c.id),[2]);check(E.mercenaryMoney(s),E.hirePrice(s,n));s=manage(s,'dismiss',n.id);check(E.mercenaryMoney(s),0);for(const k of Object.keys(s.ship.skills))check(E.effectiveSkill(s.ship,k,0),6);
 s.current=m.system;check(E.forHire(s),m);s=manage(s,'hire',m.id);hires++;s.ship.skills.trader=10;check(E.effectiveSkill(reload(s).ship,'trader',0),11);
}
let s=fixture();s=manage(s,'hire',1);let wage=E.mercenaryMoney(s);E.setReserveMoney(s,true);s.credits=wage+100;check(E.availableMoney(s),100);s=reload(s);check(s.reserveMoney,true);E.setReserveMoney(s,false);check(E.availableMoney(s),wage+100);
// One-quarter ships cannot hire; no commander dismissal or remote recruiting.
for(const t of E.data.ships.slice(0,10).filter(t=>t.crewQuarters===1)){const x=fixture(2000,t.id);assert.throws(()=>E.openCrew(x,'hire',1),/quarters/);checks++;}
assert.throws(()=>E.openCrew(s,'dismiss',0),/not aboard/);checks++;assert.throws(()=>E.openCrew(s,'hire',2),/not available/);checks++;
// Trading preserves crew and wages, and refuses an insufficient-quarter ship.
s.systems[s.current].tech=7;s.credits=100000;assert.match(E.yardRules.quote(s,{type:'ship',id:'FIREFLY'}).reason,/quarters/);checks++;E.openPurchase(s,{type:'ship',id:'BUMBLEBEE'});E.respondPurchase(s,true);E.respondPurchase(s,true);check(s.ship.hiredCrew.length,1);check(E.mercenaryMoney(s),wage);s=reload(s);
// Crew skill dominates equipment discount and training without duplicated commander skills.
s=fixture();const m=s.mercenaries.slice(1,30).find(m=>m.skills.trader>=8);s.current=m.system;E.recalculateBuyPrices(s);const prices=E.copy(s.prices);s=manage(s,'hire',m.id);for(const g of E.data.goods)if(prices.buy[g.id])assert.ok(s.prices.buy[g.id]<=prices.buy[g.id]);checks++;s.ship.skills.trader=10;s=reload(s);check(E.effectiveSkill(s.ship,'trader',0),11);
// Commander training stays live while crew dominate the same skill.
s=fixture();s.current=s.mercenaries[1].system;s=manage(s,'hire',1);s.ship.skills.trader=8;E.recalculateBuyPrices(s);const dominated=E.copy(s.prices);E.increaseRandomSkill(s,{get:()=>2});check(s.ship.skills.trader,9);check(s.prices,dominated);s=reload(s);E.increaseRandomSkill(s,{get:()=>2});check(s.ship.skills.trader,10);check(E.effectiveSkill(s.ship,'trader',0),11);check(s.prices.sell,dominated.sell);
// A wormhole still pays one crew wage in addition to its ship-specific tax.
s=fixture();s=manage(s,'hire',1);s.current=s.wormholes[0];const wormholeCash=s.credits,wormholeWage=E.mercenaryMoney(s),wormholeFee=E.travelCost(s,E.wormholeTarget(s)).fee;E.warpCore(s,s.systems[s.current],s.systems[E.wormholeTarget(s)]);check(s.credits,wormholeCash-wormholeWage-wormholeFee);check(s.ship.fuel,15);check(s.days,1);s=reload(s);
// Source prison sequence clears crew before arrival markets, with no daily wage bill.
for(const credits of [100000,0]){let x=fixture();x=manage(x,'hire',1);x.credits=credits;x.trip={target:x.current===0?1:0,clicks:5,raided:false};x.pending={kind:'arrest',step:'sentence',fine:100,days:30};E.continueArrest(x);check(E.mercenaryMoney(x),0);check(x.pending.crewLeft,[x.mercenaries[1].name]);check(x.ship.hiredCrew||[],[]);x=reload(x);E.continueArrest(x);check(x.ship.type,credits?'GRASSHOPPER':'FLEA');}
// Save validation prevents fake, duplicate, overcapacity or altered hires.
s=fixture();s=manage(s,'hire',1);for(const mutate of [x=>x.ship.hiredCrew.push(x.ship.hiredCrew[0]),x=>x.ship.hiredCrew[0].skills.pilot=0,x=>x.ship.type='GNAT',x=>x.ship.hiredCrew[0].id=0,x=>x.reserveMoney='yes']){const bad=E.copy(s);mutate(bad);assert.throws(()=>E.deserialize(E.serialize(bad)));checks++;}
E.openCrew(s,'dismiss',1);const bad=E.copy(s);bad.pending.quote.wage++;assert.throws(()=>E.deserialize(E.serialize(bad)));checks++;s=reload(s);E.respondCrew(s,false);check(s.ship.hiredCrew.length,1);
// Legacy saves do not opt into hiring or alter RNG/state on load.
for(const x of [E.newFixtureGame(),E.newGame(),JSON.parse(fs.readFileSync('tests/fixtures/Space_Trader_Shipyard_Test_Save.json'))]){check(E.deserialize(E.serialize(x)),x);check(x.ship.hiredCrew,undefined);}
const result={checks,hires,departures,failures:0};fs.writeFileSync('tests/out/crew-integration-summary.json',JSON.stringify(result,null,2)+'\n');console.log(result);

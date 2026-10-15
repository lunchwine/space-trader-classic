const E=require('../src/engine'),assert=require('node:assert/strict'),fs=require('node:fs');let checks=0;
const check=(a,b)=>{assert.deepEqual(a,b);checks++;};
function fixture(credits=1000){const s=E.newGame(2000,0);s.ship.fuel=3;s.ship.hull=50;s.credits=credits;return s;}
for(const fuel of [false,true])for(const repair of [false,true])for(const credits of [0,1,7,21,22,23,122,1000]){
 const s=fixture(credits);E.setArrivalOption(s,'autoFuel',fuel);E.setArrivalOption(s,'autoRepair',repair);
 const before=E.copy(s),rng=s.rng;const expected=E.copy(s),r=E.automaticServices(expected);
 s.trip={target:10,clicks:0,raided:false,inspected:false};s.pending={kind:'result',title:'Passed',text:'Continue'};
 E.acknowledge(s);check(s.pending.kind,'arrival');check(s.ship.fuel,expected.ship.fuel);check(s.ship.hull,expected.ship.hull);check(s.credits,expected.credits);check(s.pending.services||null,r);
 const loaded=E.deserialize(E.serialize(s));check(loaded,s);const saved=E.copy(loaded);E.acknowledge(loaded);check(loaded.credits,saved.credits);check(loaded.ship,saved.ship);check(loaded.rng,saved.rng);
 if(!fuel&&!repair){check(s.ship,before.ship);check(s.credits,before.credits);check(s.pending.services,undefined);}
 check(E.automaticServices(before)?.cost||0,credits-expected.credits);check(before.rng,rng);
}
let s=fixture();delete s.autoFuel;delete s.autoRepair;check(E.deserialize(E.serialize(s)),s);
for(const value of [null,1,'true',{}]){s=fixture();s.autoFuel=value;assert.throws(()=>E.deserialize(E.serialize(s)));checks++;}
s=fixture();const before=E.serialize(s);assert.throws(()=>E.setArrivalOption(s,'other',true));assert.throws(()=>E.setArrivalOption(s,'autoFuel',1));check(E.serialize(s),before);
s.trip={target:10,clicks:0,raided:false};/* The original Options dialog is available while travelling. */E.setArrivalOption(s,'autoFuel',true);assert.equal(s.autoFuel,true);E.setArrivalOption(s,'autoFuel',false);checks++;
// Prison's arrival() skips TravelTask's service block, preserving fine affordability.
for(const credits of [1000,50000]){
 s=fixture(credits);s.autoFuel=s.autoRepair=true;s.policeScore=-30;s.trip={target:10,clicks:9,raided:false};s.encounter={kind:'POLICE',state:'ATTACK',round:0,opponent:E.makeShip('GNAT')};
 const control=E.copy(s);control.autoFuel=control.autoRepair=false;
 for(const x of [s,control]){E.combat(x,'surrender');E.respondEncounter(x,true);E.continueArrest(x);}
 check(s.credits,control.credits);check(s.ship,control.ship);check(s.pending,control.pending);
}
const result={checks,arrivalScenarios:32,prisonScenarios:2,failures:0};fs.writeFileSync(__dirname+'/out/arrival-integration-summary.json',JSON.stringify(result,null,2)+'\n');console.log(result);

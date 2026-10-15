/* Source-driven galaxy and opponent generation. GPL-3.0-or-later.
 * Preserve Java RNG order and historical quirks. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory;else root.SpaceTraderGenerators=factory;})(globalThis,function(D,E){
 'use strict';
 const int=Math.trunc,byId=a=>Object.fromEntries(a.map(x=>[x.id,x]));
 const T=byId(D.ships),P=byId(D.governments),keys=['pilot','fighter','trader','engineer'];
 const skillSet=(rng)=>Object.fromEntries(keys.map(k=>[k,1+rng.get(5)+rng.get(6)]));
 function galaxy(rng,difficulty,randomQuestSystems=false){
  const systems=[],wormholes=[];
  while(systems.length<120){
   const i=systems.length;
   const x=i<6?6-rng.get(13)+int(150*(1+2*(i%3))/6):1+rng.get(148);
   const y=i<6?6-rng.get(13)+int(110*(i<3?1:3)/4):1+rng.get(108);
   if(i>=6){let close=false,redo=false;for(const s of systems){const d=(s.x-x)**2+(s.y-y)**2;if(d<=49){redo=true;break;}if(d<169)close=true;}if(redo||!close)continue;}
   const tech=rng.get(8),government=D.governments[rng.get(17)],lo=government.minTechLevel,hi=government.maxTechLevel;
   if(tech<lo||tech>hi)continue;
   const resource=rng.get(5)>=3?D.resources[1+rng.get(D.resources.length-1)].id:'NOSPECIALRESOURCES';
   const size=rng.get(5),status=rng.get(100)<15?D.statuses[1+rng.get(D.statuses.length-1)].id:'UNEVENTFUL';
   const sys={id:i,name:D.systemNames[i],x,y,tech,government:government.id,size,resource,status,special:null,countDown:0,visited:false};
   sys.qty=E.initializeQuantities(sys,difficulty,rng);systems.push(sys);if(i<6)wormholes.push(i);
  }
  for(let i=0;i<120;i++){const d=wormholes.indexOf(i),j=rng.get(120);if(wormholes.includes(j))continue;const a=systems[i],b=systems[j];[a.x,b.x]=[b.x,a.x];[a.y,b.y]=[b.y,a.y];if(d>=0)wormholes[d]=j;}
  for(let i=0;i<6;i++){const j=rng.get(6);[wormholes[i],wormholes[j]]=[wormholes[j],wormholes[i]];}
  const destinations={};for(const name of ['Acamar','Baratas','Daled','Devidia','Gemulon','Japori','Kravat','Melina','Nix','Og','Regulas','Sol','Utopia','Zalkon'])destinations[name.toLowerCase()]=D.systemNames.indexOf(name);
  if(randomQuestSystems){const used=new Set([destinations.og,destinations.sol,destinations.utopia]);for(const key of ['acamar','baratas','daled','devidia','gemulon','japori','kravat','melina','nix','regulas','zalkon']){let id;do{id=rng.get(120);}while(used.has(id));destinations[key]=id;used.add(id);}}
  const mercenaries=[{id:0,name:D.mercenaryNames[0],skills:{pilot:5,fighter:5,trader:5,engineer:5},system:null}];
  while(mercenaries.length<31){const i=mercenaries.length,skills=skillSet(rng),system=rng.get(120);if(system===destinations.kravat||mercenaries.slice(1).some(m=>m.system===system))continue;mercenaries.push({id:i,name:D.mercenaryNames[i],skills,system});}mercenaries[30].system=null;
  for(const [key,event] of Object.entries({acamar:'MONSTERKILLED',baratas:'FLYBARATAS',melina:'FLYMELINA',regulas:'FLYREGULAS',zalkon:'DRAGONFLYDESTROYED',japori:'MEDICINEDELIVERY',utopia:'MOONBOUGHT',devidia:'JAREKGETSOUT',kravat:'WILDGETSOUT'}))systems[destinations[key]].special=event;
  // Retain the original index-versus-distance comparisons.
  let freeWormhole=false,noArtifact=false,k=0,wh=rng.get(6);
  while(systems[wormholes[wh]].special!==null&&wh!==destinations.gemulon&&wh!==destinations.daled&&wh!==destinations.nix&&k<20){wh=rng.get(6);k++;}
  if(k<20){freeWormhole=true;systems[wormholes[wh]].special='SCARABDESTROYED';}
  function nearest(origin,predicate,event,destinationEvent){let d=999,k=-1;for(let i=0;i<120;i++){const j=E.distance(systems[origin],systems[i]);if(j>=70&&j<d&&systems[i].special===null&&predicate(d,k)){k=i;d=j;}}if(k>=0){systems[k].special=event;if(destinationEvent)systems[origin].special=destinationEvent;}}
  nearest(destinations.nix,(d)=>d!==destinations.gemulon&&d!==destinations.daled,'GETREACTOR','REACTORDELIVERED');
  let tries=0;for(;tries<120;tries++){const d=1+rng.get(119);if(systems[d].special===null&&systems[d].tech>=7&&d!==destinations.gemulon&&d!==destinations.daled){systems[d].special='ARTIFACTDELIVERY';break;}}noArtifact=tries>=120;
  nearest(destinations.gemulon,(_,k)=>k!==destinations.daled&&k!==destinations.gemulon,'ALIENINVASION','GEMULONRESCUED');
  nearest(destinations.daled,()=>true,'EXPERIMENT','EXPERIMENTSTOPPED');
  for(const event of D.specialEvents)for(let j=0;j<event.occurrence;j++){if(event.id==='ALIENARTIFACT'&&noArtifact)continue;let d;do{d=1+rng.get(119);}while(systems[d].special!==null);if(freeWormhole||event.id!=='SCARAB')systems[d].special=event.id;}
  let current=0;for(let i=0;i<200;i++){current=rng.get(120);const s=systems[current];if(s.special!==null||i<100&&(s.tech<=0||s.tech>=6))continue;if(systems.filter(x=>x.id!==current&&E.distance(s,x)<=T.GNAT.fuelTanks).length<3)continue;break;}
  mercenaries[0].system=current;
  return {systems,wormholes,destinations,mercenaries,current};
 }
 function currentWorth(s){const t=T[s.ship.type];let n=int(t.price*(s.ship.tribbles>0?1:3)/4)-(t.hullStrength+(s.scarabStatus===3?50:0)-s.ship.hull)*t.repairCosts-((s.ship.gadgets||[]).includes('FUELCOMPACTOR')?18-s.ship.fuel:t.fuelTanks-s.ship.fuel)*t.costOfFuel+s.credits-s.debt;
  for(const [list,table] of [[s.ship.weapons,D.weapons],[s.ship.shields,D.shields],[s.ship.gadgets||[],D.gadgets]])for(const id of list)if(id)n+=int(table.find(x=>x.id===id).price*3/4);
  return n+Object.values(s.costBasis).reduce((a,b)=>a+b,0)+(s.moonBought?500000:0);
 }
 function opponent(s,opp,rng){
  const difficulty=s.difficulty,worth=currentWorth(s),government=P[s.systems[s.trip?.target??s.current].government];
  function empty(type){const o=E.makeShip(type);o.weapons=[null,null,null];o.shields=[null,null,null];o.shieldStrength=[0,0,0];o.gadgets=[null,null,null];o.crew=[null,null,null];return o;}
  if(opp==='BOTTLE')return empty('BOTTLE');
  if(opp==='FAMOUSCAPTAIN'){const o=empty('WASP');o.weapons.fill('MILITARY');o.shields.fill('REFLECTIVE');o.shieldStrength.fill(D.shields.find(x=>x.id==='REFLECTIVE').power);o.gadgets[0]='TARGETINGSYSTEM';o.gadgets[1]='AUTOREPAIRSYSTEM';o.skills=Object.fromEntries(keys.map(k=>[k,10]));o.crew[0]={skills:{...o.skills}};return o;}
  let tries=1;
  if(opp==='MANTIS')tries=1+difficulty;
  if(opp==='POLICE'){const villain=D.policeRecords.find(x=>x.id==='VILLAIN').score,psycho=D.policeRecords.find(x=>x.id==='PSYCHOPATH').score;if(s.policeScore<villain&&s.wildStatus!==1)tries=3;else if(s.policeScore<psycho||s.wildStatus===1)tries=5;tries=Math.max(1,tries+difficulty-2);}
  if(opp==='PIRATE')tries=Math.max(1,1+int(worth/100000)+difficulty-2);
  let type=opp==='TRADER'?0:1;const bonus=Math.max(0,difficulty-2),role=({POLICE:['police','strengthPolice'],PIRATE:['pirates','strengthPirates'],TRADER:['traders','strengthTraders']})[opp];
  for(let j=0;j<tries;j++){let i;do{const d=rng.get(100);i=0;let sum=D.ships[0].occurrence;while(sum<d&&i<9)sum+=D.ships[++i].occurrence;}while(role&&(D.ships[i][role[0]]<0||government[role[1]]+bonus<D.ships[i][role[0]]));type=Math.max(type,i);}
  if(opp==='MANTIS')type=T.MANTIS.ordinal;else tries=Math.max(1,int(worth/150000)+difficulty-2);
  const o=empty(D.ships[type].id),t=T[o.type];let d;
  // The Java source uses k < sum for equipment and clears gadgets after weapons.
  // These unusual conditions intentionally remain unchanged.
  const choose=(table,count,filter=()=>true)=>{let f=0;for(let e=0;e<tries;e++){const k=rng.get(100);let j=0,sum=table[0].chance;while(k<sum&&j<count-1)sum+=table[++j].chance;if(filter(table[j].id)&&j>f)f=j;}return table[f];};
  if(t.gadgetSlots<=0)d=0;else if(difficulty<=3){d=rng.get(t.gadgetSlots+1);if(d<t.gadgetSlots){if(tries>4)d++;else if(tries>2)d+=rng.get(2);}}else d=t.gadgetSlots;
  for(let i=0;i<d;i++)o.gadgets[i]=choose(D.gadgets,5,id=>!o.gadgets.includes(id)).id;
  let bays=t.cargoBays+5*o.gadgets.filter(x=>x==='EXTRABAYS').length-(E.japoriQuest(s).status===1?10:0)-(s.reactorStatus>0&&s.reactorStatus<21?15-int((s.reactorStatus-1)/2):0);
  if(bays>5){let sum=difficulty>=2?Math.min(3+rng.get(bays-5),15):bays;if(opp==='POLICE')sum=0;if(opp==='PIRATE')sum=difficulty<2?int(sum*4/5):int(sum/difficulty);sum=Math.max(1,sum);let i=0;while(i<sum){const j=rng.get(10),k=Math.min(1+rng.get(10-j),sum-i);o.cargo[D.goods[j].id]+=k;i+=k;}}
  if(t.weaponSlots<=0)d=0;else if(t.weaponSlots<=1)d=1;else if(difficulty<=3){d=1+rng.get(t.weaponSlots);if(d<t.weaponSlots){if(tries>4&&difficulty>=3)d++;else if(tries>3||difficulty>=3)d+=rng.get(2);}}else d=t.weaponSlots;
  for(let i=0;i<d;i++)o.weapons[i]=choose(D.weapons,3).id;for(let i=d;i<3;i++)o.gadgets[i]=null;
  if(t.shieldSlots<=0)d=0;else if(difficulty<=3){d=rng.get(t.shieldSlots+1);if(d<t.shieldSlots){if(tries>3)d++;else if(tries>1)d+=rng.get(2);}}else d=t.shieldSlots;
  for(let i=0;i<d;i++){const shield=choose(D.shields,2);o.shields[i]=shield.id;for(let j=0;j<5;j++)o.shieldStrength[i]=Math.max(o.shieldStrength[i],1+rng.get(shield.power));}
  if(o.shields[0]!==null&&rng.get(10)<=7)o.hull=t.hullStrength;else{let k=0;for(let j=0;j<5;j++)k=Math.max(k,1+rng.get(t.hullStrength));o.hull=k;}if(opp==='MANTIS')o.hull=t.hullStrength;
  o.skills=Object.fromEntries(keys.map(k=>[k,k==='engineer'&&s.trip?.target===s.destinations.kravat&&s.wildStatus===1&&rng.get(10)<difficulty+1?10:1+rng.get(10)]));o.crew[0]={skills:{...o.skills}};
  if(difficulty<=3){d=1+rng.get(t.crewQuarters);if(difficulty>=3&&d<t.crewQuarters)d++;}else d=t.crewQuarters;
  for(let i=1;i<d;i++){const index=rng.get(31);o.crew[i]=JSON.parse(JSON.stringify(s.mercenaries[index]));if(index===0)o.crew[i].skills={...s.ship.skills};}
  return o;
 }
 return {galaxy,opponent,currentWorth};
});

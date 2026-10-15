/* Remaining source quest/event rules. Russell Wolf / Pieter Spronck, GPL-3.0-or-later. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory;else root.SpaceTraderCampaigns=factory;})(globalThis,function(D,E){
 'use strict';
 const int=Math.trunc,T=Object.fromEntries(D.ships.map(t=>[t.id,t])),events=Object.fromEntries(D.specialEvents.map(t=>[t.id,t]));
 const keys=['pilot','fighter','trader','engineer'];
 const definitions={
  wild:{title:'Jonathan Wild',offer:'TRANSPORTWILD',field:'wildStatus',destination:'kravat'},
  artifact:{title:'Alien artifact',offer:'ALIENARTIFACT',destination:null},
  monster:{title:'Space Monster',offer:'SPACEMONSTER',field:'monsterStatus',destination:'acamar'},
  dragonfly:{title:'Stolen Dragonfly',offer:'DRAGONFLY',field:'dragonflyStatus',destination:'baratas'},
  scarab:{title:'Stolen Scarab',offer:'SCARAB',field:'scarabStatus',destination:null},
  invasion:{title:'Gemulon invasion',offer:'ALIENINVASION',field:'invasionStatus',destination:'gemulon'},
  experiment:{title:'Dangerous experiment',offer:'EXPERIMENT',field:'experimentStatus',destination:'daled'},
  reactor:{title:'Unstable reactor',offer:'GETREACTOR',field:'reactorStatus',destination:'nix'}
 };
 const supported=new Set(['MOONFORSALE','MOONBOUGHT','SKILLINCREASE','ERASERECORD','LOTTERYWINNER','CARGOFORSALE','TRIBBLE','BUYTRIBBLE',...Object.values(definitions).map(q=>q.offer),'WILDGETSOUT','ARTIFACTDELIVERY','MONSTERKILLED','FLYBARATAS','FLYMELINA','FLYREGULAS','DRAGONFLYDESTROYED','SCARABDESTROYED','GETHULLUPGRADED','GEMULONRESCUED','GEMULONINVADED','EXPERIMENTSTOPPED','EXPERIMENTNOTSTOPPED','REACTORDELIVERED','INSTALLLIGHTNINGSHIELD','GETFUELCOMPACTOR','GETSPECIALLASER']);
 const reactorActive=s=>s.reactorStatus>0&&s.reactorStatus<21;
 const armed=s=>(s.ship.weapons||[]).some(id=>['BEAM','MILITARY','MORGAN'].includes(id));
 const find=(s,event)=>s.systems.find(x=>x.special===event)?.id??null;
 function target(s,key){const d=definitions[key];return d.destination?s.destinations[d.destination]:find(s,key==='artifact'?'ARTIFACTDELIVERY':'SCARABDESTROYED');}
 function openQuests(s){let n=0;
  if(s.monsterStatus===1)n++;
  if(s.dragonflyStatus>=1&&s.dragonflyStatus<=4||s.systems[s.destinations?.zalkon]?.special==='INSTALLLIGHTNINGSHIELD')n++;
  if(E.japoriQuest(s).status===1)n++;
  if(s.artifactOnBoard)n++;
  if(s.wildStatus===1)n++;
  if(s.jarekStatus===1)n++;
  if(s.invasionStatus>=1&&s.invasionStatus<7||s.systems[s.destinations?.gemulon]?.special==='GETFUELCOMPACTOR')n++;
  if(s.experimentStatus>=1&&s.experimentStatus<11)n++;
  if(reactorActive(s))n++;
  if(s.systems[s.destinations?.nix]?.special==='GETSPECIALLASER')n++;
  if(s.scarabStatus===1)n++;
  if(s.ship.tribbles>0)n++;
  if(s.moonBought)n++;
  return n;
 }
 function reason(s,id=s.systems[s.current]?.special){
  if(s.version!==2||!supported.has(id))return 'No supported event here.';
  const q=E.japoriQuest(s),st=key=>s[key]||0;
  if(['DRAGONFLY','ALIENARTIFACT','EXPERIMENT'].includes(id)&&s.policeScore<-5)return 'Requires a police record of dubious or better.';
  if(id==='TRANSPORTWILD'&&s.policeScore>=-5)return 'Wild only approaches commanders with a criminal record.';
  if(id==='GETREACTOR'&&(s.policeScore>=-5||s.reputation<40||st('reactorStatus')!==0))return 'Requires a criminal record, average combat reputation and no reactor already accepted.';
  if(id==='SCARAB'&&(s.reputation<40||st('scarabStatus')!==0))return 'Requires average combat reputation and an unstarted Scarab assignment.';
  const expected={WILDGETSOUT:s.wildStatus===1,ARTIFACTDELIVERY:!!s.artifactOnBoard,MONSTERKILLED:s.monsterStatus>=2,FLYBARATAS:s.dragonflyStatus>=1,FLYMELINA:s.dragonflyStatus>=2,FLYREGULAS:s.dragonflyStatus>=3,DRAGONFLYDESTROYED:s.dragonflyStatus>=5,SCARABDESTROYED:s.scarabStatus===2,GETHULLUPGRADED:s.scarabStatus===2,GEMULONRESCUED:s.invasionStatus>=1&&s.invasionStatus<=7,EXPERIMENTSTOPPED:s.experimentStatus>=1&&s.experimentStatus<12,REACTORDELIVERED:reactorActive(s)};
  if(id in expected&&!expected[id])return 'This mission event is not ready.';
  if(id==='MOONFORSALE'&&(s.moonBought||E.currentWorth(s)<400000))return 'A moon offer requires at least 400,000 credits of total worth.';
  if(id==='MOONBOUGHT'&&!s.moonBought)return 'Buy a moon first.';
  if(id==='BUYTRIBBLE'&&!(s.ship.tribbles>0))return 'No tribbles to sell.';
  if(id==='ERASERECORD'&&s.policeScore>=-5)return 'Your record does not need clearing.';
  if((Object.values(definitions).some(d=>d.offer===id)||id==='TRIBBLE')&&openQuests(s)>3)return 'Finish an active assignment first (four active quests maximum).';
  if(id==='TRANSPORTWILD'&&s.campaigns?.wild)return 'The Wild assignment has already been resolved.';
  if(id==='GETREACTOR'&&s.campaigns?.reactor)return 'The reactor assignment has already been resolved.';
  return null;
 }
 function available(s){if(s.trip||s.encounter||s.pending||s.ended)return null;return reason(s)?null:s.systems[s.current].special;}
 function quote(s,id=s.systems[s.current].special){
  if(s.systems[s.current].special!==id||reason(s,id))throw Error(reason(s,id)||'This event has changed.');
  const event=events[id],free=E.cargoCapacity(s)-E.filled(s.ship);let blocked=null;
  if(E.availableMoney(s)<event.price)blocked='Not enough available credits.';
  if(id==='CARGOFORSALE'&&free<3)blocked='Three empty cargo bays are required.';
  if(id==='TRANSPORTWILD'){
   if(E.occupiedQuarters(s)>=T[s.ship.type].crewQuarters)blocked='Wild needs a spare crew quarter.';
   else if(!armed(s))blocked='Wild requires a Beam laser or stronger weapon.';
   else if(reactorActive(s))blocked='Wild refuses to board with an unstable reactor.';
  }
  if(id==='GETREACTOR'&&free<15)blocked='The reactor and its fuel require fifteen empty cargo bays.';
  const reward={INSTALLLIGHTNINGSHIELD:['shields','shieldSlots','LIGHTNING'],GETFUELCOMPACTOR:['gadgets','gadgetSlots','FUELCOMPACTOR'],GETSPECIALLASER:['weapons','weaponSlots','MORGAN']}[id];
  const slot=reward?Array.from({length:T[s.ship.type][reward[1]]},(_,i)=>i).find(i=>!s.ship[reward[0]]?.[i]):undefined;
  if(reward&&slot===undefined)blocked='No empty equipment slot. Sell an installed item first.';
  return {id,price:event.price,blocked,...(reward?{category:reward[0],equipment:reward[2],slot:slot??null}:{}),...(id==='GETREACTOR'?{wildLeaves:s.wildStatus===1}:{})};
 }
 function eventName(s,id){return (events[id]?.label||id).replace(/%(?:\d+\$)?s/g,s.systems[s.destinations?.gemulon??s.current].name);}
 function eventText(s,id){const map={FLYBARATAS:'melina',FLYMELINA:'regulas',FLYREGULAS:'zalkon',SPACEMONSTER:'acamar',DRAGONFLY:'baratas',TRANSPORTWILD:'kravat',GETREACTOR:'nix',ALIENINVASION:'gemulon',GEMULONINVADED:'gemulon',GEMULONRESCUED:'gemulon',EXPERIMENT:'daled',MOONFORSALE:'utopia',MOONBOUGHT:'utopia'};
  const name=map[id]?s.systems[s.destinations[map[id]]].name:'';
  return (D.text[events[id]?.questStringId]||'').replace(/%(?:\d+\$)?s/g,name);
 }
 function record(s,key){s.campaigns??={};s.campaigns[key]={origin:s.current,target:target(s,key),outcome:'active'};return s.campaigns[key];}
 function outcome(s,key,state){if(s.campaigns?.[key])s.campaigns[key].outcome=state;}
 function fail(s,key,text){const d=definitions[key];if(d.field)s[d.field]=0;if(key==='artifact')s.artifactOnBoard=false;outcome(s,key,'failed');E.log(s,text);return text;}
 function open(s){E.requireDocked(s);const id=available(s);if(!id)throw Error('No special event is available here.');s.pending={kind:'special',step:'review',quote:quote(s,id)};}
 function respond(s,yes){
  const p=s.pending;if(p?.kind!=='special'||typeof yes!=='boolean')throw Error('No special event decision is open.');
  if(p.step==='complete'||!yes){s.pending=null;return;}
  const q=quote(s,p.quote.id);if(JSON.stringify(q)!==JSON.stringify(p.quote))throw Error('This event offer changed.');if(q.blocked)throw Error(q.blocked);
  E.recordPortNews(s);E.withRandom(s,rng=>{
   const id=q.id,sys=s.systems[s.current];let retain=false,text='',title=eventName(s,id);s.credits-=q.price;
   const begin=key=>{record(s,key);s[definitions[key].field]=1;};
   switch(id){
    case 'MOONFORSALE':s.moonBought=true;text='You bought a moon in '+s.systems[s.destinations.utopia].name+'. Go there to claim it and retire.';break;
    case 'MOONBOUGHT':E.finishGame(s,'MOON');return;
    case 'SKILLINCREASE':{const key=E.increaseRandomSkill(s,rng);text=key?`${key} increased by one to ${s.ship.skills[key]}.`:'All base skills are already at their maximum.';break;}
    case 'ERASERECORD':s.policeScore=0;for(const g of D.goods)s.prices.sell[g.id]=int(s.prices.sell[g.id]*100/90);text='Your police record is clean. Sell prices were recalculated.';break;
    case 'LOTTERYWINNER':text='You received 1,000 credits.';break;
    case 'CARGOFORSALE':{const good=D.goods[rng.get(10)].id;s.ship.cargo[good]+=3;s.costBasis[good]+=q.price;text=`The sealed canisters contain three bays of ${D.goods.find(g=>g.id===good).label.toLowerCase()}.`;break;}
    case 'TRIBBLE':s.ship.tribbles=1;text='One tribble is aboard. Tribbles reproduce during travel and affect ship trade-in value.';break;
    case 'BUYTRIBBLE':{const n=s.ship.tribbles;s.credits+=n>>1;s.ship.tribbles=0;text=`Sold ${n} tribbles for ${n>>1} credits.`;break;}
    case 'TRANSPORTWILD':begin('wild');text='Jonathan Wild boarded for '+s.systems[s.destinations.kravat].name+'. One crew quarter reserved. Police will arrest you if they find him.';break;
    case 'WILDGETSOUT':{s.wildStatus=2;outcome(s,'wild','complete');const low=keys.slice().sort((a,b)=>s.ship.skills[a]-s.ship.skills[b]||keys.indexOf(a)-keys.indexOf(b));const merc=s.mercenaries[30];merc.skills=Object.fromEntries(keys.map(k=>[k,5]));merc.skills[low[0]]=10;merc.skills[low[1]]=8;merc.system=s.destinations.kravat;if(s.policeScore<0)s.policeScore=0;text='Wild disembarked. Zeethibal is available here with no wages, strongest in your two lowest base skills. Your police record is clean.';break;}
    case 'ALIENARTIFACT':record(s,'artifact');s.artifactOnBoard=true;text='The artifact is aboard, separate from ordinary cargo. Mantis ships may pursue it. Deliver it to '+s.systems[s.campaigns.artifact.target].name+'.';break;
    case 'ARTIFACTDELIVERY':s.artifactOnBoard=false;outcome(s,'artifact','complete');text='Artifact delivered. You received 20,000 credits.';break;
    case 'SPACEMONSTER':begin('monster');s.monsterHull=T.MONSTER.hullStrength;for(const x of s.systems)if(x.special===id)x.special=null;text='The Space Monster is waiting at '+s.systems[s.destinations.acamar].name+'.';break;
    case 'MONSTERKILLED':outcome(s,'monster','complete');text='The Space Monster is gone. You received 15,000 credits.';break;
    case 'DRAGONFLY':begin('dragonfly');for(const x of s.systems)if(x.special===id)x.special=null;text='Follow the stolen Dragonfly to '+s.systems[s.destinations.baratas].name+'.';break;
    case 'FLYBARATAS':case 'FLYMELINA':case 'FLYREGULAS':s.dragonflyStatus++;text=eventText(s,id);break;
    case 'DRAGONFLYDESTROYED':sys.special='INSTALLLIGHTNINGSHIELD';retain=true;outcome(s,'dragonfly','reward');text='The Dragonfly is destroyed. A Lightning shield can be installed here when you have an empty shield slot.';break;
    case 'SCARAB':begin('scarab');text='The stolen Scarab waits at '+s.systems[s.campaigns.scarab.target].name+'. Approach through its incoming wormhole. Only Pulse and Morgan’s lasers damage its hull.';break;
    case 'SCARABDESTROYED':sys.special='GETHULLUPGRADED';retain=true;outcome(s,'scarab','reward');text='The Scarab is destroyed. Return here to reinforce your current ship’s hull.';break;
    case 'GETHULLUPGRADED':s.scarabStatus=3;s.ship.hull+=50;retain=true;outcome(s,'scarab','complete');text='Your current ship gained 50 maximum hull points. The reinforcement is lost when you trade or lose this ship.';break;
    case 'ALIENINVASION':begin('invasion');text='Warn '+s.systems[s.destinations.gemulon].name+' before the invasion. Six travel days remain.';break;
    case 'GEMULONRESCUED':s.invasionStatus=0;sys.special='GETFUELCOMPACTOR';retain=true;outcome(s,'invasion','reward');text='The warning arrived in time. A fuel compactor can be installed here in an empty gadget slot.';break;
    case 'GEMULONINVADED':text='The invasion was not stopped. This system now has pre-agricultural technology and anarchy; Mantis ships patrol its approaches.';break;
    case 'EXPERIMENT':begin('experiment');text='Reach '+s.systems[s.destinations.daled].name+' within ten travel days to stop the experiment.';break;
    case 'EXPERIMENTSTOPPED':s.experimentStatus=13;s.canSuperWarp=true;outcome(s,'experiment','complete');text='The experiment was stopped. You received a portable singularity: one instant jump to any other system, using no fuel, fees or day.';break;
    case 'EXPERIMENTNOTSTOPPED':text='The experiment tore the fabric of space. Departures may be diverted to a random system until the rift subsides.';break;
    case 'GETREACTOR':if(q.wildLeaves)fail(s,'wild','Wild left because you accepted the unstable reactor.');begin('reactor');text='The unstable reactor and its fuel occupy fifteen bays. Fuel is consumed over time, releasing bays. Deliver to '+s.systems[s.destinations.nix].name+' before meltdown; incoming combat damage is increased.';break;
    case 'REACTORDELIVERED':s.reactorStatus=21;sys.special='GETSPECIALLASER';retain=true;outcome(s,'reactor','reward');text='Reactor delivered safely. Its cargo bays are released. Morgan’s laser can be installed here in an empty weapon slot.';break;
    case 'INSTALLLIGHTNINGSHIELD':case 'GETFUELCOMPACTOR':case 'GETSPECIALLASER':s.ship[q.category]??=[];s.ship[q.category][q.slot]=q.equipment;if(q.category==='shields')s.ship.shieldStrength[q.slot]=350;if(q.equipment==='FUELCOMPACTOR')s.ship.fuel=18;outcome(s,({INSTALLLIGHTNINGSHIELD:'dragonfly',GETFUELCOMPACTOR:'invasion',GETSPECIALLASER:'reactor'})[id],'complete');text=(D[q.category].find(x=>x.id===q.equipment)?.label||q.equipment)+' installed.';break;
    default:throw Error('Unimplemented event.');
   }
   if(!retain)sys.special=null;
   E.log(s,title+'. '+text);s.pending={kind:'special',step:'complete',event:id,title,text};
  });
 }
 function advanceDays(s,amount){
  if(s.version!==2)return;
  if(s.experimentStatus>0&&s.experimentStatus<12){s.experimentStatus+=amount;if(s.experimentStatus>11){s.experimentStatus=12;E.addNewsEvent(s,'EXPERIMENTPERFORMED');s.fabricRipProbability=25-amount;s.systems[s.destinations.daled].special='EXPERIMENTNOTSTOPPED';outcome(s,'experiment','failed');E.log(s,'The experiment took place. Space-time rifts may divert your journeys.');}}
  else if(s.experimentStatus===12&&(s.fabricRipProbability||0)>0)s.fabricRipProbability-=amount;
  if(s.invasionStatus>0&&s.invasionStatus<8){s.invasionStatus+=amount;if(s.invasionStatus>=8){const sys=s.systems[s.destinations.gemulon];sys.special='GEMULONINVADED';sys.tech=0;sys.government='ANARCHY';outcome(s,'invasion','failed');E.log(s,sys.name+' has been invaded. The warning arrived too late.');}}
  if(reactorActive(s))s.reactorStatus=Math.min(20,s.reactorStatus+amount);
 }
 function specialOpponent(s,kind){
  const o=E.makeShip(kind);o.weapons=kind==='MONSTER'?['MILITARY','MILITARY','MILITARY']:kind==='SCARAB'?['MILITARY','MILITARY']:['MILITARY','PULSE'];o.shields=kind==='DRAGONFLY'?['LIGHTNING','LIGHTNING','LIGHTNING']:[];o.shieldStrength=o.shields.map(()=>350);o.gadgets=kind==='DRAGONFLY'?['AUTOREPAIRSYSTEM','TARGETINGSYSTEM']:[];
  const d=s.difficulty;o.skills=kind==='MONSTER'?{pilot:8+d,fighter:8+d,trader:1,engineer:1+d}:kind==='SCARAB'?{pilot:5+d,fighter:6+d,trader:1,engineer:6+d}:{pilot:4+d,fighter:6+d,trader:1,engineer:6+d};o.crew=[{skills:{...o.skills}}];if(kind==='MONSTER')o.hull=s.monsterHull??T.MONSTER.hullStrength;return o;
 }
 function boss(s){const t=s.trip;if(!t||s.version!==2)return null;if(t.clicks===1&&t.target===s.destinations.acamar&&s.monsterStatus===1)return 'MONSTER';if(t.clicks===20&&s.systems[t.target].special==='SCARABDESTROYED'&&s.scarabStatus===1&&s.arrivedViaWormhole)return 'SCARAB';if(t.clicks===1&&t.target===s.destinations.zalkon&&s.dragonflyStatus===4)return 'DRAGONFLY';return null;}
 function afterVictory(s,kind){const key={MONSTER:'monster',DRAGONFLY:'dragonfly',SCARAB:'scarab'}[kind];if(!key)return;const field=definitions[key].field;s[field]={MONSTER:2,DRAGONFLY:5,SCARAB:2}[kind];outcome(s,key,'reward');}
 function onDeparture(s,rng){
  if(s.monsterHull!==undefined)s.monsterHull=Math.min(T.MONSTER.hullStrength,int(s.monsterHull*105/100));
  if(s.experimentStatus===12&&(s.fabricRipProbability||0)>0&&(rng.get(100)<s.fabricRipProbability||s.fabricRipProbability===25)){s.trip.target=rng.get(s.systems.length);s.trip.diverted=true;E.log(s,'A space-time rift diverted you to '+s.systems[s.trip.target].name+'.');}
 }
 function arrivalEffects(s,rng){
  const notes=[];if(s.reactorStatus===20){const claimHull=s.ship.hull;fail(s,'reactor','The unstable reactor melted down and destroyed your ship.');s.ship.hull=0;return {meltdown:true,claimHull,notes:['Reactor meltdown: ship destroyed.']};}
  if([2,16,18].includes(s.reactorStatus))notes.push(s.reactorStatus===2?'The reactor is consuming its own fuel.':s.reactorStatus===16?'The reactor is making alarming noises.':'The reactor is smoking. Deliver it immediately.');
  if(s.ship.tribbles>0){const old=s.ship.tribbles;let food=false;
   if(reactorActive(s)){s.ship.tribbles=int(old/2);if(s.ship.tribbles<10)s.ship.tribbles=0;notes.push('Reactor radiation killed tribbles.');}
   else if(s.ship.cargo.NARCOTICS>0){s.ship.tribbles=1+rng.get(3);const n=Math.min(1+rng.get(3),s.ship.cargo.NARCOTICS);s.costBasis.NARCOTICS=int(s.costBasis.NARCOTICS*(s.ship.cargo.NARCOTICS-n)/s.ship.cargo.NARCOTICS);s.ship.cargo.NARCOTICS-=n;s.ship.cargo.FURS+=n;notes.push('Tribbles ate narcotics; dead tribbles became '+n+' bays of furs.');}
   else if(s.ship.cargo.FOOD>0){s.ship.tribbles+=100+rng.get(s.ship.cargo.FOOD*100);const n=rng.get(s.ship.cargo.FOOD);s.costBasis.FOOD=int(s.costBasis.FOOD*n/s.ship.cargo.FOOD);s.ship.cargo.FOOD=n;food=true;notes.push('Tribbles ate food and multiplied.');}
   if(s.ship.tribbles>0&&s.ship.tribbles<100000)s.ship.tribbles+=1+rng.get(Math.max(1,s.ship.tribbles>>(food?0:1)));
   s.ship.tribbles=Math.min(100000,s.ship.tribbles);if([100,1000,10000,50000].some(n=>old<n&&s.ship.tribbles>=n))notes.push(s.ship.tribbles+' tribbles now infest your ship.');
  }
  notes.forEach(n=>E.log(s,n));return {meltdown:false,notes};
 }
 function loss(s,mode){const notes=[];if(s.wildStatus===1)notes.push(fail(s,'wild',mode==='prison'?'Wild was arrested.':'Wild was lost during the rescue.'));if(reactorActive(s))notes.push(fail(s,'reactor',mode==='prison'?'Police confiscated the reactor.':'The reactor was destroyed.'));if(mode==='rescue'&&s.artifactOnBoard)notes.push(fail(s,'artifact','The artifact was lost with your ship.'));return notes;}
 function list(s){if(s.version!==2)return [];return Object.entries(definitions).flatMap(([key,d])=>{
  const meta=s.campaigns?.[key],origin=meta?.origin??find(s,d.offer);if(!meta&&origin===null)return [];
  let dest=meta?.target??target(s,key),description=eventText(s,d.offer),stage=meta?.outcome||'available';
  if(key==='dragonfly'&&meta){dest=s.destinations[({1:'baratas',2:'melina',3:'regulas',4:'zalkon',5:'zalkon'})[s.dragonflyStatus]||'zalkon'];description=s.dragonflyStatus<4?'Follow the next lead.':'Defeat the Dragonfly and claim its Lightning shield.';}
  if(key==='scarab'&&stage==='active'&&s.current!==dest){const i=s.wormholes.indexOf(dest);if(i>=0){const entrance=s.wormholes[(i+5)%6];description='Approach '+s.systems[dest].name+' through the wormhole at '+s.systems[entrance].name+'. Pulse or Morgan’s lasers are required.';dest=s.current===entrance?dest:entrance;}}
  if(key==='wild')description=stage==='active'?'Wild occupies one quarter. Maintain a Beam laser or better. Avoid inspection: police will arrest you. Deliver to '+s.systems[dest].name+'.':stage==='complete'?'Wild delivered. Zeethibal is available at '+s.systems[dest].name+' with no wages.':stage==='failed'?'Wild is no longer aboard; assignment closed.':description;
  if(key==='artifact'&&stage==='active')description='Carry the artifact to '+s.systems[dest].name+'. It uses no ordinary cargo bays. Mantis ships may attack.';
  if(key==='invasion'&&stage==='active')description='Reach '+s.systems[dest].name+' within '+Math.max(0,7-s.invasionStatus)+' more travel days. Reward: fuel compactor.';
  if(key==='experiment'&&stage==='active')description='Reach '+s.systems[dest].name+' within '+Math.max(0,11-s.experimentStatus)+' more travel days. Reward: a single-use portable singularity.';
  if(key==='reactor'&&stage==='active')description='Deliver to '+s.systems[dest].name+'. '+(15-int((s.reactorStatus-1)/2))+' bays reserved; meltdown after '+(20-s.reactorStatus)+' more travel days. Police confiscate the reactor; combat damage is increased.';
  if(stage==='complete'&&!['wild'].includes(key))description={artifact:'Artifact delivered; 20,000 credits received.',monster:'Monster destroyed; 15,000 credits received.',dragonfly:'Lightning shield installed.',scarab:'Hull reinforcement claimed. Applies only to the ship that received it.',invasion:'Warning delivered and fuel compactor installed.',experiment:'Experiment stopped; portable singularity awarded.',reactor:'Reactor delivered and Morgan’s laser installed.'}[key];
  if(stage==='failed'&&!['wild'].includes(key))description={artifact:'The artifact was lost; assignment closed.',invasion:'Gemulon was invaded; warning failed.',experiment:'The experiment took place. Temporary space-time rifts may divert travel.',reactor:'The reactor was lost; assignment closed.'}[key]||'Assignment closed.';
  return [{key,title:d.title,stage,origin,target:meta?dest:origin,description}];
 });}
 function validate(s){
  for(const [field,max] of Object.entries({wildStatus:2,monsterStatus:2,dragonflyStatus:5,scarabStatus:3,invasionStatus:1000000,experimentStatus:13,reactorStatus:21}))if(s[field]!==undefined&&(s.version!==2||!Number.isSafeInteger(s[field])||s[field]<0||s[field]>max))throw Error('Invalid saved campaign status.');
  for(const k of ['artifactOnBoard','canSuperWarp'])if(s[k]!==undefined&&(s.version!==2||typeof s[k]!=='boolean'))throw Error('Invalid saved quest equipment.');
  if(s.fabricRipProbability!==undefined&&(!Number.isSafeInteger(s.fabricRipProbability)||s.fabricRipProbability>25||s.fabricRipProbability<-1000000))throw Error('Invalid saved space-time rift.');
  if(s.monsterHull!==undefined&&(!Number.isSafeInteger(s.monsterHull)||s.monsterHull<0||s.monsterHull>500))throw Error('Invalid saved monster hull.');
  if(s.ship.tribbles!==undefined&&(!Number.isSafeInteger(s.ship.tribbles)||s.ship.tribbles<0||s.ship.tribbles>100000))throw Error('Invalid saved tribbles.');
  if(s.campaigns){if(s.version!==2||typeof s.campaigns!=='object'||Array.isArray(s.campaigns))throw Error('Invalid saved campaigns.');for(const [key,m] of Object.entries(s.campaigns)){if(!definitions[key]||!m||!Number.isInteger(m.origin)||!s.systems[m.origin]||!Number.isInteger(m.target)||!s.systems[m.target]||!['active','reward','complete','failed'].includes(m.outcome))throw Error('Invalid saved campaign.');if(definitions[key].destination&&m.target!==s.destinations[definitions[key].destination])throw Error('Invalid saved campaign destination.');}}
  if(s.campaigns){const active={wild:s.wildStatus===1,artifact:!!s.artifactOnBoard,monster:s.monsterStatus===1,dragonfly:s.dragonflyStatus>=1&&s.dragonflyStatus<=4,scarab:s.scarabStatus===1,invasion:s.invasionStatus>=1&&s.invasionStatus<=7,experiment:s.experimentStatus>=1&&s.experimentStatus<=11,reactor:reactorActive(s)},reward={monster:s.monsterStatus===2,dragonfly:s.dragonflyStatus===5,scarab:s.scarabStatus===2,invasion:s.invasionStatus===0,reactor:s.reactorStatus===21},complete={wild:s.wildStatus===2,artifact:!s.artifactOnBoard,monster:s.monsterStatus===2,dragonfly:s.dragonflyStatus===5,scarab:[0,3].includes(s.scarabStatus),invasion:s.invasionStatus===0,experiment:s.experimentStatus===13,reactor:s.reactorStatus===21},failed={wild:s.wildStatus===0,artifact:!s.artifactOnBoard,invasion:s.invasionStatus>=8,experiment:s.experimentStatus===12,reactor:s.reactorStatus===0};for(const [key,m] of Object.entries(s.campaigns))if(!({active,reward,complete,failed})[m.outcome][key])throw Error('Saved campaign progress is inconsistent.');}
  if(s.wildStatus===1&&E.occupiedQuarters(s)>T[s.ship.type].crewQuarters)throw Error('Invalid saved Wild quarters.');
  if(s.pending?.kind==='special'){const p=s.pending;if(s.trip||s.encounter||s.ended||!['review','complete'].includes(p.step))throw Error('Invalid saved special event.');if(p.step==='review'&&JSON.stringify(quote(s,p.quote?.id))!==JSON.stringify(p.quote))throw Error('Invalid saved event quote.');if(p.step==='complete'&&(!supported.has(p.event)||typeof p.title!=='string'||typeof p.text!=='string'))throw Error('Invalid saved event result.');}
 }
 return {definitions,supported,reactorActive,armed,find,target,openQuests,reason,available,quote,eventName,eventText,open,respond,advanceDays,specialOpponent,boss,afterVictory,onDeparture,arrivalEffects,loss,fail,list,validate};
});

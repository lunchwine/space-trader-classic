/*
 * Space Trader translation experiment.
 * Gameplay translated from Russell Wolf's Android port (2014–2016),
 * based on Pieter Spronck's Space Trader. GPL-3.0-or-later.
 * See README.md for the deliberately limited scope and source mapping.
 */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./data.js'),require('./generation.js'),require('./encounters.js'),require('./yard.js'),require('./campaigns.js'),require('./finishing.js'));
  else root.SpaceTrader=factory(root.SpaceTraderData,root.SpaceTraderGenerators,root.SpaceTraderEncounters,root.SpaceTraderYard,root.SpaceTraderCampaigns,root.SpaceTraderFinishing);
})(globalThis,function(D,createGenerators,createEncounters,createYard,createCampaigns,createFinishing){
  'use strict';
  const byId=(list)=>Object.fromEntries(list.map(x=>[x.id,x]));
  const G=byId(D.goods), P=byId(D.governments), T=byId(D.ships), W=byId(D.weapons), H=byId(D.shields);
  const int=Math.trunc, clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const zeros=()=>Object.fromEntries(D.goods.map(g=>[g.id,0]));
  const copy=x=>JSON.parse(JSON.stringify(x));
  // Original dialog text from strings.xml: <key>_title / <key>_message with Android format arguments.
  const TX=D.text||{};
  function fmt(str,args=[]){let i=0;return String(str??'').replace(/%(?:(\d+)\$)?([ds%])/g,(m,n,c)=>c==='%'?'%':String(args[n?Number(n)-1:i++]??'')).trim();}
  function say(key,args=[],help=null,messageKey=null){return {title:TX[key+'_title'],message:fmt(TX[messageKey||key+'_message'],args),help};}
  function ask(key,args=[],yes=null,no=null,help=null,messageKey=null){return {...say(key,args,help,messageKey),yes:yes||TX.generic_yes,no:no||TX.generic_no};}

  // java.util.Random's 48-bit LCG and nextInt(bound), including rejection sampling.
  // Preserving this lets identical seeds reproduce the original Java calculations.
  class JavaRandom {
    constructor(seed=2000,raw=false){this.state=raw?BigInt(seed):(BigInt(seed)^0x5DEECE66Dn)&((1n<<48n)-1n);}
    next(bits){this.state=(this.state*0x5DEECE66Dn+11n)&((1n<<48n)-1n);return Number(this.state>>BigInt(48-bits));}
    nextInt(bound){
      if(!Number.isInteger(bound)||bound<1||bound>2147483647)throw Error('Invalid random bound');
      if((bound&-bound)===bound)return Number((BigInt(bound)*BigInt(this.next(31)))>>31n);
      let bits,val;do{bits=this.next(31);val=bits%bound;}while((bits-val+bound-1)>2147483647);
      return val;
    }
    get(max){return max<2?0:this.nextInt(max);}
    toJSON(){return this.state.toString();}
  }

  // GameState.standardPrice, lines 7944–7984. All divisions retain Java truncation.
  function standardPrice(good,size,tech,government,resources){
    const g=typeof good==='string'?G[good]:good,p=typeof government==='string'?P[government]:government;
    if((g.id==='NARCOTICS'&&!p.drugsOK)||(g.id==='FIREARMS'&&!p.firearmsOK))return 0;
    let price=g.priceLowTech+tech*g.priceInc;
    if(p.wanted===g.id)price=int(price*4/3);
    price=int(price*(100-2*p.strengthTraders)/100);
    price=int(price*(100-size)/100);
    if(resources!=='NOSPECIALRESOURCES'){
      if(g.cheapResource&&resources===g.cheapResource)price=int(price*3/4);
      if(g.expensiveResource&&resources===g.expensiveResource)price=int(price*4/3);
    }
    return tech<g.techUsage||price<0?0:price;
  }

  // GameState.determinePrices + recalculateBuyPrices, lines 8122–8161 / 6799–6821.
  function determinePrices(system,traderSkill,policeScore,rng){
    const buy=zeros(),sell=zeros(),p=P[system.government];
    for(const g of D.goods){
      let price=standardPrice(g,system.size,system.tech,p,system.resource);
      if(price<=0)continue;
      if(g.doublePriceStatus&&system.status===g.doublePriceStatus)price=(price*3)>>1;
      price+=rng.get(g.variance)-rng.get(g.variance);
      if(price<=0)continue;
      sell[g.id]=policeScore< -5?int(price*90/100):price;
    }
    for(const g of D.goods){
      if(system.tech<g.techProduction||(g.id==='NARCOTICS'&&!p.drugsOK)||(g.id==='FIREARMS'&&!p.firearmsOK))continue;
      let price=policeScore< -5?int(sell[g.id]*100/90):sell[g.id];
      price=int(price*(103+10-traderSkill)/100);
      buy[g.id]=price<=sell[g.id]?sell[g.id]+1:price;
    }
    return {buy,sell};
  }

  // SolarSystem.initializeTradeItems, including Android's system-size bug fix.
  function initializeQuantities(system,difficulty,rng){
    const qty=zeros(),p=P[system.government];
    for(const g of D.goods){
      if((g.id==='NARCOTICS'&&!p.drugsOK)||(g.id==='FIREARMS'&&!p.firearmsOK)||system.tech<g.techProduction)continue;
      let n=(9+rng.get(5)-Math.abs(g.techTopProduction-system.tech))*(1+system.size);
      if(g.id==='ROBOTS'||g.id==='NARCOTICS')n=int(n*(5-difficulty)/(6-difficulty))+1;
      if(g.cheapResource&&system.resource===g.cheapResource)n=int(n*4/3);
      if(g.expensiveResource&&system.resource===g.expensiveResource)n=(n*3)>>2;
      if(g.doublePriceStatus&&system.status===g.doublePriceStatus)n=int(n/5);
      n+=-rng.get(10)+rng.get(10);qty[g.id]=Math.max(0,n);
    }
    return qty;
  }
  function shuffleStatus(system,rng){
    if(system.status!=='UNEVENTFUL'){if(rng.get(100)<15)system.status='UNEVENTFUL';}
    else if(rng.get(100)<15)system.status=D.statuses[1+rng.get(D.statuses.length-1)].id;
  }
  function changeQuantities(system,difficulty,rng){
    const start=3+difficulty;
    if(system.countDown<=0)return;
    system.countDown--;
    if(system.countDown>start)system.countDown=start;
    else if(system.countDown<=0)system.qty=initializeQuantities(system,difficulty,rng);
    else for(const g of D.goods){
      const p=P[system.government];
      if((g.id==='NARCOTICS'&&!p.drugsOK)||(g.id==='FIREARMS'&&!p.firearmsOK)||system.tech<g.techProduction)system.qty[g.id]=0;
      else system.qty[g.id]=Math.max(0,system.qty[g.id]+rng.get(5)-rng.get(5));
    }
  }

  const filled=ship=>Object.values(ship.cargo).reduce((a,b)=>a+b,0);
  const initialQuests=()=>({japori:{status:0,origin:0,target:7,deliveryAvailable:true,reward:null}});
  const japoriQuest=s=>s.quests?.japori||initialQuests().japori;
  // Passenger state is separate from mercenary crew. Resolve source locations
  // lazily so older saves remain byte-for-byte compatible until boarding.
  function jarekQuest(s){return s.version===2?(s.quests?.jarek||{origin:s.systems.find(x=>x.special==='AMBASSADORJAREK')?.id??null,target:s.destinations.devidia,resolvedByCorps:false}):null;}
  const occupiedQuarters=s=>(s.ship.crew?s.ship.crew.filter(Boolean).length:1+(s.ship.hiredCrew||[]).length)+(s.jarekStatus===1?1:0)+(s.wildStatus===1?1:0);
  function jarekAvailable(s){
    const q=jarekQuest(s);if(!q||s.ended||s.trip||s.encounter||s.pending)return null;
    if(s.current===q.origin&&(s.jarekStatus||0)===0&&!q.resolvedByCorps&&s.systems[s.current].special==='AMBASSADORJAREK'&&s.policeScore>=-5&&Campaigns.openQuests(s)<=3)return 'offer';
    if(s.current===q.target&&s.jarekStatus===1&&s.systems[s.current].special==='JAREKGETSOUT')return 'delivery';return null;
  }
  function openJarek(s){requireDocked(s);const step=jarekAvailable(s);if(!step)throw Error('No Jarek mission event is available here.');s.pending={kind:'passenger',step};}
  function respondJarek(s,decision){
    const p=s.pending,q=jarekQuest(s);if(p?.kind!=='passenger'||!q||s.ended)throw Error('No Jarek dialogue is open.');
    if(p.step==='offer'){
      if(decision==='no'){s.pending=null;return;}if(decision!=='yes')throw Error('Accept or decline the mission.');
      if(s.current!==q.origin||(s.jarekStatus||0)!==0||s.policeScore<-5||q.resolvedByCorps||s.systems[s.current].special!=='AMBASSADORJAREK')throw Error('This mission is not available.');
      if(occupiedQuarters(s)>=T[s.ship.type].crewQuarters)throw Error('Jarek needs one empty crew quarter. Buy a larger ship or dismiss a mercenary.');
      s.quests.jarek=copy(q);s.jarekStatus=1;s.systems[s.current].special=null;s.pending={kind:'passenger',step:'boarded'};
      log(s,`Ambassador Jarek boarded for ${s.systems[q.target].name}. One crew quarter reserved; no wages or cargo space required.`);return;
    }
    if(decision!=='continue')throw Error('Choose Continue.');
    if(p.step==='delivery'){
      if(s.current!==q.target||s.jarekStatus!==1||s.systems[s.current].special!=='JAREKGETSOUT')throw Error('No Jarek delivery is due here.');
      recordPortNews(s);s.jarekStatus=2;s.systems[s.current].special=null;recalculateBuyPrices(s);s.pending={kind:'passenger',step:'reward'};
      log(s,`Delivered Ambassador Jarek at ${s.systems[q.target].name}. Received a haggling computer: effective trader skill +1 and one crew quarter released.`);return;
    }
    if(['boarded','reward'].includes(p.step)){s.pending=null;return;}throw Error('Invalid Jarek dialogue.');
  }
  function sendJarekHome(s){
    if(s.jarekStatus!==1)return false;s.jarekStatus=0;s.quests.jarek.resolvedByCorps=true;
    log(s,`Space Corps returned Jarek to ${s.systems[jarekQuest(s).target].name}. No haggling computer awarded; assignment closed.`);return true;
  }
  // Ship.totalCargoBays reserves ten bays rather than adding ordinary MEDICINE.
  const cargoCapacity=s=>T[s.ship.type].cargoBays+5*(s.ship.gadgets||[]).filter(id=>id==='EXTRABAYS').length-(japoriQuest(s).status===1?10:0)-(s.reactorStatus>0&&s.reactorStatus<21?15-int((s.reactorStatus-1)/2):0);
  const hullMaximum=(s,ship=s.ship)=>T[ship.type].hullStrength+(ship===s.ship&&s.scarabStatus===3?50:0);
  const fuelMaximum=(s,ship=s.ship)=>(ship.gadgets||[]).includes('FUELCOMPACTOR')?18:T[ship.type].fuelTanks;
  // Source CrewMember.hirePrice / GameState.mercenaryMoney. Keep legacy fee
  // fixtures until a roster is managed; actual hired crew determine wages.
  function hirePrice(s,merc){return merc.id===30&&s.wildStatus===2?0:Object.values(merc.skills).reduce((a,b)=>a+b,0)*3;}
  function mercenaryMoney(s){return s.ship.hiredCrew?s.ship.hiredCrew.reduce((n,m)=>n+hirePrice(s,m),0):(s.mercenaryCost||0);}
  // Ship.currentPriceWithoutCargo(true), used for premiums and claims: exclude
  // cargo, retain hull/fuel deductions and equipment resale values.
  function insuranceValue(s){return Yard.tradeIn(s,true)-Object.values(s.costBasis).reduce((a,b)=>a+b,0);}
  function insuranceMoney(s){return s.insurance===undefined?(s.insuranceCost||0):s.insurance?Math.max(1,int(int(insuranceValue(s)*5/2000)*(100-Math.min(s.noClaim||0,90))/100)):0;}
  function availableMoney(s){return Math.max(0,s.credits-(s.reserveMoney?mercenaryMoney(s)+insuranceMoney(s):0));}
  function buyCargo(s,system,good,amount){
    if(!G[good]||!Number.isInteger(amount)||amount<1)throw Error('Choose a positive whole quantity.');
    const price=s.prices.buy[good],bays=cargoCapacity(s)-filled(s.ship)-(s.leaveEmpty||0);
    if(s.debt>100000)throw Error('Your debt is too large to buy goods.');
    if(system.qty[good]<=0||price<=0)throw Error('These goods are not available here.');
    if(bays<=0)throw Error('No empty cargo bays.');
    if(availableMoney(s)<price)throw Error('Not enough credits.');
    const n=Math.min(amount,system.qty[good],bays,int(availableMoney(s)/price));
    s.ship.cargo[good]+=n;s.credits-=n*price;s.costBasis[good]+=n*price;system.qty[good]-=n;
    return {quantity:n,total:n*price};
  }
  // SELL branch of GameState.sellCargo; disposal shares its proportional basis rule.
  function sellCargo(s,good,amount){
    if(!G[good]||!Number.isInteger(amount)||amount<1)throw Error('Choose a positive whole quantity.');
    const old=s.ship.cargo[good],price=s.prices.sell[good];
    if(old<=0)throw Error('You have none of these goods.');
    if(price<=0)throw Error('This system is not interested in these goods.');
    const n=Math.min(amount,old),oldCost=s.costBasis[good];
    s.costBasis[good]=int(oldCost*(old-n)/old);
    s.ship.cargo[good]-=n;s.credits+=n*price;
    return {quantity:n,total:n*price,profit:n*price-(oldCost-s.costBasis[good])};
  }
  // Original scoop chooses one random good, rerolling expensive goods once.
  function rollLoot(difficulty,rng){
    if(difficulty>=2&&rng.get(difficulty)!==1)return null;
    let g=D.goods[rng.get(10)];if(g.ordinal>=5)g=D.goods[rng.get(10)];return g.id;
  }
  function plunderCargo(s,good,amount){
    if(!G[good]||!Number.isSafeInteger(amount)||amount<1)throw Error('Choose a positive whole quantity.');
    const o=s.encounter?.opponent;if(!o||o.cargo[good]<=0)throw Error('The opponent has none of these goods.');
    const n=Math.min(amount,o.cargo[good],cargoCapacity(s)-filled(s.ship));if(n<=0)throw Error('No empty cargo bays.');
    s.ship.cargo[good]+=n;o.cargo[good]-=n;return n; // Free goods leave existing cost basis unchanged.
  }
  function disposalQuote(s,good,amount,operation){
    if(!G[good]||!Number.isSafeInteger(amount)||amount<1||!['dump','jettison'].includes(operation))throw Error('Choose a positive whole quantity.');
    if(s.ship.cargo[good]<=0)throw Error('You have none of these goods.');
    const unit=operation==='dump'?5*(s.difficulty+1):0;
    // Correct the original dump-all multiplication/division order: never spend
    // more than the available cash, including reserved wages and premiums.
    const quantity=Math.min(amount,s.ship.cargo[good],unit?int(availableMoney(s)/unit):2147483647);
    if(quantity<=0)throw Error('Not enough available credits to dump a cargo bay.');
    return {operation,good,quantity,total:unit*quantity};
  }
  function discardCargo(s,good,amount,operation,rng){
    const q=disposalQuote(s,good,amount,operation),old=s.ship.cargo[good];
    if(operation==='jettison'&&!rng)throw Error('Jettison requires the saved random generator.');
    s.costBasis[good]=int(s.costBasis[good]*(old-q.quantity)/old);s.ship.cargo[good]-=q.quantity;s.credits-=q.total;
    const caught=operation==='jettison'&&rng.get(10)<s.difficulty+1;
    if(caught){s.policeScore=s.policeScore>-5?-5:s.policeScore-1;addNewsEvent(s,'CAUGHTLITTERING');}
    return {...q,caught};
  }
  function openDisposal(s){
    let returnTo=null;
    if(s.pending&&['scoop','plunder'].includes(s.pending.kind))returnTo=copy(s.pending);
    else requireDocked(s);
    s.pending={kind:'disposal',step:'list',operation:s.trip?'jettison':'dump',returnTo};
  }
  function reviewDisposal(s,good,amount){
    const p=s.pending;if(p?.kind!=='disposal'||p.step!=='list')throw Error('No cargo disposal screen is open.');
    const quote=disposalQuote(s,good,amount,p.operation),warning=p.operation==='jettison'&&s.policeScore>-5&&!s.litterWarning;
    if(warning)s.litterWarning=true; // Source records this even if the warning is cancelled.
    s.pending={...p,step:'review',quote,warning};
  }
  function respondDisposal(s,yes){
    const p=s.pending;if(p?.kind!=='disposal'||typeof yes!=='boolean')throw Error('No cargo disposal decision is open.');
    if(p.step==='list'){s.pending=p.returnTo;return;}
    if(p.step==='complete'||!yes){s.pending={kind:'disposal',step:'list',operation:p.operation,returnTo:p.returnTo};return;}
    if(p.step!=='review')throw Error('Invalid disposal step.');
    const q=disposalQuote(s,p.quote.good,p.quote.quantity,p.operation);
    if(JSON.stringify(q)!==JSON.stringify(p.quote))throw Error('The cargo disposal quote has changed.');
    const outcome=withRandom(s,rng=>discardCargo(s,q.good,q.quantity,q.operation,rng));
    s.pending={kind:'disposal',step:'complete',operation:p.operation,returnTo:p.returnTo,outcome};
    log(s,`${q.operation==='dump'?'Dumped':'Jettisoned'} ${q.quantity} ${G[q.good].label.toLowerCase()}${q.total?` for ${q.total} credits`:''}.${outcome.caught?' Police caught you littering; your record worsened.':''}`);
  }
  function takePlunder(s,good,amount){
    if(s.pending?.kind!=='plunder'||s.encounter?.state!=='SURRENDER')throw Error('No plunder screen is open.');
    const n=plunderCargo(s,good,amount);s.pending.taken+=n;log(s,`Plundered ${n} ${G[good].label.toLowerCase()}.`);return n;
  }
  function finishPlunder(s){
    if(s.pending?.kind!=='plunder')throw Error('No plunder screen is open.');
    const n=s.pending.taken;if(s.encounter?.kind==='MARIECELESTE'&&s.ship.cargo.NARCOTICS>s.encounter.narcsBefore)s.justLootedMarie=true;log(s,`Plundered ${n} cargo bays.`);pass(s);
  }
  function respondScoop(s,pick){
    const p=s.pending;if(p?.kind!=='scoop'||typeof pick!=='boolean')throw Error('No canister is waiting.');
    if(pick&&filled(s.ship)>=cargoCapacity(s))throw Error('No empty bay. Jettison cargo or leave the canister.');
    if(pick)s.ship.cargo[p.good]++;
    log(s,pick?`Recovered one bay of ${G[p.good].label.toLowerCase()}.`:'Left the canister.');pass(s);
  }
  function buyFuel(s,budget){
    const t=T[s.ship.type],amount=Math.min(budget,(fuelMaximum(s)-s.ship.fuel)*t.costOfFuel,s.credits);
    const n=int(amount/t.costOfFuel);s.ship.fuel+=n;s.credits-=n*t.costOfFuel;return n;
  }
  function buyRepairs(s,budget){
    const t=T[s.ship.type],amount=Math.min(budget,(hullMaximum(s)-s.ship.hull)*t.repairCosts,s.credits);
    const n=int(amount/t.repairCosts);s.ship.hull+=n;s.credits-=n*t.repairCosts;return n;
  }
  // Original TravelTask arrival service block: fuel first, then repairs. If fuel
  // cannot be filled, skip requested repairs rather than spend the last credits.
  function automaticServices(s){
    if(!s.autoFuel&&!s.autoRepair)return null;
    const t=T[s.ship.type],before=s.credits;
    const result={autoFuel:!!s.autoFuel,autoRepair:!!s.autoRepair,fuel:0,repair:0,cost:0,warning:null};
    let tryAutoRepair=true;
    if(s.autoFuel){
      result.fuel=buyFuel(s,fuelMaximum(s)*t.costOfFuel);
      if(s.ship.fuel<fuelMaximum(s)){
        result.warning=s.autoRepair&&s.ship.hull<hullMaximum(s)?'both':'fuel';
        if(result.warning==='both')tryAutoRepair=false;
      }
    }
    if(s.autoRepair&&tryAutoRepair){
      result.repair=buyRepairs(s,hullMaximum(s)*t.repairCosts);
      if(s.ship.hull<hullMaximum(s))result.warning='repair';
    }
    result.cost=before-s.credits;return result;
  }
  function payInterest(s){
    if(s.debt<=0)return;
    const interest=Math.max(1,int(s.debt/10));
    if(s.credits>interest)s.credits-=interest;
    else{s.debt+=interest-s.credits;s.credits=0;}
  }
  const distance=(a,b)=>Math.round(Math.sqrt((a.x-b.x)**2+(a.y-b.y)**2));
  function effectiveSkill(ship,key,difficulty,questState={}){
    let value=Math.max(...(ship.crew?ship.crew.filter(Boolean).map(c=>c.skills[key]):[ship.skills[key],...(ship.hiredCrew||[]).map(c=>c.skills[key])]));
    const has=id=>(ship.gadgets||[]).includes(id);
    if(key==='pilot')value+=(has('NAVIGATINGSYSTEM')?3:0)+(has('CLOAKINGDEVICE')?2:0);
    if(key==='fighter'&&has('TARGETINGSYSTEM'))value+=3;
    if(key==='engineer'&&has('AUTOREPAIRSYSTEM'))value+=3;
    if(key==='trader'&&questState.jarekStatus>=2)value++;
    return Math.max(1,value+(difficulty<2?1:difficulty>3?-1:0));
  }
  const cloaked=(ship,other,difficulty)=>(ship.gadgets||[]).includes('CLOAKINGDEVICE')&&effectiveSkill(ship,'engineer',difficulty)>effectiveSkill(other,'engineer',difficulty);
  function wormholeTarget(s,id=s.current){const i=s.wormholes?.indexOf(id)??-1;return i<0?null:s.wormholes[(i+1)%6];}
  const wormholeExists=(s,a,b)=>wormholeTarget(s,a)===b;
  const travelCost=(s,id)=>({fuel:wormholeExists(s,s.current,id)?0:distance(s.systems[s.current],s.systems[id]),fee:wormholeExists(s,s.current,id)?25*T[s.ship.type].costOfFuel:0});
  function routeTo(s,id){
    if(id===s.current)return [];
    const queue=[s.current],prev=new Map([[s.current,null]]),range=fuelMaximum(s);
    for(let i=0;i<queue.length;i++){const a=queue[i];for(const b of s.systems){if(prev.has(b.id)||distance(s.systems[a],b)>range&&!wormholeExists(s,a,b.id))continue;prev.set(b.id,a);queue.push(b.id);if(b.id===id){const path=[];let n=id;while(n!==s.current){path.unshift(n);n=prev.get(n);}return path;}}}return null;
  }
  // Source showAveragePricesPage: standard destination selling prices, not a prediction of random arrival prices.
  function averagePrices(s,id){const target=s.systems[id];if(!target)throw Error('Choose a system.');return D.goods.map(g=>{const price=standardPrice(g,target.size,target.tech,target.government,target.visited?target.resource:'NOSPECIALRESOURCES'),buy=s.prices.buy[g.id];return {id:g.id,price,difference:price>0&&buy>0?price-buy:null,profitable:price>buy&&buy>0&&s.systems[s.current].qty[g.id]>0};});}
  const newsOrder=['CAPTAINHUIEATTACKED','EXPERIMENTPERFORMED','CAPTAINHUIEDESTROYED','CAPTAINAHABATTACKED','CAPTAINAHABDESTROYED','CAPTAINCONRADATTACKED','CAPTAINCONRADDESTROYED','MONSTERKILLED','WILDARRESTED','MONSTERNOTKILLED','SCARABNOTDESTROYED','EXPERIMENTSTOPPED','EXPERIMENTNOTSTOPPED','DRAGONFLY','SCARAB','FLYBARATAS','FLYMELINA','FLYREGULAS','DRAGONFLYNOTDESTROYED','DRAGONFLYDESTROYED','SCARABDESTROYED','MEDICINEDELIVERY','JAPORIDISEASE','ARTIFACTDELIVERY','JAREKGETSOUT','WILDGETSOUT','GEMULONRESCUED','GEMULONNOTRESCUED','ALIENINVASION','ARRIVALVIASINGULARITY','CAUGHTLITTERING'];
  function addNewsEvent(s,id){if(!newsOrder.includes(id))throw Error('Unknown news event.');s.newsEvents??=[];if(s.newsEvents.length<4)s.newsEvents.push(id);}
  function portNewsEvent(s){const id=s.systems[s.current].special,conditions={MONSTERKILLED:s.monsterStatus===2,DRAGONFLY:!Campaigns.reason(s,id),SCARAB:!Campaigns.reason(s,id),SCARABDESTROYED:s.scarabStatus===2,FLYBARATAS:s.dragonflyStatus===1,FLYMELINA:s.dragonflyStatus===2,FLYREGULAS:s.dragonflyStatus===3,DRAGONFLYDESTROYED:s.dragonflyStatus===5,MEDICINEDELIVERY:japoriQuest(s).status===1,ARTIFACTDELIVERY:!!s.artifactOnBoard,JAPORIDISEASE:japoriQuest(s).status===0,JAREKGETSOUT:s.jarekStatus===1,WILDGETSOUT:s.wildStatus===1,GEMULONRESCUED:s.invasionStatus>0&&s.invasionStatus<8,ALIENINVASION:true,EXPERIMENTSTOPPED:s.experimentStatus>0&&s.experimentStatus<12,EXPERIMENTNOTSTOPPED:true};if(conditions[id])return id;if(id==='DRAGONFLYDESTROYED'&&s.dragonflyStatus===4)return 'DRAGONFLYNOTDESTROYED';if(id==='GEMULONINVADED')return 'GEMULONNOTRESCUED';return null;}
  function recordPortNews(s){const id=portNewsEvent(s);if(id&&!(s.newsEvents||[]).includes(id))addNewsEvent(s,id);}
  function newsStories(s){const events=s.newsEvents?.slice()||[],current=portNewsEvent(s);if(current&&!events.includes(current)&&events.length<4)events.push(current);const destinations={FLYMELINA:'melina',FLYREGULAS:'regulas',DRAGONFLYNOTDESTROYED:'zalkon',JAPORIDISEASE:'japori',WILDGETSOUT:'kravat',ALIENINVASION:'gemulon'};return newsOrder.filter(id=>events.includes(id)).map(id=>({id,text:D.text['newsevent_'+id.toLowerCase()],args:id==='CAUGHTLITTERING'?[s.commanderName||'Commander']:destinations[id]?[s.systems[s.destinations?.[destinations[id]]??japoriQuest(s).target]?.name||'']:[]}));}
  const optionKeys=['ignorePolice','ignorePirates','ignoreTraders','ignoreOrbitTrade','zoomGalaxy','trackLongPress','showTrackedRange','showTargetInfo','showWarpCosts','autoNews','continuousAttack','continuousFlee','showLoans','alwaysInfo','attackFleeing','volumeScroll','recallScreens','trackAutoOff','encounterAnim','remindLoans','sharePreferences','identifyStartup','extraShortcuts'];
  function setGameOption(s,id,value){if(!optionKeys.includes(id)||typeof value!=='boolean')throw Error('Invalid game option.');s.options??={};s.options[id]=value;}
  function totalWeapons(ship,min=null,max=null){
    let sum=0;
    for(const id of ship.weapons){
      if(!id)break;const w=W[id];
      if(min&&w.ordinal<W[min].ordinal||max&&w.ordinal>W[max].ordinal)continue;
      sum+=w.power;
    }return sum;
  }
  // GameState.executeAttack, lines 5506–5599. Uses effective crew skills as input.
  // Scarab and reactor damage branches are retained and included in parity tests.
  function executeAttack(attacker,defender,flees,commanderUnderAttack,difficulty,rng,quest={}){
    if(difficulty===0&&commanderUnderAttack&&flees)return false;
    const skill=(s,k)=>s.effectiveSkills?s.effectiveSkills[k]:effectiveSkill(s,k,difficulty);
    if(rng.get(skill(attacker,'fighter')+T[defender.type].size)<(flees?2:1)*rng.get(5+(skill(defender,'pilot')>>1)))return false;
    let damage;
    if(totalWeapons(attacker)<=0)damage=0;
    else if(defender.type==='SCARAB'){
      const power=totalWeapons(attacker,'PULSE','PULSE')+totalWeapons(attacker,'MORGAN','MORGAN');
      damage=power<=0?0:rng.get(int(power*(100+2*skill(attacker,'engineer'))/100));
    }else damage=rng.get(int(totalWeapons(attacker)*(100+2*skill(attacker,'engineer'))/100));
    if(damage<=0)return false;
    if(commanderUnderAttack&&quest.reactorStatus>0&&quest.reactorStatus<21)damage=int(damage*(1+(difficulty+1)*(difficulty<2?0.25:0.33)));
    for(let i=0;i<defender.shields.length;i++){
      if(!defender.shields[i])break;
      if(damage<=defender.shieldStrength[i]){defender.shieldStrength[i]-=damage;damage=0;break;}
      damage-=defender.shieldStrength[i];defender.shieldStrength[i]=0;
    }
    if(damage>0){
      damage-=rng.get(skill(defender,'engineer'));if(damage<=0)damage=1;
      const maxHull=T[defender.type].hullStrength+(commanderUnderAttack&&quest.scarabStatus===3?50:0);
      damage=Math.min(damage,int(maxHull/(commanderUnderAttack?Math.max(1,4-difficulty):2)));
      defender.hull=Math.max(0,defender.hull-damage);
    }
    return true;
  }
  function canEscape(ship,opponent,difficulty,rng){
    if(difficulty===0)return true;
    const sk=(s,k)=>s.effectiveSkills?s.effectiveSkills[k]:effectiveSkill(s,k,difficulty);
    return (rng.get(7)+int(sk(ship,'pilot')/3))*2>=rng.get(sk(opponent,'pilot'))*(2+difficulty);
  }
  function enemyPrice(ship,difficulty){
    let price=T[ship.type].price;
    for(const id of ship.weapons)if(id)price+=W[id].price;
    for(const id of ship.shields)if(id)price+=H[id].price;
    const sk=k=>effectiveSkill(ship,k,difficulty);
    return int(price*(2*sk('pilot')+sk('engineer')+3*sk('fighter'))/60);
  }
  const bounty=(ship,difficulty)=>clamp(int(int(enemyPrice(ship,difficulty)/200)/25)*25,25,2500);

  // Ordinary doWarp: wages charged once, before travel and interest. Directed
  // wormholes also charge the original tax and consume no fuel.
  function warpCore(s,origin,target){
    if(s.debt>100000)throw Error('Your debt is too large to travel.');
    const viaWormhole=wormholeExists(s,origin.id,target.id),wages=mercenaryMoney(s),premium=insuranceMoney(s),fees=wages+premium+(viaWormhole?25*T[s.ship.type].costOfFuel:0);
    if(fees>s.credits)throw Error('Not enough credits to pay departure costs.');
    s.credits-=fees;
    if(s.ship.hiredCrew?.length)log(s,`Paid ${wages} credits in crew wages for departure to ${target.name}.`);
    if(s.insurance)log(s,`Paid ${premium} credits in ship insurance for departure to ${target.name}.`);
    for(let i=0;i<s.ship.shields.length;i++){if(!s.ship.shields[i])break;s.ship.shieldStrength[i]=H[s.ship.shields[i]].power;}
    origin.countDown=3+s.difficulty;
    if(!viaWormhole)s.ship.fuel-=Math.min(distance(origin,target),s.ship.fuel);
    s.voyageRules=1;s.arrivedViaWormhole=viaWormhole;if(s.litterWarning!==undefined)s.litterWarning=false;
    s.newsEvents=[];payInterest(s);s.days++;Campaigns.advanceDays(s,1);
    if(s.insurance)s.noClaim=(s.noClaim||0)+1;
    if(s.days%3===0&&s.policeScore>0)s.policeScore--;
    if(s.policeScore< -5){if(s.difficulty<=2||s.days%s.difficulty===0)s.policeScore++;}
    s.trip={target:target.id,clicks:21,raided:false,...(s.version===2?{inspected:false}:{})};if(s.version===2)s.encounterRules=2;
  }

  const fixture=[
    ['Acamar',6,8,4,'CONFEDERACY',2,'RICHSOIL','UNEVENTFUL'],
    ['Baratas',15,8,5,'CAPITALIST',3,'MINERALRICH','UNEVENTFUL'],
    ['Melina',24,10,6,'CORPORATE',3,'ARTISTIC','BOREDOM'],
    ['Regulas',32,15,7,'TECHNOCRACY',4,'LOTSOFWATER','UNEVENTFUL'],
    ['Zalkon',20,21,2,'FEUDAL',2,'RICHFAUNA','COLD'],
    ['Kravat',9,23,5,'ANARCHY',2,'WEIRDMUSHROOMS','UNEVENTFUL'],
    ['Gemulon',33,27,5,'DEMOCRACY',3,'LOTSOFHERBS','PLAGUE'],
    ['Japori',42,22,5,'MILITARY',3,'WARLIKE','WAR']
  ];
  function makeShip(type,skills={pilot:5,fighter:5,trader:5,engineer:5}){
    return {type,skills:{...skills},hull:T[type].hullStrength,fuel:T[type].fuelTanks,cargo:zeros(),weapons:['PULSE'],shields:[],shieldStrength:[]};
  }
  function log(s,text){s.log.unshift({day:s.days,text});s.log=s.log.slice(0,80);}
  function newFixtureGame(seed=2000,difficulty=2){
    const rng=new JavaRandom(seed);
    const systems=fixture.map(([name,x,y,tech,government,size,resource,status],id)=>{
      const sys={id,name,x,y,tech,government,size,resource,status,countDown:0,visited:id===0};
      sys.qty=initializeQuantities(sys,difficulty,rng);return sys;
    });
    const s={version:1,seed,difficulty,autoFuel:false,autoRepair:false,credits:1000,debt:0,days:0,current:0,policeScore:0,reputation:0,pirateKills:0,leaveEmpty:0,reserveMoney:false,ship:makeShip('GNAT'),costBasis:zeros(),systems,quests:initialQuests(),trip:null,encounter:null,pending:null,ended:false,log:[]};
    s.prices=determinePrices(systems[0],effectiveSkill(s.ship,'trader',difficulty,s),s.policeScore,rng);
    s.rng=rng.toJSON();log(s,'Commander aboard a Gnat. Buy goods, choose a nearby system, and trade.');return s;
  }
  const Gen=createGenerators(D,{initializeQuantities,distance,makeShip,japoriQuest});
  const Enc=createEncounters(D,{totalWeapons,effectiveSkill,cloaked,filled,japoriQuest,currentWorth:Gen.currentWorth});
  const Yard=createYard(D,{effectiveSkill,availableMoney,filled,cargoCapacity,makeShip,occupiedQuarters,hullMaximum,fuelMaximum});
  const Campaigns=createCampaigns(D,{japoriQuest,cargoCapacity,filled,occupiedQuarters,availableMoney,requireDocked,withRandom,increaseRandomSkill,makeShip,log,addNewsEvent,recordPortNews,finishGame:(s,status)=>Finish.finish(s,status),currentWorth:Gen.currentWorth});
  const Finish=createFinishing(D,{effectiveSkill,generateOpponent:Gen.opponent,log,increaseRandomSkill,recalculateBuyPrices,currentWorth:Gen.currentWorth,requireDocked});
  function updatePurchaseTransfers(s,transfers){const p=s.pending;if(p?.kind!=='purchase'||p.step!=='review'||p.request.type!=='ship')throw Error('No ship purchase review is open.');const request={...p.request,transfers},quote=Yard.quote(s,request);if(quote.reason)throw Error(quote.reason);s.pending={...p,request,quote};}
  function openPurchase(s,request){requireDocked(s);const quote=Yard.quote(s,request);if(quote.reason)throw Error(quote.reason);s.pending={kind:'purchase',step:'review',request:copy(request),quote};}
  function respondPurchase(s,confirm){
    const p=s.pending;if(p?.kind!=='purchase')throw Error('No purchase is open.');
    if(typeof confirm!=='boolean')throw Error('Confirm or cancel this purchase.');
    if(p.step==='complete'||!confirm){s.pending=null;return;}
    const q=Yard.quote(s,p.request);if(q.reason)throw Error(q.reason);if(JSON.stringify(q)!==JSON.stringify(p.quote))throw Error('The purchase quote changed. Cancel and review it again.');
    Yard.execute(s,q);const item=q.type==='ship'?T[q.id]:Yard.tables[q.category].find(x=>x.id===q.id);
    const text=q.type==='ship'?`Traded for a ${item.label}. ${q.price<0?'Received':'Paid'} ${Math.abs(q.price)} credits. Full hull and fuel; no equipment installed.`:q.type==='buy'?`Installed ${item.label} for ${q.price} credits.`:`Sold ${item.label} for ${q.price} credits.`;
    s.pending={kind:'purchase',step:'complete',title:q.type==='ship'?'Ship purchased':q.type==='buy'?'Equipment installed':'Equipment sold',text};log(s,text);
  }
  function newGame(seed=2000,difficulty=2,options={}){
    if(!Number.isSafeInteger(seed)||!Number.isInteger(difficulty)||difficulty<0||difficulty>4)throw Error('Choose a whole-number seed and a valid difficulty.');
    if(options.skills&&(Object.keys(options.skills).length!==4||!['pilot','fighter','trader','engineer'].every(k=>Number.isInteger(options.skills[k])&&options.skills[k]>=1&&options.skills[k]<=10)||Object.values(options.skills).reduce((a,b)=>a+b,0)!==20))throw Error('Allocate exactly twenty skill points, with each skill from one to ten.');
    const rng=new JavaRandom(seed),world=Gen.galaxy(rng,difficulty,!!options.randomQuestSystems);
    const origin=world.systems.find(x=>x.special==='JAPORIDISEASE').id;
    const s={version:2,encounterRules:2,worldMode:'generated',seed,difficulty,randomQuestSystems:!!options.randomQuestSystems,autoFuel:options.autoFuel===true,autoRepair:options.autoRepair===true,credits:1000,debt:0,days:0,policeScore:0,reputation:0,pirateKills:0,leaveEmpty:0,reserveMoney:false,ship:makeShip('GNAT',options.skills||{pilot:5,fighter:5,trader:5,engineer:5}),costBasis:zeros(),...world,quests:{japori:{status:0,origin,target:world.destinations.japori,deliveryAvailable:true,reward:null}},trip:null,encounter:null,pending:null,ended:false,log:[]};
    // Port default (not the original's): Back steps through earlier screens instead of leaving the app.
    s.options={recallScreens:true};
    if(options.ignoreTraders===true)s.options.ignoreTraders=true;
    if(options.commanderName)s.commanderName=options.commanderName.trim();if(options.skills)s.mercenaries[0].skills={...s.ship.skills};
    s.systems[s.current].visited=true;
    if(difficulty<2&&s.systems[s.current].special===null)s.systems[s.current].special='LOTTERYWINNER';
    s.prices=determinePrices(s.systems[s.current],effectiveSkill(s.ship,'trader',difficulty,s),0,rng);
    s.rng=rng.toJSON();log(s,`Commander aboard a Gnat at ${s.systems[s.current].name}. A galaxy of 120 systems awaits.`);return s;
  }
  function withRandom(s,fn){const rng=new JavaRandom(s.rng,true);const result=fn(rng);s.rng=rng.toJSON();return result;}
  function requireDocked(s){if(s.ended)throw Error('Start a new game to continue.');if(s.trip||s.encounter||s.pending)throw Error('Finish your journey first.');}
  function arrive(s,rng,service=true,uneventful=false){
    const target=s.trip.target;s.current=target;
    for(const sys of s.systems){shuffleStatus(sys,rng);changeQuantities(sys,s.difficulty,rng);}
    s.systems[target].visited=true;recordPortNews(s);
    s.prices=determinePrices(s.systems[target],effectiveSkill(s.ship,'trader',s.difficulty,s),s.policeScore,rng);
    const effects=service?Campaigns.arrivalEffects(s,rng):{notes:[],meltdown:false};
    if(service&&s.voyageRules===1&&!effects.meltdown){const before=s.ship.hull;s.ship.hull=Math.min(hullMaximum(s),s.ship.hull+rng.get(effectiveSkill(s.ship,'engineer',s.difficulty,s)));if(s.ship.hull>before)effects.notes.push(`Your engineer repaired ${s.ship.hull-before} hull points on arrival.`);}
    if(effects.meltdown){s.encounter=null;if(s.escapePod){s.pending={kind:'recovery',step:'activated',alreadyArrived:true,cause:'reactor',claimHull:effects.claimHull};}else{s.trip=null;s.pending=null;log(s,'Ship destroyed in reactor meltdown.');Finish.finish(s,'KILLED');s.endDialog='meltdown';}return;}
    const services=service?automaticServices(s):null;
    s.trip=null;s.encounter=null;s.pending={kind:'arrival',target,...(uneventful?{uneventful}:{}),...(services?{services}:{}),...(effects.notes.length?{notes:effects.notes}:{})};log(s,`Arrived at ${s.systems[target].name}.`);
    if(services)log(s,`Automatic services: ${services.fuel} pc fuel, ${services.repair} hull points; ${services.cost} credits.${services.warning?' Insufficient credits for full service.':''}`);
  }
  // Original engineer repairs and 20 travel checks. Generated worlds use ordinary pirate, police and trader selection.
  // Older in-progress journeys keep their previous selection until departure.
  function continueTravel(s,rng){
    if(!s.trip||s.encounter||s.pending||s.ended)return;
    const startClicks=s.trip.clicks;s.trip.clicks--;
    while(s.trip.clicks>0){
      let repairs=rng.get(effectiveSkill(s.ship,'engineer',s.difficulty))>>1;
      s.ship.hull+=repairs;
      if(s.ship.hull>hullMaximum(s)){repairs=s.ship.hull-hullMaximum(s);s.ship.hull=hullMaximum(s);}else repairs=0;
      repairs*=2;
      for(let i=0;i<s.ship.shields.length;i++){
        if(!s.ship.shields[i])break;
        s.ship.shieldStrength[i]+=repairs;
        const cap=H[s.ship.shields[i]].power;
        if(s.ship.shieldStrength[i]>cap){repairs=s.ship.shieldStrength[i]-cap;s.ship.shieldStrength[i]=cap;}else repairs=0;
      }
      const boss=Campaigns.boss(s);if(boss){const opponent=Campaigns.specialOpponent(s,boss);s.encounter={kind:boss,opponent,state:cloaked(s.ship,opponent,s.difficulty)?'IGNORE':'ATTACK',round:0};log(s,T[boss].label+' encountered.');return;}
      const target=s.systems[s.trip.target];
      let mantis=false,kindOverride=null,test=0;
      if(target.id===s.destinations?.gemulon&&s.invasionStatus>7)mantis=rng.get(10)>4;
      else{test=rng.get(44-2*s.difficulty);if(s.ship.type==='FLEA')test*=2;
        const ordinary=Enc.classify(test,P[target.government],s.policeScore,s.trip.raided);
        if(!ordinary&&s.wildStatus===1&&target.id===s.destinations.kravat){if(rng.get(100)<(s.difficulty<=1?25:s.difficulty===2?33:50))kindOverride='POLICE';}
        if(!ordinary&&!kindOverride&&s.artifactOnBoard)mantis=rng.get(20)<=3;
      }
      if(mantis){const opponent=Gen.opponent(s,'MANTIS',rng);s.encounter={kind:'MANTIS',opponent,state:cloaked(s.ship,opponent,s.difficulty)?'IGNORE':'ATTACK',round:0};log(s,'Mantis ship encountered.');return;}
      if(s.encounterRules===2){
        const kind=target.id===s.destinations?.gemulon&&s.invasionStatus>7?null:kindOverride||Enc.classify(test,P[target.government],s.policeScore,s.trip.raided);
        if(kind){const opponent=Gen.opponent(s,kind,rng),selection=Enc.state(s,kind,opponent,rng);if(selection.skip){s.trip.clicks--;continue;}
          s.encounter={kind,opponent,state:selection.state,round:0};log(s,`${kind==='POLICE'?'Police':kind==='TRADER'?'A trader':'A pirate'} ${T[opponent.type].label} encountered.`);return;}
      }else{
      if(test<P[target.government].strengthPirates&&!s.trip.raided){
        const opponent=s.version===2?Gen.opponent(s,'PIRATE',rng):makeShip('GNAT',{pilot:3,fighter:3,trader:3,engineer:3});
        let state=cloaked(s.ship,opponent,s.difficulty)?'IGNORE':T[opponent.type].ordinal>=7||rng.get(1500)>int(s.reputation*4/(1+T[opponent.type].ordinal))?'ATTACK':'FLEE';
        if(state==='FLEE'&&T[opponent.type].ordinal>T[s.ship.type].ordinal)state='ATTACK';
        if((state==='IGNORE'||state==='FLEE')&&cloaked(opponent,s.ship,s.difficulty)){s.trip.clicks--;continue;}
        s.encounter={opponent,state,round:0};log(s,`A pirate ${T[opponent.type].label} intercepts your journey.`);return;
      }
      }
      if(s.voyageRules===1&&Finish.roll(s,rng))return;
      s.trip.clicks--;
    }
    if(s.justLootedMarie){s.justLootedMarie=false;s.trip.clicks++;s.encounter={kind:'POLICE',postMarie:true,opponent:Gen.opponent(s,'POLICE',rng),state:'INSPECTION',round:0};log(s,'Customs police intercepted you after boarding the Marie Celeste.');return;}
    arrive(s,rng,true,startClicks>20);
  }
  function beginTravel(s,id){
    requireDocked(s);const origin=s.systems[s.current],target=s.systems[id];
    if(!target||id===s.current)throw Error('Choose another system.');
    if(!wormholeExists(s,origin.id,target.id)&&distance(origin,target)>s.ship.fuel)throw Error('Not enough fuel to reach this system.');
    if(s.wildStatus===1&&!Campaigns.armed(s))throw Error('Wild refuses to travel without a Beam laser or better. Install a weapon or let him leave on Quests.');
    warpCore(s,origin,target);withRandom(s,rng=>Campaigns.onDeparture(s,rng));log(s,`Departed for ${target.name}; ${s.arrivedViaWormhole?'wormhole passage':distance(origin,target)+' parsecs'}.`);
    withRandom(s,rng=>continueTravel(s,rng));
  }
  function openWildDeparture(s){requireDocked(s);if(s.wildStatus!==1)throw Error('Wild is not aboard.');s.pending={kind:'wildDeparture'};}
  function respondWildDeparture(s,yes){if(s.pending?.kind!=='wildDeparture'||typeof yes!=='boolean')throw Error('No Wild departure decision is open.');s.pending=null;if(yes)leaveWild(s);}
  function openSingularity(s,id){requireDocked(s);if(!s.canSuperWarp||!s.systems[id]||id===s.current)throw Error('Select another system and an available portable singularity.');if(s.debt>100000)throw Error('Your debt is too large to travel.');if(s.wildStatus===1&&!Campaigns.armed(s))throw Error('Wild refuses to travel without a Beam laser or better.');if(mercenaryMoney(s)+insuranceMoney(s)+travelCost(s,id).fee>s.credits)throw Error('Not enough credits to meet departure requirements.');s.pending={kind:'singularity',target:id};}
  function respondSingularity(s,yes){const p=s.pending;if(p?.kind!=='singularity'||typeof yes!=='boolean')throw Error('No singularity decision is open.');s.pending=null;if(yes)useSingularity(s,p.target);}
  function leaveWild(s){requireDocked(s);if(s.wildStatus!==1)throw Error('Wild is not aboard.');Campaigns.fail(s,'wild','Wild disembarked at '+s.systems[s.current].name+'. Assignment closed.');}
  function useSingularity(s,id){requireDocked(s);if(!s.canSuperWarp||!s.systems[id]||id===s.current)throw Error('Select another system and an available portable singularity.');if(s.debt>100000)throw Error('Your debt is too large to travel.');if(mercenaryMoney(s)+insuranceMoney(s)+travelCost(s,id).fee>s.credits)throw Error('Not enough credits to meet departure requirements.');if(s.wildStatus===1&&!Campaigns.armed(s))throw Error('Wild refuses to travel without a Beam laser or better.');s.canSuperWarp=false;s.newsEvents=[];addNewsEvent(s,'ARRIVALVIASINGULARITY');const origin=s.systems[s.current];origin.countDown=3+s.difficulty;for(let i=0;i<s.ship.shields.length;i++)if(s.ship.shields[i])s.ship.shieldStrength[i]=H[s.ship.shields[i]].power;s.arrivedViaWormhole=true;s.litterWarning=false;s.trip={target:id,clicks:21,raided:false,inspected:false};log(s,'Used the portable singularity to jump to '+s.systems[id].name+'.');withRandom(s,rng=>{Campaigns.onDeparture(s,rng);continueTravel(s,rng);});}
  function combatRound(s,action){
    if(!s.encounter||s.ended)throw Error('No active encounter.');
    return withRandom(s,rng=>{
      const e=s.encounter,o=e.opponent,oldO=o.hull,oldS=s.ship.hull,kind=e.kind||'PIRATE',special=['MONSTER','DRAGONFLY','SCARAB','MANTIS','FAMOUSCAPTAIN'].includes(kind),actor=kind==='POLICE'?'police':kind==='TRADER'?'trader':kind==='FAMOUSCAPTAIN'?Finish.trades[e.rare].name:special?T[o.type].label:'pirate';
      const resolve=d=>result(s,d);
      if(action==='continue'&&e.state!=='ATTACK'){log(s,`You pass the ${actor}.`);pass(s,rng);return;}
      if(action!=='attack'&&action!=='flee')throw Error('Choose attack or flee.');
      e.round++;
      const fleeing=action==='flee',shipHit=e.state==='ATTACK'?executeAttack(o,s.ship,fleeing,true,s.difficulty,rng,s):false;
      const opponentHit=!fleeing?executeAttack(s.ship,o,e.state==='FLEE',false,s.difficulty,rng):false;
      e.lastRound=`Round ${e.round}: ${shipHit?actor+' hits':actor+' misses'}; ${fleeing?'you try to escape':opponentHit?'you hit':'you miss'}.`;
      log(s,e.lastRound);
      if(s.ship.hull<=0){if(s.escapePod){s.encounter=null;s.pending={kind:'recovery',step:'activated'};log(s,'Ship destroyed; escape pod activated.');return;}const both=o.hull<=0;log(s,both?'Both ships were destroyed.':'Your ship was destroyed.');s.encounter=null;s.pending=null;Finish.finish(s,'KILLED');s.endDialog=both?'bothlose':'lose';return;}
      if(o.hull<=0){
        const bountyCase=kind==='PIRATE'&&s.policeScore>=-5,reward=bountyCase?bounty(o,s.difficulty):0;
        s.credits+=reward;s.policeScore+=kind==='POLICE'?-6:kind==='TRADER'?-4:['MANTIS','FAMOUSCAPTAIN'].includes(kind)?0:1;
        if(kind==='POLICE')s.policeKills=(s.policeKills||0)+1;else if(kind==='TRADER')s.traderKills=(s.traderKills||0)+1;else if(kind!=='FAMOUSCAPTAIN')s.pirateKills++;
        Campaigns.afterVictory(s,kind);if(kind==='FAMOUSCAPTAIN'){const attacked=e.rare+'ATTACKED',destroyed=e.rare+'DESTROYED';if(s.newsEvents?.includes(attacked))s.newsEvents=s.newsEvents.map(id=>id===attacked?destroyed:id);else addNewsEvent(s,destroyed);}if(kind==='FAMOUSCAPTAIN')s.reputation=s.reputation<300?300:s.reputation+100;else s.reputation+=1+(T[o.type].ordinal>>1);log(s,`${actor} destroyed${reward?`; bounty ${reward} credits`:''}.`);
        resolve(bountyCase?say('screen_encounter_bounty',[T[o.type].label,reward],'help_bounty'):say('screen_encounter_win',[],'help_youwin'));
        if(kind==='PIRATE'||kind==='TRADER'){const good=rollLoot(s.difficulty,rng);if(good)s.pending.loot=good;}return;
      }
      if(fleeing&&canEscape(s.ship,o,s.difficulty,rng)){if(kind==='MONSTER')s.monsterHull=o.hull;log(s,'You escaped.');resolve(say('screen_encounter_escaped',[],'help_youescaped',shipHit&&s.difficulty>0?'screen_encounter_escapedhit_message':null));return;}
      if((e.state==='FLEE'||e.state==='SURRENDER')&&rng.get(effectiveSkill(s.ship,'pilot',s.difficulty))*4<=rng.get(7+int(effectiveSkill(o,'pilot',s.difficulty)/3))*2){
        log(s,`The ${actor} escaped.`);resolve(say('screen_encounter_opponentescaped',[],'help_opponentescaped'));return;
      }
      if(!special&&o.hull<oldO){
        if(kind==='POLICE'){if(o.hull<(oldO>>1)){if(s.ship.hull<(oldS>>1)){if(rng.get(10)>5)e.state='FLEE';}else e.state='FLEE';}}
        else if(kind==='TRADER'){if(o.hull<int(oldO*2/3))e.state=rng.get(10)>3?'SURRENDER':'FLEE';else if(o.hull<int(oldO*9/10)){if(s.ship.hull<int(oldS*2/3)){if(rng.get(10)>7)e.state='FLEE';}else if(s.ship.hull<int(oldS*9/10)){if(rng.get(10)>3)e.state='FLEE';}else e.state='FLEE';}}
        else if(o.hull<int(oldO*2/3)){if(s.ship.hull<int(oldS*2/3)){if(rng.get(10)>3)e.state='FLEE';}else{e.state='FLEE';if(rng.get(10)>8)e.state='SURRENDER';}}
      }

    });
  }
  // A result shows one or more original OK dialogs, then travel continues (acknowledge).
  function result(s,dialogs){dialogs=[].concat(dialogs);s.encounter=null;s.pending={kind:'result',title:dialogs[0].title,text:dialogs[0].message,dialogs};log(s,dialogs.map(d=>d.message).join(' '));}
  // Where the original shows no dialog, travel continues immediately.
  function pass(s,rng){s.encounter=null;s.pending=null;if(rng)continueTravel(s,rng);else withRandom(s,r=>continueTravel(s,r));}
  // An encounter notice (e.g. No Weapons) returns to the same encounter after OK.
  function notice(s,d){s.pending={kind:'notice',title:d.title,text:d.message,dialogs:[d]};}
  function dismissNotice(s){if(s.pending?.kind!=='notice')throw Error('No notice is open.');s.pending=null;}
  // Ordinary pirate surrender, GameState's SURRENDER branch. The pirate's
  // raid capacity uses base bays + extra-bay gadgets, without the player quest
  // reservation applied by Ship.totalCargoBays in other contexts.
  function pirateRaidQuote(s){
    const e=s.encounter;
    if(!s.trip||!e||!['PIRATE','SCARAB'].includes(e.kind||'PIRATE')||e.state!=='ATTACK'||e.opponent.type==='MANTIS'||s.ended)throw Error('You can only surrender to an attacking ordinary pirate.');
    const o=e.opponent,total=filled(s.ship),space=Math.max(0,T[o.type].cargoBays+5*(o.gadgets||[]).filter(id=>id==='EXTRABAYS').length-filled(o));
    const payment=total?0:clamp(int(Gen.currentWorth(s)/20),500,25000);
    return {cargo:total,cargoLost:Math.min(total,space),payment,cashPaid:Math.min(s.credits,payment),addedDebt:Math.max(0,payment-s.credits)};
  }
  function applyPirateRaid(s,rng){
    const q=pirateRaidQuote(s),taken=zeros();s.trip.raided=true;
    if(q.cargo===0){s.credits-=q.cashPaid;s.debt+=q.addedDebt;}
    else if(q.cargoLost===q.cargo){
      for(const g of D.goods){taken[g.id]=s.ship.cargo[g.id];s.ship.cargo[g.id]=0;s.costBasis[g.id]=0;}
    }else{
      let bays=q.cargoLost;
      while(bays>0){const good=D.goods[rng.get(10)].id,old=s.ship.cargo[good];if(old>0){s.costBasis[good]=int(s.costBasis[good]*(old-1)/old);s.ship.cargo[good]--;taken[good]++;bays--;}}
    }
    // Source removes stolen goods without adding them to the opponent's hold.
    return {...q,taken};
  }
  function performEncounter(s,action){
    const e=s.encounter,kind=e.kind||'PIRATE';
    if(action==='plunder'){s.policeScore+=kind==='TRADER'?-2:-1;s.pending={kind:'plunder',taken:0};log(s,`Opened ${kind.toLowerCase()} plunder; police record worsened.`);return;}
    if(action==='submit'&&e.postMarie){if(s.wildStatus===1||Campaigns.reactorActive(s)){s.pending={kind:'arrest',step:'sentence',...Enc.sentence(s)};s.encounter=null;return;}for(const good of ['FIREARMS','NARCOTICS']){s.ship.cargo[good]=0;s.costBasis[good]=0;}s.policeScore=Math.min(s.policeScore,-5);result(s,say('screen_encounter_yieldnarcotics',[],'help_yieldnarcotics'));return;}
    if(action==='submit'){
      const contraband=s.ship.cargo.FIREARMS>0||s.ship.cargo.NARCOTICS>0;let fine=0;
      if(contraband){for(const good of ['FIREARMS','NARCOTICS']){s.ship.cargo[good]=0;s.costBasis[good]=0;}fine=Enc.inspectionFine(s);if(s.credits>=fine)s.credits-=fine;else{s.debt+=fine-s.credits;s.credits=0;}s.policeScore--;}
      else if(s.wildStatus!==1)s.policeScore++;
      if(s.wildStatus===1){s.pending={kind:'arrest',step:'sentence',...Enc.sentence(s),...(fine?{inspectionFine:fine}:{})};s.encounter=null;return;}
      const reactor=Campaigns.reactorActive(s);if(reactor)Campaigns.fail(s,'reactor','Police confiscated the unstable reactor.');
      result(s,[contraband?say('screen_encounter_illegalfound',[fine],'help_illegalgoods'):say('screen_encounter_nothingfound',[],'help_nothingfound'),...(reactor?[say('screen_encounter_policeconfiscatereactor',[],'help_policeconfiscatereactor')]:[])]);return;
    }
    if(action==='surrender'&&kind==='MANTIS'){Campaigns.fail(s,'artifact','Mantis ships took the alien artifact.');result(s,say('screen_encounter_artifactstolen',[],'help_artifactstolen'));return;}
    if(action==='bribe'){const price=Enc.bribe(s);if(price===null)throw Error('These police cannot be bribed.');if(s.credits<price)throw Error('Not enough credits to pay the bribe.');s.credits-=price;log(s,`Paid a bribe of ${price} credits.`);pass(s);return;}
    if(action==='surrender'&&(kind==='PIRATE'||kind==='SCARAB')){
      const raid=withRandom(s,rng=>applyPirateRaid(s,rng));
      const wildLost=s.wildStatus===1&&T[e.opponent.type].crewQuarters>1;if(wildLost)Campaigns.fail(s,'wild','Wild left with the pirates.');
      const wildAboard=wildLost||s.wildStatus===1;
      result(s,[raid.cargo?say('screen_encounter_looting',[],'help_looting'):say('screen_encounter_lootnocargo',[],'help_lootnocargo'),...(wildAboard?[wildLost?say('screen_encounter_wildgoeswithpirates',[],'help_wildgoeswithpirates'):say('screen_encounter_wildstaysaboard',[],'help_wildstaysaboard')]:[]),...(Campaigns.reactorActive(s)?[say('screen_encounter_piratesdontstealreactor',[],'help_piratesdontstealreactor')]:[])]);s.pending.raid=raid;return;
    }
    if(action==='surrender'){s.pending={kind:'arrest',step:'sentence',...Enc.sentence(s)};s.encounter=null;return;}
    if(action==='trade'){const quote=withRandom(s,rng=>Enc.quote(s,rng));s.pending={kind:'orbit',...quote};return;}
    if(action==='attack'&&kind==='FAMOUSCAPTAIN'){if(e.state!=='ATTACK')addNewsEvent(s,e.rare+'ATTACKED');s.policeScore=Math.min(s.policeScore,-30)-2;e.state='ATTACK';}
    if(action==='attack'&&kind==='POLICE'){if(s.policeScore> -10)s.policeScore=-10;s.policeScore-=3;if(['IGNORE','INSPECTION'].includes(e.state))e.state='ATTACK';}
    if(action==='attack'&&kind==='TRADER'){
      if(['IGNORE','BUY','SELL'].includes(e.state)){if(s.policeScore>=0)s.policeScore=-5;else s.policeScore-=2;}
      if(e.state!=='FLEE')e.state=withRandom(s,rng=>totalWeapons(e.opponent)<=0||rng.get(1500)<=int(s.reputation*10/(1+T[e.opponent.type].ordinal))?'FLEE':'ATTACK');
    }
    if(action==='flee'&&kind==='POLICE'&&e.state==='INSPECTION'){e.state='ATTACK';if(s.policeScore> -5)s.policeScore=-5-(s.difficulty<2?0:1);else s.policeScore-=2;}
    if(action==='attack'&&kind==='PIRATE'&&e.state==='IGNORE')e.state='ATTACK';
    return combatRound(s,action);
  }
  function combat(s,action){
    if(!s.encounter||s.ended||s.pending)throw Error('Resolve the current encounter dialogue first.');
    const e=s.encounter,kind=e.kind||'PIRATE';
    if(['BOTTLE','MARIECELESTE'].includes(kind)||kind==='FAMOUSCAPTAIN'&&action==='meet')return rareAction(s,action);
    if(!['attack','flee','continue','submit','bribe','surrender','trade','plunder'].includes(action))throw Error('Choose an encounter action.');
    if(action==='plunder'&&(!['PIRATE','TRADER'].includes(kind)||e.state!=='SURRENDER'))throw Error('This opponent has not surrendered.');
    if(action==='submit'&&(kind!=='POLICE'||e.state!=='INSPECTION')||action==='bribe'&&(kind!=='POLICE'||e.state!=='INSPECTION')||action==='surrender'&&(!['POLICE','PIRATE','MANTIS','SCARAB'].includes(kind)||e.state!=='ATTACK'||kind==='PIRATE'&&e.opponent.type==='MANTIS')||action==='trade'&&(kind!=='TRADER'||!['BUY','SELL'].includes(e.state)))throw Error('This action is not available.');
    if(action==='continue'&&!['IGNORE','FLEE','SURRENDER','BUY','SELL'].includes(e.state))throw Error('You cannot ignore this encounter.');
    const goods=s.ship.cargo.FIREARMS>0||s.ship.cargo.NARCOTICS>0,wild=s.wildStatus===1,reactor=Campaigns.reactorActive(s),illegal=goods||wild||reactor;
    // Original GameState encounter button handlers: notices return to the encounter, confirms precede the action.
    const confirms=[],nothing=()=>ask('screen_encounter_noillegal',[],TX.screen_encounter_noillegal_yes,TX.screen_encounter_noillegal_no,'help_noillegal');
    if(action==='attack'){
      if(totalWeapons(s.ship)<=0){notice(s,say('screen_encounter_noweapons',[],'help_noweapons'));return;}
      if(kind==='POLICE'&&e.state==='INSPECTION'&&!goods&&!wild&&!reactor)confirms.push(nothing());
      if(kind==='POLICE'&&s.policeScore>-10)confirms.push(ask('screen_encounter_attackpolice',[],null,null,'help_attackpolice'));
      else if(kind==='TRADER'&&['IGNORE','BUY','SELL'].includes(e.state)&&s.policeScore>=0)confirms.push(ask('screen_encounter_attacktrader',[],null,null,'help_attacktrader'));
      else if(kind==='FAMOUSCAPTAIN'&&e.state!=='ATTACK')confirms.push(ask('screen_encounter_suretoattackfamous',[],null,null,'help_attackgreatcaptain'));
    }
    else if(action==='bribe'){
      if(e.postMarie){notice(s,{...say('screen_encounter_nobribe',[],'help_cantbebribed','screen_encounter_mariecantbebribed_message')});return;}
      const price=Enc.bribe(s);if(price===null){notice(s,say('screen_encounter_nobribe',[],'help_cantbebribed'));return;}
      if(!goods&&!wild)confirms.push(nothing());
      confirms.push(ask('screen_encounter_bribe',[price],TX.screen_encounter_bribe_yes,TX.screen_encounter_bribe_no,'help_bribe'));
    }
    else if(action==='submit'){
      if(e.postMarie){if(wild||reactor)confirms.push(ask('screen_encounter_surrender',[TX[wild?'screen_encounter_surrender_wildonboard':'screen_encounter_surrender_reactoronboard'],TX[wild?'screen_encounter_surrender_wildarrested':'screen_encounter_surrender_reactortaken']],null,null,'help_surrender','screen_encounter_surrender_extra'));}
      else if(illegal){const what=reactor?(goods?'reactorgoods':'reactor'):wild?(goods?'wildgoods':'wild'):'goods';confirms.push(ask('screen_encounter_illegal',[TX['screen_encounter_illegal_'+what],wild||reactor?TX.screen_encounter_illegal_arrested:''],TX.screen_encounter_illegal_yes,TX.generic_no,'help_submit'));}
    }
    else if(action==='flee'){
      if(e.postMarie)confirms.push(ask('screen_encounter_suretofleepostmarie',[],null,null,'help_fleepostmarie'));
      else if(kind==='POLICE'&&e.state==='INSPECTION'&&!illegal)confirms.push(nothing());
    }
    else if(action==='surrender'&&kind==='MANTIS'){if(!s.artifactOnBoard){notice(s,say('screen_encounter_nosurrender',[],'help_nosurrender'));return;}confirms.push(ask('screen_encounter_wanttosurrendertoaliens',[],null,null,'help_surrenderaliens'));}
    else if(action==='surrender'&&kind==='POLICE'){
      if(s.policeScore<=-70){notice(s,say('screen_encounter_nosurrender',[],'help_nosurrender'));return;}
      confirms.push(wild||reactor?ask('screen_encounter_surrender',[TX[wild?'screen_encounter_surrender_wildonboard':'screen_encounter_surrender_reactoronboard'],TX[wild?'screen_encounter_surrender_wildarrested':'screen_encounter_surrender_reactortaken']],null,null,'help_surrender','screen_encounter_surrender_extra'):ask('screen_encounter_surrender',[],null,null,'help_surrender'));
    }
    if(confirms.length){s.pending={kind:'decision',action,title:confirms[0].title,text:confirms[0].message,confirms,step:0};return;}
    return performEncounter(s,action);
  }
  function rareAction(s,action){
    const e=s.encounter;if(!e||s.pending||s.ended)throw Error('No rare encounter is open.');
    if(action==='continue'){log(s,'Left the encounter behind.');pass(s);return;}
    const wanted=e.kind==='BOTTLE'?'drink':e.kind==='MARIECELESTE'?'board':e.kind==='FAMOUSCAPTAIN'&&e.state==='IGNORE'?'meet':null;
    if(action!==wanted)throw Error('This action is not available.');s.pending={kind:'rareDecision',action,rare:e.rare};
  }
  function respondRare(s,yes){
    const p=s.pending,e=s.encounter;if(p?.kind!=='rareDecision'||!e||typeof yes!=='boolean')throw Error('No rare encounter decision is open.');
    if(!yes){s.pending=null;pass(s);return;}
    if(p.action==='board'){e.narcsBefore=s.ship.cargo.NARCOTICS;s.pending={kind:'plunder',taken:0};return;}
    if(p.action==='meet'){const t=Finish.meet(s,e.rare);log(s,`${t.name} trained you: ${t.skill} +${t.gain}.`);result(s,say('screen_encounter_trainingcompleted',[],'help_trainingcompleted'));return;}
    const changes=withRandom(s,rng=>Finish.drink(s,e.rare,rng));result(s,{title:TX.dialog_drink_title,message:TX[e.rare==='BOTTLEGOOD'?'dialog_gooddrink_message':'dialog_strangedrink_message'],help:e.rare==='BOTTLEGOOD'?'help_drankgoodskilltonic':'help_drankoldskilltonic'});s.pending.skillChanges=changes;
  }
  function respondEncounter(s,yes){if(s.pending?.kind!=='decision'||!s.encounter)throw Error('No encounter decision is open.');const p=s.pending,action=p.action;
    if(yes&&p.confirms&&p.step<p.confirms.length-1){p.step++;p.title=p.confirms[p.step].title;p.text=p.confirms[p.step].message;return;}
    s.pending=null;if(!yes)return;
    if(action==='bribe'&&s.credits<Enc.bribe(s)){notice(s,say('screen_encounter_cantaffordbribe',[],'help_cantaffordbribe'));return;}
    return performEncounter(s,action);
  }
  function orbitTrade(s,amount,declined=false){
    if(s.pending?.kind!=='orbit'||s.encounter?.kind!=='TRADER')throw Error('No trader offer is open.');if(!Number.isInteger(amount)||amount<0)throw Error('Choose a nonnegative whole quantity.');
    const offer=s.pending,o=s.encounter.opponent,good=offer.good,price=offer.price,buying=offer.operation==='buy';
    if(declined){pass(s);return {quantity:0,total:0};}
    let n=buying?Math.min(amount,o.cargo[good],Math.max(0,cargoCapacity(s)-filled(s.ship)),int(s.credits/price)):Math.min(amount,s.ship.cargo[good],Math.max(0,Enc.capacity(s,o)-filled(o)));
    if(n>0){if(buying){s.ship.cargo[good]+=n;o.cargo[good]-=n;s.costBasis[good]+=n*price;s.credits-=n*price;}
      else{s.costBasis[good]=int(s.costBasis[good]*(s.ship.cargo[good]-n)/s.ship.cargo[good]);s.ship.cargo[good]-=n;o.cargo[good]+=n;s.credits+=n*price;}}
    log(s,`${buying?'Bought':'Sold'} ${n} ${G[good].label.toLowerCase()} in orbit for ${n*price} credits.`);result(s,{title:TX.dialog_tradecompleted_title,message:fmt(TX[buying?'dialog_tradecompleted_sellmessage':'dialog_tradecompleted_buymessage'],[G[good].label]),help:'help_tradecompleted'});return {quantity:n,total:n*price};
  }
  function continueArrest(s){
    const p=s.pending;if(p?.kind!=='arrest')throw Error('No arrest is pending.');if(p.step==='released'){s.pending=null;return;}
    const q=japoriQuest(s),antidote=q.status===1;
    s.ship.cargo.FIREARMS=0;s.ship.cargo.NARCOTICS=0;
    const crewLeft=(s.ship.hiredCrew||[]).map(m=>m.name);if(s.ship.hiredCrew)s.ship.hiredCrew=[];
    if(s.wildStatus===1)addNewsEvent(s,'WILDARRESTED');const jarekReturned=sendJarekHome(s),campaignNotes=Campaigns.loss(s,'prison');
    const insuranceStopped=!!s.insurance;if(s.insurance){s.insurance=false;s.noClaim=0;}
    if(antidote){q.status=2;q.deliveryAvailable=false;q.resolvedByPolice=true;q.reward=null;}
    withRandom(s,rng=>arrive(s,rng,false));s.days+=p.days;Campaigns.advanceDays(s,p.days);
    let sold=false;if(s.credits>=p.fine)s.credits-=p.fine;else{const value=Gen.currentWorth(s)-s.credits+s.debt;s.credits=Math.max(0,s.credits+value-p.fine);createFlea(s);sold=true;}
    s.policeScore=-5;if(s.debt>0){const paid=Math.min(s.credits,s.debt);s.credits-=paid;s.debt-=paid;}for(let i=0;i<p.days;i++)payInterest(s);
    s.pending={kind:'arrest',step:'released',fine:p.fine,days:p.days,sold,antidote,...(campaignNotes.length?{campaignNotes}:{}),...(jarekReturned?{jarekReturned}:{}),...(crewLeft.length?{crewLeft}:{}),...(insuranceStopped?{insuranceStopped}: {})};log(s,`Released after ${p.days} days; fine ${p.fine} credits.${sold?' Ship sold; received an unarmed Flea.':''}${antidote?' Police delivered the antidote; no training awarded.':''}${crewLeft.length?' Hired crew left during imprisonment.':''}${insuranceStopped?' Insurance cancelled.':''}`);
  }
  // Presentation checkpoints consume no randomness. Resume the original travel
  // checks only after the player acknowledges a combat result.
  function acknowledge(s){
    if(!s.pending||s.ended)throw Error('No journey to continue.');
    if(s.pending.kind==='quest')throw Error('Resolve the mission dialogue first.');
    if(!['arrival','result'].includes(s.pending.kind))throw Error('Resolve this dialogue first.');
    const kind=s.pending.kind,loot=s.pending.loot;if(kind==='result'&&loot){s.pending={kind:'scoop',good:loot};return;}s.pending=null;
    if(kind==='result')withRandom(s,rng=>continueTravel(s,rng));
  }
  // Original recalculateBuyPrices: reuse selling prices, consuming no RNG.
  function recalculateBuyPrices(s){
    const sys=s.systems[s.current],p=P[sys.government];
    for(const g of D.goods){
      if(sys.tech<g.techProduction||(g.id==='NARCOTICS'&&!p.drugsOK)||(g.id==='FIREARMS'&&!p.firearmsOK)){s.prices.buy[g.id]=0;continue;}
      let price=s.policeScore< -5?int(s.prices.sell[g.id]*100/90):s.prices.sell[g.id];
      price=int(price*(103+10-effectiveSkill(s.ship,'trader',s.difficulty,s))/100);
      s.prices.buy[g.id]=price<=s.prices.sell[g.id]?s.prices.sell[g.id]+1:price;
    }
  }
  // CrewMember.increaseRandomSkill: capped skills are rejected and redrawn.
  // The MEDICINEDELIVERY branch calls this twice, even though its text says once.
  function increaseRandomSkill(s,rng){
    const keys=['pilot','fighter','trader','engineer'],skills=s.ship.skills;
    if(keys.every(k=>skills[k]>=10))return null;
    const oldTrader=effectiveSkill(s.ship,'trader',s.difficulty,s);
    let key;do{key=keys[rng.get(keys.length)];}while(skills[key]>=10);
    skills[key]++;
    if(key==='trader'&&oldTrader!==effectiveSkill(s.ship,'trader',s.difficulty,s))recalculateBuyPrices(s);
    return key;
  }
  function questAvailable(s){
    const q=japoriQuest(s);
    if(s.ended||s.trip||s.encounter||s.pending)return null;
    if(s.current===q.origin&&q.status===0&&s.policeScore>=-5&&Campaigns.openQuests(s)<=3)return 'offer';
    if(s.current===q.target&&q.status===1&&q.deliveryAvailable)return 'delivery';
    return null;
  }
  function openQuest(s){
    requireDocked(s);const step=questAvailable(s);
    if(!step)throw Error('No mission event is available here.');
    s.quests??=initialQuests();s.pending={kind:'quest',step};
  }
  function respondQuest(s,decision){
    if(s.pending?.kind!=='quest'||s.ended)throw Error('No mission dialogue is open.');
    const q=s.quests.japori,step=s.pending.step;
    if(step==='offer'){
      if(decision==='no'){s.pending=null;return;}
      if(decision!=='yes')throw Error('Accept or decline the mission.');
      if(q.status!==0||s.current!==q.origin||s.policeScore<-5)throw Error('This mission is not available.');
      if(filled(s.ship)>cargoCapacity(s)-10)throw Error('You need ten empty cargo bays. Sell cargo first, then return to the mission.');
      recordPortNews(s);q.status=1;s.pending={kind:'quest',step:'loaded'};
      log(s,`Loaded ten bays of antidote for ${s.systems[q.target].name}.`);return;
    }
    if(decision!=='continue')throw Error('Choose Continue.');
    if(step==='delivery'){
      if(q.status!==1||s.current!==q.target||!q.deliveryAvailable)throw Error('No antidote delivery is due here.');
      const before={...s.ship.skills};q.status=2;q.deliveryAvailable=false;
      withRandom(s,rng=>{increaseRandomSkill(s,rng);increaseRandomSkill(s,rng);});
      q.reward=Object.fromEntries(Object.keys(before).map(k=>[k,s.ship.skills[k]-before[k]]));
      s.pending={kind:'quest',step:'reward'};
      log(s,`Delivered the antidote at ${s.systems[q.target].name}; ten cargo bays released. Skill training completed.`);return;
    }
    if(step==='loaded'||step==='reward'){s.pending=null;return;}
    throw Error('Invalid mission dialogue.');
  }
  function trade(s,good,amount,operation){
    requireDocked(s);const result=operation==='buy'?buyCargo(s,s.systems[s.current],good,amount):sellCargo(s,good,amount);
    log(s,`${operation==='buy'?'Bought':'Sold'} ${result.quantity} ${G[good].label.toLowerCase()} for ${result.total} credits.`);return result;
  }
  function service(s,kind){requireDocked(s);const n=kind==='fuel'?buyFuel(s,2147483647):buyRepairs(s,2147483647);log(s,kind==='fuel'?`Purchased ${n} parsecs of fuel.`:`Repaired ${n} hull points.`);return n;}
  function setArrivalOption(s,kind,enabled){if(!['autoFuel','autoRepair','ignoreTraders'].includes(kind)||typeof enabled!=='boolean')throw Error('Invalid arrival option.');if(kind==='ignoreTraders'){s.options??={};s.options.ignoreTraders=enabled;}else s[kind]=enabled;}
  // getForHire / personnelRosterFormHandleEvent: recruits keep their assigned
  // system when hired or dismissed. Commander skills stay authoritative, including
  // training, rather than duplicating them in serialized crew records.
  function forHire(s){return (s.mercenaries||[]).find(m=>m.id!==0&&m.system===s.current&&!(s.ship.hiredCrew||[]).some(c=>c.id===m.id))||null;}
  function crewQuote(s,operation,id){
    if(!['hire','dismiss'].includes(operation)||!Number.isInteger(id))throw Error('Choose a crew action.');
    const merc=operation==='hire'?forHire(s):(s.ship.hiredCrew||[]).find(m=>m.id===id);
    if(!merc||merc.id!==id)throw Error(operation==='hire'?'That recruit is not available here.':'That crew member is not aboard.');
    if(operation==='hire'&&occupiedQuarters(s)>=T[s.ship.type].crewQuarters)throw Error('No free crew quarters. The commander occupies one quarter.');
    return {operation,id,name:merc.name,wage:hirePrice(s,merc)};
  }
  function openCrew(s,operation,id){requireDocked(s);s.pending={kind:'personnel',step:'review',quote:crewQuote(s,operation,id)};}
  function respondCrew(s,confirm){
    const p=s.pending;if(p?.kind!=='personnel'||typeof confirm!=='boolean')throw Error('No crew decision is open.');
    if(p.step==='complete'||!confirm){s.pending=null;return;}
    const q=crewQuote(s,p.quote.operation,p.quote.id);if(JSON.stringify(q)!==JSON.stringify(p.quote))throw Error('The crew offer has changed.');
    const oldTrader=effectiveSkill(s.ship,'trader',s.difficulty,s);s.ship.hiredCrew??=[];
    if(q.operation==='hire')s.ship.hiredCrew.push(copy(forHire(s)));else s.ship.hiredCrew=s.ship.hiredCrew.filter(m=>m.id!==q.id);
    if(oldTrader!==effectiveSkill(s.ship,'trader',s.difficulty,s))recalculateBuyPrices(s);
    const title=q.operation==='hire'?`${q.name} joined your crew`:`${q.name} dismissed`,text=q.operation==='hire'?`No hiring fee. ${q.wage} credits will be charged on each departure.`:'Their skill contribution and future wages have been removed.';
    s.pending={kind:'personnel',step:'complete',title,text};log(s,title+'. '+text);
  }
  function setReserveMoney(s,enabled){if(typeof enabled!=='boolean')throw Error('Invalid reserve option.');s.reserveMoney=enabled;}
  // GameState.maxLoan / getLoan / payBack. The UI guard prevents the original
  // unguarded getLoan from producing a negative loan when already over the limit.
  function maxLoan(s){return s.policeScore>=0?Math.min(25000,Math.max(1000,int(int(Gen.currentWorth(s)/10)/500)*500)):500;}
  function bankQuote(s,operation,requested){
    if(!['borrow','repay','buyPod','insure','cancelInsurance'].includes(operation))throw Error('Choose a bank action.');
    let amount=0,premium=0;
    if(['borrow','repay'].includes(operation)){
      if(!Number.isSafeInteger(requested)||requested<1)throw Error('Choose a positive whole amount.');
      amount=operation==='borrow'?Math.min(requested,maxLoan(s)-s.debt):Math.min(requested,s.debt,s.credits);
      if(amount<=0)throw Error(operation==='borrow'?'Your debt has reached the loan limit.':s.debt<=0?'You have no debt to repay.':'Not enough credits to repay debt.');
    }else if(operation==='buyPod'){
      if(s.escapePod)throw Error('You already have an escape pod.');
      if(s.systems[s.current].tech<T.FLEA.minTechLevel)throw Error('Escape pods are not sold at this technology level.');
      if(availableMoney(s)<2000)throw Error('Not enough available credits for an escape pod.');amount=2000;
    }else if(operation==='insure'){
      if(s.insurance)throw Error('Your ship is already insured.');if(!s.escapePod)throw Error('Buy an escape pod before taking out insurance.');
      premium=insuranceMoney({...s,insurance:true});
    }else if(!s.insurance)throw Error('You have no insurance to cancel.');
    return {operation,amount,premium,creditsAfter:s.credits+(operation==='borrow'?amount:['repay','buyPod'].includes(operation)?-amount:0),debtAfter:s.debt+(operation==='borrow'?amount:operation==='repay'?-amount:0)};
  }
  function openBank(s,operation,amount){requireDocked(s);s.pending={kind:'banking',step:'review',requested:amount??null,quote:bankQuote(s,operation,amount)};}
  function respondBank(s,confirm){
    const p=s.pending;if(p?.kind!=='banking'||typeof confirm!=='boolean')throw Error('No bank decision is open.');
    if(p.step==='complete'||!confirm){s.pending=null;return;}
    const q=bankQuote(s,p.quote.operation,p.requested);if(JSON.stringify(q)!==JSON.stringify(p.quote))throw Error('The bank offer has changed.');
    s.credits=q.creditsAfter;s.debt=q.debtAfter;
    if(q.operation==='buyPod')s.escapePod=true;
    if(q.operation==='insure'){s.insurance=true;s.noClaim??=0;}
    if(q.operation==='cancelInsurance'){s.insurance=false;s.noClaim=0;}
    const titles={borrow:'Loan received',repay:'Debt repaid',buyPod:'Escape pod installed',insure:'Ship insured',cancelInsurance:'Insurance cancelled'};
    const text=q.operation==='borrow'?`Borrowed ${q.amount} credits. Outstanding debt: ${s.debt} credits.`:q.operation==='repay'?`Repaid ${q.amount} credits. Outstanding debt: ${s.debt} credits.`:q.operation==='buyPod'?'Paid 2000 credits. Your escape pod activates automatically if your ship is destroyed.':q.operation==='insure'?`No upfront fee. Current premium: ${q.premium} credits per departure. Cargo is not insured.`:'No more premiums will be charged. Your no-claim discount has been reset.';
    s.pending={kind:'banking',step:'complete',title:titles[q.operation],text};log(s,titles[q.operation]+'. '+text);
  }
  // Original createFlea resets pod, policy and no-claim history. New Ship has
  // commander only: ordinary cargo, equipment and hired crew are lost.
  function createFlea(s){const skills={...s.ship.skills};s.ship=makeShip('FLEA',skills);s.ship.weapons=[];s.costBasis=zeros();s.escapePod=false;s.insurance=false;s.noClaim=0;if(s.scarabStatus===3)s.scarabStatus=0;}
  function continueRecovery(s){
    const p=s.pending;if(p?.kind!=='recovery')throw Error('No escape-pod recovery is pending.');
    if(p.step==='complete'){s.pending=null;return;}
    if(p.step!=='activated'||!s.trip||!s.escapePod||s.ship.hull!==0)throw Error('Invalid escape-pod recovery.');
    // EscapePodTask calls ordinary arrival without its TravelTask paid-service
    // block; payout uses the damaged old ship, then rescue fee, +3 days, Flea.
    const crewLost=(s.ship.hiredCrew||[]).map(m=>m.name),q=japoriQuest(s),antidoteLost=q.status===1,insured=!!s.insurance,payout=insured?insuranceValue(p.cause==='reactor'?{...s,ship:{...s.ship,hull:p.claimHull}}:s):0;
    if(!p.alreadyArrived)withRandom(s,rng=>arrive(s,rng,false));else{s.trip=null;s.encounter=null;}
    const jarekReturned=sendJarekHome(s),campaignNotes=[...(p.cause==='reactor'?['The reactor melted down and destroyed your ship.']:[]),...Campaigns.loss(s,'rescue')];
    if(antidoteLost){q.status=0;q.deliveryAvailable=true;q.reward=null;delete q.resolvedByPolice;}
    s.credits+=payout;const rescueDebt=Math.max(0,500-s.credits);s.debt+=rescueDebt;s.credits=Math.max(0,s.credits-500);s.days+=3;Campaigns.advanceDays(s,3);createFlea(s);
    s.pending={kind:'recovery',step:'complete',insured,payout,rescueFee:500,rescueDebt,days:3,antidoteLost,crewLost,...(campaignNotes.length?{campaignNotes}:{}),...(jarekReturned?{jarekReturned}:{})};s.ended=false;
    log(s,`Escape pod rescued you at ${s.systems[s.current].name}.${insured?` Insurance paid ${payout} credits.`:''} Rescue cost 500 credits; three days lost. Received an unarmed Flea.${crewLost.length?' Hired crew lost.':''}${antidoteLost?' Antidote lost; mission can be accepted again.':''}`);
  }
  function validateSave(s){
    if(!s||![1,2].includes(s.version)||!Array.isArray(s.systems)||s.systems.length!==(s.version===2?120:8)||!T[s.ship?.type])throw Error('This is not a compatible experiment save.');
    for(const k of ['credits','debt','days','current','difficulty'])if(!Number.isInteger(s[k])||s[k]<0)throw Error('Invalid saved values.');
    for(const k of ['autoFuel','autoRepair','reserveMoney','escapePod','insurance','litterWarning'])if(s[k]!==undefined&&typeof s[k]!=='boolean')throw Error('Invalid saved options.');
    if(s.options!==undefined&&(!s.options||typeof s.options!=='object'||Array.isArray(s.options)||optionKeys.some(k=>s.options[k]!==undefined&&typeof s.options[k]!=='boolean')))throw Error('Invalid saved options.');
    if(s.newsEvents!==undefined&&(!Array.isArray(s.newsEvents)||s.newsEvents.length>4||s.newsEvents.some(id=>!newsOrder.includes(id))))throw Error('Invalid saved newspaper events.');
    if(s.jarekStatus!==undefined&&(s.version!==2||![0,1,2].includes(s.jarekStatus)))throw Error('Invalid saved Jarek status.');
    if(s.noClaim!==undefined&&(!Number.isSafeInteger(s.noClaim)||s.noClaim<0)||s.insurance&&!s.escapePod)throw Error('Invalid saved insurance.');
    if(s.pending?.services){const p=s.pending.services;if(s.pending.kind!=='arrival'||typeof p.autoFuel!=='boolean'||typeof p.autoRepair!=='boolean'||!['fuel','repair','cost'].every(k=>Number.isInteger(p[k])&&p[k]>=0)||![null,'fuel','repair','both'].includes(p.warning))throw Error('Invalid saved arrival services.');}
    if((s.encounterRules!==undefined&&s.encounterRules!==2)||s.current>=s.systems.length||s.difficulty>4||!/^[0-9]+$/.test(s.rng)||BigInt(s.rng)>=(1n<<48n))throw Error('Invalid saved state.');
    if(!['pilot','fighter','trader','engineer'].every(k=>Number.isInteger(s.ship.skills?.[k])&&s.ship.skills[k]>=0&&s.ship.skills[k]<=10))throw Error('Invalid saved commander skills.');
    for(const g of D.goods)if(!Number.isInteger(s.ship.cargo[g.id])||s.ship.cargo[g.id]<0||!Number.isInteger(s.costBasis[g.id])||s.costBasis[g.id]<0)throw Error('Invalid saved cargo.');
    if(s.quests){
      const q=s.quests.japori;
      if(!q||![0,1,2].includes(q.status)||!Number.isInteger(q.origin)||!s.systems[q.origin]||!Number.isInteger(q.target)||!s.systems[q.target]||(s.version===1&&(q.origin!==0||q.target!==7))||typeof q.deliveryAvailable!=='boolean'||
        (q.status===2&&q.deliveryAvailable)||(q.resolvedByPolice!==undefined&&(q.resolvedByPolice!==true||q.status!==2||q.reward!==null))||
        (q.reward!==null&&(!q.reward||!['pilot','fighter','trader','engineer'].every(k=>Number.isInteger(q.reward[k])&&q.reward[k]>=0&&q.reward[k]<=2)||Object.values(q.reward).reduce((a,b)=>a+b,0)>2)))throw Error('Invalid saved quest.');
    }
    if(filled(s.ship)>cargoCapacity(s))throw Error('Invalid saved cargo capacity.');
    for(const sys of s.systems)if(!P[sys.government]||!D.resources.some(r=>r.id===sys.resource)||!D.statuses.some(r=>r.id===sys.status)||!Number.isInteger(sys.tech)||sys.tech<0||sys.tech>7)throw Error('Invalid saved system.');
    if(s.trip&&(!Number.isInteger(s.trip.target)||s.trip.target<0||s.trip.target>=s.systems.length||!Number.isInteger(s.trip.clicks)||s.trip.clicks<0||s.trip.clicks>21||(s.trip.raided!==undefined&&typeof s.trip.raided!=='boolean')))throw Error('Invalid saved trip.');
    if(s.pending&&(!['arrival','result','notice','quest','decision','orbit','arrest','purchase','personnel','banking','recovery','scoop','plunder','disposal','passenger','special','singularity','wildDeparture','rareDecision','retirement'].includes(s.pending.kind)||(s.encounter&&!['decision','notice','orbit','plunder','disposal','rareDecision'].includes(s.pending.kind))||
      (s.pending.kind==='arrival'&&(s.trip||s.pending.target!==s.current))||
      (s.pending.kind==='result'&&(!s.trip||typeof s.pending.title!=='string'||typeof s.pending.text!=='string'))||
      (s.pending.kind==='quest'&&(s.trip||s.ended||!s.quests||
        !['offer','loaded','delivery','reward'].includes(s.pending.step)||
        (['offer','loaded'].includes(s.pending.step)&&s.current!==s.quests.japori.origin)||
        (['delivery','reward'].includes(s.pending.step)&&s.current!==s.quests.japori.target)||
        s.quests.japori.status!==({offer:0,loaded:1,delivery:1,reward:2})[s.pending.step]))))throw Error('Invalid saved checkpoint.');
    if(s.version===2){
      if(s.worldMode!=='generated'||!s.quests||!Array.isArray(s.wormholes)||s.wormholes.length!==6||new Set(s.wormholes).size!==6||s.wormholes.some(i=>!Number.isInteger(i)||!s.systems[i])||!Array.isArray(s.mercenaries)||s.mercenaries.length!==31||!s.destinations||Object.values(s.destinations).some(i=>!Number.isInteger(i)||!s.systems[i]))throw Error('Invalid saved galaxy.');
      if(s.quests.japori.target!==s.destinations.japori)throw Error('Invalid saved mission destination.');
      const keys=['pilot','fighter','trader','engineer'];
      for(const [id,m] of s.mercenaries.entries())if(!m||m.id!==id||m.name!==D.mercenaryNames[id]||!(m.system===null||Number.isInteger(m.system)&&s.systems[m.system])||!keys.every(k=>Number.isInteger(m.skills?.[k])&&m.skills[k]>=0&&m.skills[k]<=10)||Object.keys(m.skills).length!==4)throw Error('Invalid saved mercenaries.');
    }
    if(s.quests?.jarek){const q=s.quests.jarek;
      if(s.version!==2||!Number.isInteger(q.origin)||!s.systems[q.origin]||q.origin===q.target||q.target!==s.destinations.devidia||typeof q.resolvedByCorps!=='boolean'||(q.resolvedByCorps?s.jarekStatus!==0:![1,2].includes(s.jarekStatus))||s.systems[q.origin].special==='AMBASSADORJAREK'||(s.jarekStatus===2?s.systems[q.target].special!==null:s.systems[q.target].special!=='JAREKGETSOUT'))throw Error('Invalid saved Jarek mission.');
    }else if(s.jarekStatus===1||s.jarekStatus===2)throw Error('Missing saved Jarek mission.');
    if(s.jarekStatus===1&&occupiedQuarters(s)>T[s.ship.type].crewQuarters)throw Error('Invalid saved passenger quarters.');
    if(s.pending?.kind==='passenger'){
      const p=s.pending,q=jarekQuest(s);if(!q||s.trip||s.encounter||s.ended||!['offer','boarded','delivery','reward'].includes(p.step)||s.current!==(['offer','boarded'].includes(p.step)?q.origin:q.target)||(s.jarekStatus||0)!==({offer:0,boarded:1,delivery:1,reward:2})[p.step]||(p.step==='offer'&&(q.resolvedByCorps||s.policeScore<-5||s.systems[s.current].special!=='AMBASSADORJAREK'))||(p.step==='delivery'&&s.systems[s.current].special!=='JAREKGETSOUT'))throw Error('Invalid saved Jarek dialogue.');
    }
    for(const kind of ['arrest','recovery'])if(s.pending?.kind===kind&&s.pending.jarekReturned!==undefined&&(s.pending.jarekReturned!==true||s.jarekStatus!==0||s.quests?.jarek?.resolvedByCorps!==true||!['released','complete'].includes(s.pending.step)))throw Error('Invalid saved passenger return.');
    if(s.ship.hiredCrew!==undefined){
      const crew=s.ship.hiredCrew;
      if(s.version!==2||s.ship.crew||!Array.isArray(crew)||crew.length+1>T[s.ship.type].crewQuarters||new Set(crew.map(m=>m?.id)).size!==crew.length||crew.some(m=>!m||m.id<=0||m.id>=31||JSON.stringify(m)!==JSON.stringify(s.mercenaries[m.id])))throw Error('Invalid saved hired crew.');
    }
    const checkShip=ship=>{
      if(D.goods.some(g=>!Number.isInteger(ship?.cargo?.[g.id])||ship.cargo[g.id]<0)||!['pilot','fighter','trader','engineer'].every(k=>Number.isInteger(ship?.skills?.[k])&&ship.skills[k]>=0&&ship.skills[k]<=(ship===s.ship?10:12)))throw Error('Invalid saved ship cargo or skills.');
      if(!ship||!T[ship.type]||!Number.isInteger(ship.hull)||ship.hull<0||ship.hull>hullMaximum(s,ship)||!Number.isInteger(ship.fuel)||ship.fuel<0||ship.fuel>fuelMaximum(s,ship))throw Error('Invalid saved ship.');
      for(const [array,table] of [[ship.weapons,W],[ship.shields,H],[ship.gadgets||[],byId(D.gadgets)]])if(!Array.isArray(array)||array.length>3||array.some(id=>id!==null&&!table[id]))throw Error('Invalid saved equipment.');
      if(!Array.isArray(ship.shieldStrength)||ship.shieldStrength.length!==ship.shields.length||ship.shieldStrength.some((v,i)=>!Number.isInteger(v)||v<0||v>(ship.shields[i]?H[ship.shields[i]].power:0)))throw Error('Invalid saved shields.');
      if(ship.crew&&(!Array.isArray(ship.crew)||ship.crew.length>3||ship.crew.filter(Boolean).some(c=>!['pilot','fighter','trader','engineer'].every(k=>Number.isInteger(c.skills?.[k])&&c.skills[k]>=0&&c.skills[k]<=12))))throw Error('Invalid saved crew.');
    };
    checkShip(s.ship);
    for(const [i,sys] of s.systems.entries())if(sys.id!==i||typeof sys.name!=='string'||!Number.isInteger(sys.x)||!Number.isInteger(sys.y)||!Number.isInteger(sys.size)||sys.size<0||sys.size>4||D.goods.some(g=>!Number.isInteger(sys.qty?.[g.id])||sys.qty[g.id]<0))throw Error('Invalid saved system quantities.');
    if(s.encounter){if(!s.trip||(s.pending&&!['decision','notice','orbit','plunder','disposal','rareDecision'].includes(s.pending.kind))||!['ATTACK','FLEE','SURRENDER','INSPECTION','IGNORE','BUY','SELL'].includes(s.encounter.state)||s.encounter.kind&&!['PIRATE','POLICE','TRADER','MONSTER','DRAGONFLY','SCARAB','MANTIS','BOTTLE','FAMOUSCAPTAIN','MARIECELESTE'].includes(s.encounter.kind))throw Error('Invalid saved encounter.');checkShip(s.encounter.opponent);}
    const checkLoot=p=>{
      if(p?.kind==='scoop'){if(!s.trip||s.encounter||s.ended||!G[p.good])throw Error('Invalid saved canister.');}
      else if(p?.kind==='plunder'){if(!s.trip||!s.encounter||!['PIRATE','TRADER','MARIECELESTE'].includes(s.encounter.kind||'PIRATE')||s.encounter.state!=='SURRENDER'||!Number.isSafeInteger(p.taken)||p.taken<0||s.ended)throw Error('Invalid saved plunder.');}
      else throw Error('Invalid saved cargo return screen.');
    };
    if(s.pending?.loot&&(s.pending.kind!=='result'||!G[s.pending.loot]||s.encounter||s.ended))throw Error('Invalid saved loot offer.');
    if(['scoop','plunder'].includes(s.pending?.kind))checkLoot(s.pending);
    if(s.pending?.kind==='disposal'){
      const p=s.pending;if(s.ended||!['list','review','complete'].includes(p.step)||p.operation!==(s.trip?'jettison':'dump'))throw Error('Invalid saved disposal.');
      if(p.returnTo)checkLoot(p.returnTo);else if(s.trip||s.encounter)throw Error('Invalid saved disposal context.');
      if(p.step==='review'){const q=disposalQuote(s,p.quote?.good,p.quote?.quantity,p.operation);if(JSON.stringify(q)!==JSON.stringify(p.quote)||typeof p.warning!=='boolean'||p.warning&&(p.operation!=='jettison'||!s.litterWarning))throw Error('Invalid saved disposal quote.');}
      if(p.step==='complete'){const q=p.outcome;if(!q||q.operation!==p.operation||!G[q.good]||!Number.isSafeInteger(q.quantity)||q.quantity<1||q.total!==(p.operation==='dump'?q.quantity*5*(s.difficulty+1):0)||typeof q.caught!=='boolean'||p.operation==='dump'&&q.caught)throw Error('Invalid saved disposal result.');}
    }
    if(s.pending?.kind==='decision'&&(!s.encounter||!['submit','bribe','surrender','attack','flee'].includes(s.pending.action)||typeof s.pending.title!=='string'||typeof s.pending.text!=='string'))throw Error('Invalid saved decision.');
    if(s.pending?.kind==='decision'&&s.pending.action==='surrender'&&(s.encounter.kind||'PIRATE')==='PIRATE'){
      if(JSON.stringify(pirateRaidQuote(s))!==JSON.stringify(s.pending.raidQuote))throw Error('Invalid saved pirate surrender terms.');
    }else if(s.pending?.raidQuote!==undefined)throw Error('Invalid saved pirate surrender review.');
    if(s.pending?.raid!==undefined){
      const r=s.pending.raid;
      if(s.pending.kind!=='result'||s.pending.loot||s.encounter||!s.trip?.raided||!r||!['cargo','cargoLost','payment','cashPaid','addedDebt'].every(k=>Number.isSafeInteger(r[k])&&r[k]>=0)||r.cargoLost>r.cargo||r.cashPaid+r.addedDebt!==r.payment||D.goods.some(g=>!Number.isSafeInteger(r.taken?.[g.id])||r.taken[g.id]<0)||Object.values(r.taken).reduce((a,b)=>a+b,0)!==r.cargoLost||(r.cargo===0?(r.payment<500||r.payment>25000):r.payment!==0))throw Error('Invalid saved pirate raid result.');
    }
    if(s.pending?.kind==='orbit'&&(s.encounter?.kind!=='TRADER'||!['BUY','SELL'].includes(s.encounter.state)||!G[s.pending.good]||s.pending.operation!==(s.encounter.state==='SELL'?'buy':'sell')||!Number.isInteger(s.pending.price)||s.pending.price<=0))throw Error('Invalid saved trader offer.');
    if(s.pending?.kind==='arrest'&&(!['sentence','released'].includes(s.pending.step)||!Number.isInteger(s.pending.fine)||s.pending.fine<0||!Number.isInteger(s.pending.days)||s.pending.days<30||s.encounter||(s.pending.step==='sentence'&&!s.trip)||(s.pending.step==='released'&&s.trip)))throw Error('Invalid saved sentence.');
    if(s.pending?.kind==='purchase'){
      const p=s.pending;if(s.trip||s.encounter||s.ended||!['review','complete'].includes(p.step))throw Error('Invalid saved purchase.');
      if(p.step==='review'){const q=Yard.quote(s,p.request);if(q.reason||JSON.stringify(q)!==JSON.stringify(p.quote))throw Error('Invalid saved purchase quote.');}
      else if(typeof p.title!=='string'||typeof p.text!=='string')throw Error('Invalid saved purchase result.');
    }
    if(s.pending?.kind==='personnel'){
      const p=s.pending;if(s.trip||s.encounter||s.ended||!['review','complete'].includes(p.step))throw Error('Invalid saved crew decision.');
      if(p.step==='review'){const q=crewQuote(s,p.quote?.operation,p.quote?.id);if(JSON.stringify(q)!==JSON.stringify(p.quote))throw Error('Invalid saved crew offer.');}
      else if(typeof p.title!=='string'||typeof p.text!=='string')throw Error('Invalid saved crew result.');
    }
    if(s.pending?.kind==='banking'){
      const p=s.pending;if(s.trip||s.encounter||s.ended||!['review','complete'].includes(p.step))throw Error('Invalid saved bank decision.');
      if(p.step==='review'){const q=bankQuote(s,p.quote?.operation,p.requested);if(JSON.stringify(q)!==JSON.stringify(p.quote))throw Error('Invalid saved bank offer.');}
      else if(typeof p.title!=='string'||typeof p.text!=='string')throw Error('Invalid saved bank result.');
    }
    if(s.pending?.kind==='recovery'){
      const p=s.pending;if(s.encounter||s.ended||!['activated','complete'].includes(p.step))throw Error('Invalid saved escape-pod recovery.');
      if(p.cause!==undefined&&(p.cause!=='reactor'||!p.alreadyArrived||!Number.isInteger(p.claimHull)||p.claimHull<0||p.claimHull>hullMaximum(s)))throw Error('Invalid saved meltdown cause.');
      if(p.alreadyArrived!==undefined&&(p.alreadyArrived!==true||p.step!=='activated'||s.current!==s.trip?.target))throw Error('Invalid saved meltdown recovery.');
      if(p.step==='activated'&&(!s.trip||!s.escapePod||s.ship.hull!==0))throw Error('Invalid saved pod activation.');
      if(p.step==='complete'&&(s.trip||s.ship.type!=='FLEA'||s.escapePod||s.insurance||typeof p.insured!=='boolean'||typeof p.antidoteLost!=='boolean'||p.rescueFee!==500||p.days!==3||![p.payout,p.rescueDebt].every(n=>Number.isSafeInteger(n)&&n>=0)||!Array.isArray(p.crewLost)||p.crewLost.some(n=>typeof n!=='string')))throw Error('Invalid saved recovery result.');
    }
    if(s.pending?.kind==='wildDeparture'&&(s.trip||s.encounter||s.ended||s.wildStatus!==1))throw Error('Invalid saved passenger departure.');
    if(s.pending?.kind==='singularity'&&(s.trip||s.encounter||s.ended||!s.canSuperWarp||!Number.isInteger(s.pending.target)||!s.systems[s.pending.target]||s.pending.target===s.current))throw Error('Invalid saved singularity review.');
    Campaigns.validate(s);Finish.validate(s);return s;
  }
  function serialize(s){return JSON.stringify(s);}
  function deserialize(text){const s=validateSave(JSON.parse(text));s.quests??=initialQuests();return s;}
  return {cloaked,dismissNotice,averagePrices,newsStories,addNewsEvent,recordPortNews,setGameOption,finishingRules:Finish,rareAction,respondRare,campaignRules:Campaigns,hullMaximum,fuelMaximum,useSingularity,openSingularity,respondSingularity,leaveWild,openWildDeparture,respondWildDeparture,jarekQuest,occupiedQuarters,jarekAvailable,openJarek,respondJarek,pirateRaidQuote,applyPirateRaid,rollLoot,plunderCargo,disposalQuote,discardCargo,openDisposal,reviewDisposal,respondDisposal,takePlunder,finishPlunder,respondScoop,data:D,JavaRandom,standardPrice,determinePrices,initializeQuantities,shuffleStatus,changeQuantities,buyCargo,sellCargo,buyFuel,buyRepairs,automaticServices,setArrivalOption,payInterest,distance,executeAttack,canEscape,warpCore,effectiveSkill,availableMoney,insuranceValue,insuranceMoney,maxLoan,bankQuote,openBank,respondBank,continueRecovery,hirePrice,mercenaryMoney,forHire,crewQuote,openCrew,respondCrew,setReserveMoney,filled,cargoCapacity,japoriQuest,questAvailable,openQuest,respondQuest,recalculateBuyPrices,increaseRandomSkill,bounty,makeShip,newGame,newFixtureGame,generateGalaxy:Gen.galaxy,generateOpponent:Gen.opponent,currentWorth:Gen.currentWorth,wormholeTarget,wormholeExists,travelCost,routeTo,beginTravel,combat,respondEncounter,orbitTrade,continueArrest,encounterRules:Enc,yardRules:Yard,openPurchase,respondPurchase,updatePurchaseTransfers,acknowledge,trade,service,serialize,deserialize,copy};
});

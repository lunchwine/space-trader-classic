/* Police and trader encounter rules translated from Russell Wolf. GPL-3.0-or-later. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory;else root.SpaceTraderEncounters=factory;})(globalThis,function(D,E){
 'use strict';const int=Math.trunc,clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),shipType=id=>D.ships.find(t=>t.id===id);
 const illegal=id=>id==='FIREARMS'||id==='NARCOTICS';
 function classify(test,government,score,raided){const police=(score< -70?3:score< -30?2:1)*government.strengthPolice;
  return test<government.strengthPirates&&!raided?'PIRATE':test<government.strengthPirates+police?'POLICE':test<government.strengthPirates+police+government.strengthTraders?'TRADER':null;
 }
 function tradeable(s,ship,selling){return D.goods.filter(g=>ship.cargo[g.id]>0&&s.prices[selling?'buy':'sell'][g.id]>0&&illegal(g.id)===(s.policeScore< -5));}
 function randomTradeable(s,ship,selling,rng){const allowed=tradeable(s,ship,selling);if(!allowed.length)throw Error('No tradeable goods.');for(let i=0;i<10;i++){const g=D.goods[rng.get(10)];if(allowed.includes(g))return g;}return allowed[0];}
 function capacity(s,ship){return shipType(ship.type).cargoBays+5*(ship.gadgets||[]).filter(g=>g==='EXTRABAYS').length-(E.japoriQuest(s).status===1?10:0)-(s.reactorStatus>0&&s.reactorStatus<21?15-int((s.reactorStatus-1)/2):0);}
 function state(s,kind,opponent,rng){let state='IGNORE',skip=false;const type=shipType(opponent.type),playerType=shipType(s.ship.type),police=s.policeScore;
  if(kind==='POLICE'){
   if(E.cloaked(s.ship,opponent,s.difficulty))state='IGNORE';
   else if(police< -5){if(E.totalWeapons(opponent)<=0)state=E.cloaked(opponent,s.ship,s.difficulty)?'IGNORE':'FLEE';if(s.reputation<40||rng.get(1500)>int(s.reputation/(1+type.ordinal)))state='ATTACK';else state=E.cloaked(opponent,s.ship,s.difficulty)?'IGNORE':'FLEE';}
   else if(police<0&&!s.trip.inspected){state='INSPECTION';s.trip.inspected=true;}
   else if(police<5){if(rng.get(12-s.difficulty)<1&&!s.trip.inspected){state='INSPECTION';s.trip.inspected=true;}}
   else if(rng.get(40)===1&&!s.trip.inspected){state='INSPECTION';s.trip.inspected=true;}
   if(state==='FLEE'&&type.ordinal>playerType.ordinal)state=police< -5?'ATTACK':'INSPECTION';
   skip=state==='IGNORE'&&E.cloaked(opponent,s.ship,s.difficulty)||(s.options?.ignorePolice??true)&&['IGNORE','FLEE'].includes(state);
  }else if(kind==='TRADER'){
   if(!E.cloaked(s.ship,opponent,s.difficulty)&&police<= -10&&rng.get(1500)<=int(s.reputation*10/(1+type.ordinal)))state=E.cloaked(opponent,s.ship,s.difficulty)?'IGNORE':'FLEE';
   if(state==='IGNORE'&&rng.get(1000)<(s.chanceOfTradeInOrbit??100)){if(E.filled(s.ship)<capacity(s,s.ship)&&tradeable(s,opponent,true).length)state='SELL';if(tradeable(s,s.ship,false).length&&state!=='SELL'&&E.filled(opponent)<capacity(s,opponent))state='BUY';}
   skip=E.cloaked(opponent,s.ship,s.difficulty)||(s.options?.ignoreTraders??false)&&['IGNORE','FLEE'].includes(state)||(s.options?.ignoreOrbitTrade??false)&&['BUY','SELL'].includes(state);
  }else{
   state=E.cloaked(s.ship,opponent,s.difficulty)?'IGNORE':type.ordinal>=7||rng.get(1500)>int(s.reputation*4/(1+type.ordinal))?'ATTACK':'FLEE';if(state==='FLEE'&&type.ordinal>playerType.ordinal)state='ATTACK';skip=['IGNORE','FLEE'].includes(state)&&(E.cloaked(opponent,s.ship,s.difficulty)||(s.options?.ignorePirates??false));
  }
  return {state,skip};
 }
 function quote(s,rng){const e=s.encounter,selling=e.state==='SELL',g=randomTradeable(s,selling?e.opponent:s.ship,selling,rng);let price=s.prices[selling?'buy':'sell'][g.id];const draw=rng.get(100);
  if(selling)price=int(price*(illegal(g.id)?draw<=45?1.1:0.8:draw<=10?1.1:0.9));else price=int(price*(illegal(g.id)?draw<=45?0.8:1.1:draw<=10?0.9:1.1));
  price=(int(price/g.roundOff)+(selling?0:1))*g.roundOff;price=clamp(price,g.minTradePrice,g.maxTradePrice);s.prices[selling?'buy':'sell'][g.id]=price;
  return {good:g.id,price,operation:selling?'buy':'sell'};
 }
 function bribe(s){const government=D.governments.find(p=>p.id===s.systems[s.trip.target].government);if(government.bribeLevel<=0)return null;let n=int(E.currentWorth(s)/((10+5*(4-s.difficulty))*government.bribeLevel));if(n%100!==0)n+=100-n%100;if(s.wildStatus===1||s.reactorStatus>0&&s.reactorStatus<21)n*=s.difficulty<=2?2:3;return clamp(n,100,10000);}
 function inspectionFine(s){let n=int(E.currentWorth(s)/((6-s.difficulty)*10));if(n%50!==0)n+=50-n%50;return clamp(n,100,10000);}
 function sentence(s){return {fine:int((1+int(int(E.currentWorth(s)*Math.min(80,-s.policeScore)/100)/500))*500*(s.wildStatus===1?1.05:1)),days:Math.max(30,-s.policeScore)};}
 return {classify,tradeable,randomTradeable,capacity,state,quote,bribe,inspectionFine,sentence,illegal};
});

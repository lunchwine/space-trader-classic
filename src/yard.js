/* Shipyard and equipment rules from Russell Wolf's Space Trader. GPL-3.0-or-later. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory;else root.SpaceTraderYard=factory;})(globalThis,function(D,E){
 'use strict';const int=Math.trunc,T=Object.fromEntries(D.ships.map(x=>[x.id,x]));
 const tables={weapons:D.weapons,shields:D.shields,gadgets:D.gadgets};
 const slots={weapons:'weaponSlots',shields:'shieldSlots',gadgets:'gadgetSlots'};
 const buyable={weapons:['PULSE','BEAM','MILITARY'],shields:['ENERGY','REFLECTIVE'],gadgets:['EXTRABAYS','AUTOREPAIRSYSTEM','NAVIGATINGSYSTEM','TARGETINGSYSTEM','CLOAKINGDEVICE']};
 const buyPrice=(item,tech,trader)=>((item.minTechLevel??item.techLevel)>tech?0:int(item.price*(100-trader)/100));
 const sellPrice=item=>int(item.price*3/4);
 function tradeIn(s,forInsurance=false){
  const t=T[s.ship.type];let value=int(t.price*(s.ship.tribbles>0&&!forInsurance?1:3)/4)-(E.hullMaximum(s)-s.ship.hull)*t.repairCosts-(E.fuelMaximum(s)-s.ship.fuel)*t.costOfFuel;
  for(const [category,table] of Object.entries(tables))for(const id of s.ship[category]||[])if(id)value+=sellPrice(table.find(x=>x.id===id));
  return value+Object.values(s.costBasis).reduce((a,b)=>a+b,0);
 }
 function quote(s,request){
  const tech=s.systems[s.current].tech,trader=E.effectiveSkill(s.ship,'trader',s.difficulty,s),t=T[s.ship.type];let reason=null;
  if(request?.type==='ship'){
   const target=T[request.id];if(!target||target.ordinal>=10)throw Error('Choose a ship sold by the shipyard.');
   const gross=buyPrice(target,tech,trader),value=tradeIn(s),price=gross?gross-value||1:0;
   if(!gross)reason='Not sold at this technology level.';
   else if(target.id===s.ship.type)reason='You already own this ship type.';
   else if(price>=0&&s.debt>0)reason='Repay your debt before buying a more expensive ship.';
   else if(price>E.availableMoney(s))reason='Not enough available credits.';
   else if(E.occupiedQuarters(s)>target.crewQuarters)reason='Not enough crew quarters.';
   else if(s.reactorStatus>0&&s.reactorStatus<21)reason='Deliver or lose the unstable reactor before trading ships.';
   const transferOptions=[['shields','LIGHTNING',30000],['gadgets','FUELCOMPACTOR',20000],['weapons','MORGAN',33333]].filter(([category,id])=>(s.ship[category]||[]).includes(id)).map(([category,id,fee])=>({category,id,fee,canTransfer:target[slots[category]]>0}));
   if(transferOptions.length){const transfers=request.transfers||[];if(!Array.isArray(transfers)||new Set(transfers).size!==transfers.length||transfers.some(id=>!transferOptions.some(q=>q.id===id&&q.canTransfer)))throw Error('Choose valid quest equipment transfers.');const extra=transferOptions.filter(q=>transfers.includes(q.id)).reduce((n,q)=>n+q.fee,0);if(price+extra>E.availableMoney(s))reason='Not enough available credits including transfer fees.';return {type:'ship',id:target.id,gross,tradeIn:value,basePrice:price,extra,transfers:transfers.slice(),transferOptions,price:price+extra,reason};}
   return {type:'ship',id:target.id,gross,tradeIn:value,price,reason};
  }
  const category=request?.category,table=tables[category];if(!table||!['buy','sell'].includes(request.type))throw Error('Choose valid equipment.');
  const list=s.ship[category]||[],index=request.type==='sell'?request.index:Array.from({length:t[slots[category]]},(_,i)=>i).find(i=>!list[i]);
  const id=request.type==='sell'?list[index]:request.id,item=table.find(x=>x.id===id);if(!item||request.type==='sell'&&(!Number.isInteger(index)||index<0||index>=list.length))throw Error('Choose installed equipment.');
  const price=request.type==='buy'?buyPrice(item,tech,trader):sellPrice(item);
  if(request.type==='buy'){
   if(!buyable[category].includes(id)||price<=0)reason='Not sold at this technology level.';
   else if(category==='gadgets'&&id!=='EXTRABAYS'&&list.includes(id))reason='A second copy of this gadget has no benefit.';
   else if(s.debt>0)reason='Repay your debt before buying equipment.';
   else if(price>E.availableMoney(s))reason='Not enough available credits.';
   else if(index===undefined)reason='No empty slot. Sell installed equipment first.';
  }else if(category==='gadgets'&&id==='EXTRABAYS'&&E.filled(s.ship)>E.cargoCapacity(s)-5)reason='Sell cargo first; removing these bays would leave too little cargo space.';
  return {type:request.type,category,id,index:index??null,price,reason};
 }
 function execute(s,q){
  if(q.reason)throw Error(q.reason);
  if(q.type==='ship'){
   const old=s.ship,newShip=E.makeShip(q.id,old.skills);newShip.weapons=[];newShip.gadgets=[];
   if(old.crew)newShip.crew=old.crew.slice();
   if(old.hiredCrew)newShip.hiredCrew=old.hiredCrew.slice();
   s.ship=newShip;if(s.scarabStatus===3)s.scarabStatus=0;for(const transfer of q.transferOptions||[])if((q.transfers||[]).includes(transfer.id)){newShip[transfer.category]=[transfer.id];if(transfer.category==='shields')newShip.shieldStrength=[0];}for(const id of Object.keys(s.costBasis))s.costBasis[id]=0;s.credits-=q.price;
  }else if(q.type==='buy'){
   s.ship[q.category]??=[];s.ship[q.category][q.index]=q.id;s.credits-=q.price;
   if(q.category==='shields')s.ship.shieldStrength[q.index]=0; // Original buyItem installs without charging until departure.
  }else{
   s.ship[q.category].splice(q.index,1);s.credits+=q.price;if(q.category==='shields')s.ship.shieldStrength.splice(q.index,1);if(q.id==='FUELCOMPACTOR')s.ship.fuel=Math.min(s.ship.fuel,E.fuelMaximum(s));
  }
 }
 return {tables,buyable,slots,buyPrice,sellPrice,tradeIn,quote,execute};
});

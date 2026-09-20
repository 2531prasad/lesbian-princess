/* Pure achievement definitions and evaluation. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CatAchievements=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const DEFINITIONS=Object.freeze([
    Object.freeze({id:'first-heart',name:'First Crush',description:'Collect a heart',bonus:100,test:s=>s.hearts>=1}),
    Object.freeze({id:'double-trouble',name:'Double Trouble',description:'Use a double jump',bonus:150,test:s=>s.doubleJumps>=1}),
    Object.freeze({id:'speed-demon',name:'Speed Demon',description:'Enter an accelerated path',bonus:200,test:s=>s.boosts>=1}),
    Object.freeze({id:'bend-master',name:'Bend Master',description:'Complete three hard turns',bonus:300,test:s=>s.turns>=3}),
    Object.freeze({id:'heart-hoarder',name:'Heart Hoarder',description:'Collect 25 hearts in one run',bonus:500,test:s=>s.hearts>=25}),
    Object.freeze({id:'self-care',name:'Self Care',description:'Complete a nap and toilet break',bonus:400,test:s=>s.naps>=1&&s.toilets>=1}),
    Object.freeze({id:'long-haul',name:'Long Haul',description:'Run 500 metres',bonus:750,test:s=>s.distanceM>=500}),
    Object.freeze({id:'royal-score',name:'Royal Score',description:'Reach 5,000 points',bonus:1000,test:s=>s.score>=5000})
  ]);
  function evaluate(stats,unlocked){const known=unlocked instanceof Set?unlocked:new Set(unlocked||[]);return DEFINITIONS.filter(item=>!known.has(item.id)&&item.test(stats));}
  return{DEFINITIONS,evaluate};
});

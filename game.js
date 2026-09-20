'use strict';
(() => {
const $ = id => document.getElementById(id);
const canvas = $('game'), ctx = canvas.getContext('2d');
const gameStage = $('game-stage');
const fullscreenButtons = [$('fullscreen')];
const themes = [
 {name:'Strawberry skies',icon:'✿',sky:['#f7c6b5','#f4d5d9','#ddcbef'],tile:'#f5b5c3',side:'#d992ac',edge:'#ffe4e9',accent:'#ed788d',wall:'#e2c9ef'},
 {name:'Lavender letters',icon:'⌘',sky:['#ead1fa','#d6c8ee','#f0cfe2'],tile:'#d1bbed',side:'#aa8ac9',edge:'#efe1ff',accent:'#a379ce',wall:'#dccbf0'},
 {name:'Cloud nine',icon:'☁',sky:['#f9d5a4','#f8ddd0','#e6d9f3'],tile:'#ffdeb8',side:'#dcac92',edge:'#fff0d6',accent:'#e6ac71',wall:'#edd5cb'}
];
let W=800,H=490,dpr=1,cameraFocal=H*1.14,cameraDistance=430,cameraBase=H*.29,cameraLookAt=245,cameraTrackY=0,cameraSwayX=0,cameraSwayY=0,cameraFovPunch=0,boostFlash=0,world=0,state='ready',distance=0,hearts=0,rewards=0,turnCount=0,lane=0,x=0,y=0,vy=0,time=0,last=0,sound=true;
let activeHalt=null,pausedFrom='playing',activePath=null,eventMessageTimer=0,lastDeathAt=-Infinity;
let obstacles=[],pickups=[],rewardPickups=[],turnMarkers=[],speedPaths=[],activityStops=[],particles=[];
let courseGeneratedTo=0,courseCursor=0,courseGenerator=null,runSeed=1;
let jumpAnimation='none',jumpAnimationProgress=1;
let score=0,combo=1,comboExpiresAt=0,luckyUntil=0,bestScore=0,bestDistance=0,currentEventKey='';
let boostsEntered=0,doubleJumps=0,napsCompleted=0,toiletsCompleted=0,achievementCooldown=0,achievementPoll=0;
let canvasNotice=null,canvasAchievement=null,canvasHintUntil=0;
const laneWidth=100,TUTORIAL_KEY='purrfect-gesture-tutorial-seen';
const runner=new CatPhysics.Runner();
const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarsePointer=window.matchMedia('(pointer: coarse)').matches;
const lossImage=new Image();lossImage.decoding='async';lossImage.src='assets/oh-no-you-lost.jpg';
const controlModeButtons=[$('control-buttons'),$('control-gesture')];
const audioBus=new CatAudio.AudioBus(true),renderEntities=[],routePoseCache=new Map(),unlockedAchievements=new Set();
let frameCameraRoute=null;
let controlMode='buttons',gestureStart=null,hudSnapshot='',skyGradient=null,skyGlow=null,backdropPaintSize='',lastIdleDraw=0;
try{controlMode=localStorage.getItem('purrfect-control-mode')==='gesture'?'gesture':'buttons';sound=localStorage.getItem('purrfect-sound')!=='off';bestScore=Number(localStorage.getItem('purrfect-best-score'))||0;bestDistance=Number(localStorage.getItem('purrfect-best-distance'))||0;}catch{}
audioBus.setEnabled(sound);
function resize(){const r=canvas.getBoundingClientRect();W=r.width;H=r.height;const cap=coarsePointer?1.5:2;dpr=Math.min(window.devicePixelRatio||1,cap);canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);updateCamera(0,true);rebuildBackdropPaints();}
new ResizeObserver(resize).observe(canvas);
function announce(text){$('announcement').textContent=text;}
function damp(current,target,sharpness,dt){return current+(target-current)*(1-Math.exp(-sharpness*dt));}
function updateCamera(dt=.016,immediate=false){
 const mobileFrame=W<720||W/Math.max(1,H)<.9;
 const baseDistance=mobileFrame?500:430,baseFocal=mobileFrame?.98:1.14;
 const speedRatio=Math.max(0,Math.min(1,(runner.speed-CatPhysics.BASE_SPEED)/(CatPhysics.MAX_BASE_SPEED-CatPhysics.BASE_SPEED)));
 const trackHeight=floorHeight(distance+22,lane),aheadHeight=floorHeight(distance+760,lane),terrainChange=Math.min(1,Math.abs(aheadHeight-trackHeight)/120),targetLookAt=(mobileFrame?270:245)+terrainChange*(mobileFrame?42:30);
 const targetFocal=H*(baseFocal-speedRatio*(mobileFrame?.22:.15)-(activePath&&!reduced?(mobileFrame?.09:.065):0)-cameraFovPunch);
 cameraDistance=immediate?baseDistance:damp(cameraDistance,baseDistance,6,dt);
 cameraFocal=immediate?targetFocal:damp(cameraFocal,targetFocal,cameraFovPunch>.02?13:6,dt);
 cameraLookAt=immediate?targetLookAt:damp(cameraLookAt,targetLookAt,4.5,dt);
 cameraTrackY=immediate?trackHeight:damp(cameraTrackY,trackHeight,5.5,dt);
 const catScale=cameraFocal/(cameraDistance+22);
 cameraBase=(mobileFrame?H*.74:H*.82)-cameraLookAt*catScale;
 cameraFovPunch=reduced?0:damp(cameraFovPunch,0,4.2,dt);boostFlash=reduced?0:damp(boostFlash,0,5.5,dt);
 if(reduced){cameraSwayX=0;cameraSwayY=0;return;}
 cameraSwayX=damp(cameraSwayX,(runner.lane*laneWidth-runner.x)*.035,8,dt);
 cameraSwayY=damp(cameraSwayY,0,8,dt);
}
function rebuildBackdropPaints(){const size=`${W}|${H}|${world}`;if(size===backdropPaintSize)return;const t=themes[world];skyGradient=ctx.createLinearGradient(0,0,0,H);t.sky.forEach((color,index)=>skyGradient.addColorStop(index/2,color));skyGlow=ctx.createRadialGradient(W*.64,H*.15,0,W*.64,H*.15,W*.5);skyGlow.addColorStop(0,'#fff4caad');skyGlow.addColorStop(1,'#fff4ca00');backdropPaintSize=size;}
function syncControlModeUi(){const gameStarted=state!=='ready';gameStage.dataset.controlMode=controlMode;gameStage.dataset.gameActive=String(gameStarted);$('control-mode-picker').hidden=gameStarted;$('achievements-button').hidden=gameStarted;$('hud').hidden=gameStarted;controlModeButtons.forEach(button=>{const selected=button.dataset.controlMode===controlMode;button.setAttribute('aria-pressed',String(selected));});}
function setControlMode(mode){if(mode!=='buttons'&&mode!=='gesture')return;controlMode=mode;try{localStorage.setItem('purrfect-control-mode',mode);}catch{}syncControlModeUi();announce(mode==='gesture'?'Swipe controls enabled. Swipe left or right to move and up to jump.':'Button controls enabled. Use the on-screen arrows and jump button.');}
function renderAchievements(){const list=$('achievements-list');list.replaceChildren(...CatAchievements.DEFINITIONS.map(item=>{const unlocked=unlockedAchievements.has(item.id),row=document.createElement('div');row.className='achievement-row'+(unlocked?'':' locked');const icon=document.createElement('span'),copy=document.createElement('span'),reward=document.createElement('strong'),title=document.createElement('b'),detail=document.createElement('small');icon.textContent=unlocked?'🏆':'🔒';title.textContent=item.name;detail.textContent=item.description;reward.textContent='+'+item.bonus+' pts';copy.append(title,detail);row.append(icon,copy,reward);return row;}));}
function nativeFullscreenElement(){return document.fullscreenElement||document.webkitFullscreenElement||null;}
function fullscreenActive(){return nativeFullscreenElement()===gameStage||gameStage.classList.contains('fullscreen-fallback');}
function syncFullscreenUi(){const active=fullscreenActive(),label=active?'Exit full screen':'Enter full screen',icon=active?'×':'⛶';fullscreenButtons.forEach(button=>{button.textContent=icon;button.setAttribute('aria-label',label);button.setAttribute('aria-pressed',String(active));button.title=label;});document.body.classList.toggle('fullscreen-fallback-active',gameStage.classList.contains('fullscreen-fallback'));}
function leaveFallbackFullscreen(){gameStage.classList.remove('fullscreen-fallback');syncFullscreenUi();}
function enterFallbackFullscreen(){gameStage.classList.add('fullscreen-fallback');syncFullscreenUi();announce('Full-screen view enabled. Tap the button again to exit.');}
async function toggleFullscreen(){
 if(!fullscreenActive()&&state==='ready')start(false);
 if(fullscreenActive()){
  if(nativeFullscreenElement()){
   try{if(document.exitFullscreen)await document.exitFullscreen();else if(document.webkitExitFullscreen)document.webkitExitFullscreen();}
   catch{announce('Use your browser controls to exit full screen.');}
  }else leaveFallbackFullscreen();
  return;
 }
 let entered=false;
 if(typeof gameStage.requestFullscreen==='function'){
  try{await gameStage.requestFullscreen({navigationUI:'hide'});entered=true;}catch{
   try{await gameStage.requestFullscreen();entered=true;}catch{}
  }
 }else if(typeof gameStage.webkitRequestFullscreen==='function'){
  try{await gameStage.webkitRequestFullscreen();entered=true;}catch{}
 }
 if(!entered)enterFallbackFullscreen();else syncFullscreenUi();
}
function gameplayTouchLockActive(){return state==='playing'||state==='falling'||state==='resting';}
function updateGameplayTouchLock(){document.body.classList.toggle('game-touch-locked',gameplayTouchLockActive());gameStage.classList.toggle('game-resting',state==='resting');syncControlModeUi();}
function isInsideGameTouchTarget(target){return target instanceof Node&&(gameStage.contains(target)||Boolean(target.closest?.('.toolbar')));}
function blockOutsideGameTouch(event){
 if(!gameplayTouchLockActive()||isInsideGameTouchTarget(event.target))return;
 const touchEvent=event.type.startsWith('touch')||event.pointerType==='touch';
 if(!touchEvent)return;
 event.preventDefault();
 event.stopPropagation();
}
function setGameEvent(icon,label){const key=icon+'|'+label;if(key===currentEventKey&&canvasNotice)return;currentEventKey=key;canvasNotice={icon,label,persistent:true,remaining:Infinity};}
function hideGameEvent(){currentEventKey='';canvasNotice=null;}
function restorePathEvent(){if(activePath)setGameEvent('⚡',`Accelerated path · ${activePath.multiplier.toFixed(1)}×`);else if(runner.elapsed<luckyUntil)setGameEvent('✦',`Lucky Paws · ${Math.ceil(luckyUntil-runner.elapsed)}s`);else hideGameEvent();}
function flashGameEvent(icon,label){currentEventKey=icon+'|'+label;canvasNotice={icon,label,persistent:false,remaining:1.8};eventMessageTimer=1.8;}
function updateGameEvent(dt){if(canvasNotice&&!canvasNotice.persistent)canvasNotice.remaining=Math.max(0,canvasNotice.remaining-dt);if(eventMessageTimer>0){eventMessageTimer=Math.max(0,eventMessageTimer-dt);if(eventMessageTimer===0)restorePathEvent();}else restorePathEvent();if(canvasAchievement){canvasAchievement.remaining=Math.max(0,canvasAchievement.remaining-dt);if(canvasAchievement.remaining===0)canvasAchievement=null;}}
function setActivityBanner(){}
function clearActivityBanner(){}
function tone(frequency=500,duration=.1,options={}){audioBus.tone(frequency,duration,options);}
function melody(notes,duration=.08,spacing=.055,options={}){audioBus.melody(notes,duration,spacing,options);}
function syncSoundUi(){const button=$('sound');button.setAttribute('aria-pressed',String(sound));button.setAttribute('aria-label',sound?'Turn sound off':'Turn sound on');button.querySelector('.sound-slash').hidden=sound;}
function floorHeight(z,lane){return (world===1?10:0)+CatPhysics.elevationAt(world,Math.floor(z/180),lane);}
function generateCourseUntil(limit){
 while(courseCursor<limit){
  const chunk=courseGenerator.next(courseCursor,CatCourse.difficultyTier(runner.elapsed));
  for(const o of chunk.obstacles)obstacles.push({...o,base:floorHeight(o.z,o.lane),hit:false});
  for(const h of chunk.pickups)pickups.push({...h,taken:false,height:floorHeight(h.z,h.lane)+58});
  for(const reward of chunk.rewards)rewardPickups.push({...reward,taken:false,height:floorHeight(reward.z,reward.lane)+62});
  if(chunk.speedPath)speedPaths.push(chunk.speedPath);
  if(chunk.turn)turnMarkers.push(chunk.turn);
  if(chunk.stop)activityStops.push(chunk.stop);
  courseCursor=chunk.end;
 }
 courseGeneratedTo=courseCursor;
}
function trimCourseHistory(){const cutoff=distance-900;const trim=(items,startKey='z',endKey=startKey)=>{let index=courseLowerBound(items,cutoff,startKey);if(startKey!==endKey)while(index>0&&items[index-1][endKey]>=cutoff)index--;if(index>0)items.splice(0,index);};trim(obstacles);trim(pickups);trim(rewardPickups);trim(turnMarkers,'start','end');trim(activityStops);trim(speedPaths,'start','end');}
function ensureCourseAhead(){const target=Math.max(9000,distance+5000);if(target>courseGeneratedTo)generateCourseUntil(target);trimCourseHistory();}
function makeCourse(){
 obstacles=[];pickups=[];rewardPickups=[];turnMarkers=[];speedPaths=[];activityStops=[];particles=[];
 runSeed=((Date.now()>>>0)^((world+1)*0x9E3779B9))>>>0;courseGenerator=new CatCourse.Generator(runSeed,world);courseGeneratedTo=0;courseCursor=0;
 generateCourseUntil(9000);
}
const gapAt=CatPhysics.gapAt,isGap=CatPhysics.isGap;
function courseLowerBound(items,value,key){let low=0,high=items.length;while(low<high){const middle=(low+high)>>1;if(items[middle][key]<value)low=middle+1;else high=middle;}return low;}
function forCourseRange(items,min,max,visit,startKey='z',endKey=startKey){if(!items.length)return;let index=courseLowerBound(items,min,startKey);if(endKey!==startKey)while(index>0&&items[index-1][endKey]>=min)index--;for(;index<items.length&&items[index][startKey]<=max;index++){if(items[index][endKey]>=min)visit(items[index]);}}
function awardPoints(base){if(runner.elapsed>comboExpiresAt)combo=1;const lucky=runner.elapsed<luckyUntil?2:1;score+=base*combo*lucky;combo=Math.min(5,combo+1);comboExpiresAt=runner.elapsed+2.5;}
function achievementStats(){return{hearts,doubleJumps,boosts:boostsEntered,turns:turnCount,naps:napsCompleted,toilets:toiletsCompleted,distanceM:Math.floor(distance/10),elapsedS:runner.elapsed,score};}
function checkAchievements(dt){achievementCooldown=Math.max(0,achievementCooldown-dt);achievementPoll=Math.max(0,achievementPoll-dt);if(achievementCooldown>0||achievementPoll>0||state!=='playing')return;achievementPoll=.25;const item=CatAchievements.evaluate(achievementStats(),unlockedAchievements)[0];if(!item)return;unlockedAchievements.add(item.id);score+=item.bonus;achievementCooldown=3.2;canvasAchievement={name:item.name,description:item.description,bonus:item.bonus,remaining:3,total:3};melody([520,700,920,1120],.08,.05,{name:'achievement',type:'triangle'});const p=project(x,y+70,22),count=reduced?3:12;for(let i=0;i<count;i++)particles.push({x:p.x,y:p.y,vx:(Math.random()-.5)*150,vy:-80-Math.random()*110,life:1.5,color:i%2?'#ffe49a':'#fff7dc'});announce(`Achievement unlocked: ${item.name}. ${item.description}. ${item.bonus} bonus points.`);hudSnapshot='';}
function hud(){const speed=(runner.speed/CatPhysics.BASE_SPEED).toFixed(1),comboActive=combo>1&&runner.elapsed<=comboExpiresAt,snapshot=`${hearts}|${rewards}|${turnCount}|${unlockedAchievements.size}|${score}|${comboActive?combo:1}|${Math.floor(distance/10)}|${speed}`;if(snapshot===hudSnapshot)return;hudSnapshot=snapshot;if(!['ready','lost'].includes(state))return;$('heart-count').textContent=hearts;$('reward-count').textContent=rewards;$('turn-count').textContent=turnCount;$('achievement-count').textContent=unlockedAchievements.size;$('score').textContent=score;$('combo').textContent='×'+combo;$('combo').hidden=!comboActive;$('distance').textContent=Math.floor(distance/10);$('speed').textContent=speed;}
function setWorld(value){if(!Number.isInteger(value)||value<0||value>2)throw new Error('Choose world 0, 1, or 2.');world=value;reset();$('world-label').textContent=themes[world].name;$('world-emoji').textContent=themes[world].icon;document.querySelectorAll('[data-world]').forEach(b=>{const selected=+b.dataset.world===world;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',selected);b.querySelector('.world-check').textContent=selected?'✓':'↗';});announce(themes[world].name+' selected. Ready to play.');}
function showOverlay(kicker,title,copy,button){clearActivityBanner();$('loss-photo').hidden=state!=='lost';$('overlay').classList.toggle('loss-overlay',state==='lost');$('overlay-kicker').textContent=kicker;$('overlay-title').textContent=title;$('overlay-copy').innerHTML=copy;$('play').innerHTML=button+' <span>▸</span>';$('overlay').classList.remove('hidden');}
function reset(){state='ready';updateGameplayTouchLock();distance=0;hearts=0;rewards=0;turnCount=0;score=0;combo=1;comboExpiresAt=0;luckyUntil=0;boostsEntered=0;doubleJumps=0;napsCompleted=0;toiletsCompleted=0;achievementCooldown=0;achievementPoll=0;unlockedAchievements.clear();canvasAchievement=null;lane=0;x=0;y=0;vy=0;cameraTrackY=world===1?10:0;cameraFovPunch=0;boostFlash=0;activeHalt=null;pausedFrom='playing';activePath=null;eventMessageTimer=0;jumpAnimation='none';jumpAnimationProgress=1;hudSnapshot='';audioBus.cancel();runner.reset(world,[]);makeCourse();runner.reset(world,obstacles);hideGameEvent();syncRunner();updateCamera(0,true);hud();$('pause').disabled=true;$('pause').textContent='Ⅱ';$('pause').setAttribute('aria-label','Pause game');$('world-caption').hidden=false;showOverlay('A WORLD MADE FOR YOU','Hey, pretty kitty.','A tiny adventure. A whole lot of heart.<br>Achievements reset for every run.','Let’s play');$('start-hint').hidden=false;}
function showGestureTutorialOnce(){if(controlMode!=='gesture')return;try{if(localStorage.getItem(TUTORIAL_KEY))return;}catch{}canvasHintUntil=time+3;try{localStorage.setItem(TUTORIAL_KEY,'1');}catch{}}
function start(autoFullscreen=true){if(state==='paused'){resume();return;}if(state!=='ready')reset();state='playing';updateGameplayTouchLock();$('overlay').classList.add('hidden');$('pause').disabled=false;$('world-caption').hidden=true;canvas.focus({preventScroll:true});showGestureTutorialOnce();if(autoFullscreen&&coarsePointer&&!fullscreenActive())toggleFullscreen();melody([420,560,720],.08,.06,{name:'start'});announce('Adventure started. Double jump, follow the automatic bends, chase rewards, and choose accelerated paths.');}
function pause(){if(state!=='playing'&&state!=='resting')return;pausedFrom=state;state='paused';audioBus.cancel();updateGameplayTouchLock();$('pause').textContent='▸';$('pause').setAttribute('aria-label','Resume game');$('overlay').classList.add('hidden');announce('Game paused.');}
function resume(){state=pausedFrom==='resting'?'resting':'playing';updateGameplayTouchLock();last=performance.now();$('overlay').classList.add('hidden');if(state==='resting'&&activeHalt)setActivityBanner(activeHalt);$('pause').textContent='Ⅱ';$('pause').setAttribute('aria-label','Pause game');canvas.focus({preventScroll:true});}
function jump(){if(state==='playing')runner.jump();}
function move(direction){if(state==='playing'){const previousLane=runner.lane;runner.steer(direction);lane=runner.lane;if(lane!==previousLane)tone(direction<0?310:360,.045);}}
function beginGesture(event){if(controlMode!=='gesture'||state!=='playing'||event.pointerType==='mouse'||gestureStart)return;gestureStart={x:event.clientX,y:event.clientY,pointerId:event.pointerId,consumed:false};try{canvas.setPointerCapture(event.pointerId);}catch{}event.preventDefault();}
function moveGesture(event){const start=gestureStart;if(!start||event.pointerId!==start.pointerId||start.consumed)return;const dx=event.clientX-start.x,dy=event.clientY-start.y,threshold=Math.max(28,Math.min(52,Math.min(W,H)*.07)),action=CatInput.classifyGesture(dx,dy,threshold);if(!action)return;start.consumed=true;if(action==='left')move(-1);else if(action==='right')move(1);else jump();if(navigator.vibrate)navigator.vibrate(8);event.preventDefault();}
function endGesture(event){const start=gestureStart;if(!start||event.pointerId!==start.pointerId)return;gestureStart=null;try{canvas.releasePointerCapture(event.pointerId);}catch{}event.preventDefault();}
function cancelGesture(){gestureStart=null;}
function end(){if(state!=='playing'&&state!=='falling')return;state='lost';canvasAchievement=null;lastDeathAt=performance.now();updateGameplayTouchLock();$('pause').disabled=true;$('start-hint').hidden=true;bestScore=Math.max(bestScore,score);bestDistance=Math.max(bestDistance,Math.floor(distance/10));try{localStorage.setItem('purrfect-best-score',String(bestScore));localStorage.setItem('purrfect-best-distance',String(bestDistance));}catch{}const summary=`${score} pts · ${hearts} hearts · ${rewards} stars · ${turnCount} turns · ${Math.floor(distance/10)} m.`;$('overlay').classList.add('hidden');announce('Missed a jump. '+summary);audioBus.cancel();melody([190,150,110],.12,.08,{name:'loss'});}
function updatePathState(){
 const next=speedPaths.find(path=>distance>=path.start&&distance<path.end&&Math.abs(runner.x-path.lane*laneWidth)<38)||null;
 if(next===activePath)return;
 activePath=next;
 const multiplier=activePath?.multiplier||1;
 runner.pathMultiplier=multiplier;
 runner.speed=CatPhysics.speedAt(runner.elapsed)*multiplier;
 eventMessageTimer=0;
 if(activePath){boostsEntered++;if(!reduced){cameraFovPunch=.145;boostFlash=1;cameraFocal=Math.max(H*.5,cameraFocal-H*.075);}setGameEvent('⚡',`Accelerated path · ${activePath.multiplier.toFixed(1)}×`);melody([420,620,920],.07,.045,{name:'boost-entry',type:'sawtooth',gain:.045});announce(`Accelerated path active at ${activePath.multiplier.toFixed(1)} times speed.`);}
 else {hideGameEvent();tone(250,.055);}
}
function collectReward(label='Reward +1',icon='✦'){
 rewards++;
 luckyUntil=Math.max(luckyUntil,runner.elapsed)+6;
 awardPoints(50);
 flashGameEvent(icon,label);
 melody([680+rewards%4*80,820+rewards%3*70,980],.07,.045);
 const p=project(x,y+50,22);
 for(let i=0;i<(reduced?2:7);i++)particles.push({x:p.x,y:p.y,vx:(Math.random()-.5)*100,vy:-70-Math.random()*80,life:1.2,color:'#ffe9a6'});
 hud();
}
function beginHalt(stop){
 activeHalt={id:stop.id,type:stop.type,duration:stop.duration,remaining:stop.duration,elapsed:0};
 stop.triggered=true;
 state='resting';
 activePath=null;
 eventMessageTimer=0;
 runner.pathMultiplier=1;
 runner.speed=CatPhysics.speedAt(runner.elapsed);
 hideGameEvent();
 updateGameplayTouchLock();
 setActivityBanner(activeHalt);
 melody(stop.type==='sleep'?[280,230,180]:[420,320,250],.11,.08);
 announce(stop.type==='sleep'?'Nap time. The run is resting for 10 seconds.':'Bathroom break. The run is resting for 5 seconds.');
}
function updateHalt(dt){
 if(!activeHalt)return;
 activeHalt.elapsed+=dt;
 activeHalt.remaining=Math.max(0,activeHalt.remaining-dt);
 if(activeHalt.remaining>0)return;
 const type=activeHalt.type;
 if(type==='sleep')napsCompleted++;else toiletsCompleted++;
 activeHalt=null;
 state='playing';
 updateGameplayTouchLock();
 clearActivityBanner();
 last=performance.now();
 announce(type==='sleep'?'Nap complete. Back to the daydream.':'Break complete. Back to the daydream.');
 melody([520,680,840],.08,.055);
}
function handleCourseEvents(previousDistance){
 if(state!=='playing')return;
 let halted=false;
 forCourseRange(activityStops,previousDistance,distance,stop=>{
  if(halted||stop.triggered||previousDistance>=stop.z||distance<stop.z||Math.abs(runner.x-stop.lane*laneWidth)>=30)return;
  runner.distance=stop.z;syncRunner();beginHalt(stop);halted=true;
 });
 if(halted)return;
 forCourseRange(turnMarkers,previousDistance,distance,turn=>{
  if(turn.handled||previousDistance>=turn.end||distance<turn.end)return;
  turn.handled=true;
  turnCount++;
  awardPoints(75);
  collectReward('Hard turn reward +1','↪');
  melody(turn.direction<0?[360,500,700]:[700,500,360],.06,.045);
  announce(`Automatic hard turn ${turn.direction<0?'left':'right'} completed. Reward earned.`);
 },'start','end');
}
function smoothstep(value){const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);}
function routePoseAt(worldZ){const cached=routePoseCache.get(worldZ);if(cached)return cached;let centerX=0,yaw=0;for(const turn of turnMarkers){if(worldZ>=turn.end){centerX+=turn.direction*turn.shift;continue;}if(worldZ>turn.start){const progress=(worldZ-turn.start)/(turn.end-turn.start);centerX+=turn.direction*turn.shift*smoothstep(progress);yaw+=turn.direction*turn.maxYaw*Math.sin(Math.PI*progress);}if(turn.start>worldZ)break;}const pose={centerX,yaw};routePoseCache.set(worldZ,pose);return pose;}
function project(wx,wy,wz){const worldZ=distance+wz,route=routePoseAt(worldZ),cameraRoute=frameCameraRoute||routePoseAt(distance+22),relativeX=route.centerX-cameraRoute.centerX+wx-wz*Math.tan(cameraRoute.yaw),relativeY=wy-cameraTrackY,s=cameraFocal/Math.max(45,wz+cameraDistance);return{x:W*.5+relativeX*s+cameraSwayX,y:cameraBase+(cameraLookAt-relativeY)*s+cameraSwayY,s};}
function polygon(points,fill,stroke){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=.6;ctx.stroke();}}
function poly3(points,fill,stroke){ctx.beginPath();for(let i=0;i<points.length;i++){const p=project(points[i][0],points[i][1],points[i][2]);i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);}ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=.6;ctx.stroke();}}
function quad3(x1,y1,z1,x2,y2,z2,x3,y3,z3,x4,y4,z4,fill,stroke){const a=project(x1,y1,z1),b=project(x2,y2,z2),c=project(x3,y3,z3),d=project(x4,y4,z4);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.lineTo(c.x,c.y);ctx.lineTo(d.x,d.y);ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=.6;ctx.stroke();}}
function box(wx,z,width,depth,height,color,edge,side,base=0){const a=wx-width/2,b=wx+width/2,c=z-depth/2,d=z+depth/2;poly3([[a,base,c],[b,base,c],[b,height,c],[a,height,c]],side);poly3([[b,base,c],[b,base,d],[b,height,d],[b,height,c]],side);poly3([[a,height,c],[b,height,c],[b,height,d],[a,height,d]],color,edge);}
function ellipse(x,y,rx,ry,color){ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,Math.max(.1,rx),Math.max(.1,ry),0,0,Math.PI*2);ctx.fill();}
function heart(px,py,size,color){ctx.save();ctx.translate(px,py);ctx.scale(size/24,size/24);ctx.beginPath();ctx.moveTo(0,7);ctx.bezierCurveTo(-25,-8,-10,-23,0,-12);ctx.bezierCurveTo(10,-23,25,-8,0,7);ctx.fillStyle=color;ctx.fill();ctx.restore();}
function star(px,py,size,color){ctx.save();ctx.translate(px,py);ctx.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?size*.42:size;const x=Math.cos(a)*r,y=Math.sin(a)*r;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();ctx.fillStyle=color;ctx.fill();ctx.restore();}
function backdrop(){rebuildBackdropPaints();ctx.fillStyle=skyGradient;ctx.fillRect(0,0,W,H);ctx.fillStyle=skyGlow;ctx.fillRect(0,0,W,H);
 for(let layer=0;layer<2;layer++){for(let i=-1;i<9;i++){let px=((i*167+layer*79+(reduced?0:Math.sin(time*.035)*35))%(W+220))-70;let py=H*(.57+layer*.19)+Math.sin(i*4+layer)*29;ctx.globalAlpha=layer?.22:.25;ellipse(px,py,100,39,'#fff8e7');ellipse(px+30,py-21,52,39,'#fff8e7');ellipse(px-33,py-12,52,32,'#fff8e7');}}ctx.globalAlpha=1;
 // Floating tiled walls, receding into the dream.
 const mobile=W<720,wallCount=mobile?8:12,sparkleCount=mobile?16:24;
 for(let i=wallCount;i>=0;i--){let z=i*175-(distance%175);for(let row=0;row<2;row++){poly3([[-345,row*145,z],[-345,(row+1)*145,z],[-345,(row+1)*145,z+170],[-345,row*145,z+170]],(i+row)%2?'#dfc9ea4d':'#f5e6f25e',null);}}
 for(let i=0;i<sparkleCount;i++){const px=(Math.sin(i*127.1)*.5+.5)*W,py=(Math.cos(i*73.6)*.5+.5)*H;const alpha=.2+(Math.sin(time*(reduced?0:.7)+i)+1)*.2;ctx.fillStyle=`rgba(255,255,245,${alpha})`;ctx.fillRect(px,py,2,2);if(i%5===0){ctx.fillRect(px-3,py+1,8,1);ctx.fillRect(px+1,py-3,1,8);}}
}
// Raised keycaps and soft pads share their visible shape with the physics surface.
function drawTile(row){
 const t=themes[world],z=row*180-distance,hasGap=gapAt(row*180+1),depth=hasGap?120:179,far=z>950,mid=z>480;
 for(let col=-1;col<=1;col++){
  const surface=runner.tile(row,col),compression=runner.compression(surface.id),top=surface.height,bottom=Math.max(-22,top-30);
  const soft=world!==1,spread=soft?compression*.17:0,a=col*laneWidth-48-spread,b=col*laneWidth+48+spread;
  const inset=world===1?7:10;
  if(!far){quad3(a,top,z,b,top,z,b,bottom,z,a,bottom,z,t.side,null);if(!mid)quad3(b,top,z,b,top,z+depth-3,b,bottom,z+depth-3,b,bottom,z,t.side,null);}
  quad3(a,top,z,b,top,z,b,top,z+depth-3,a,top,z+depth-3,t.tile,far?null:t.edge);
  if(!mid)quad3(a+inset,top+2,z+inset,b-inset,top+2,z+inset,b-inset,top+2,z+depth-inset-3,a+inset,top+2,z+depth-inset-3,compression>2?t.edge:t.tile,t.edge);
  if(hasGap&&!far)quad3(a+5,top+3,z+depth-15,b-5,top+3,z+depth-15,b-5,top+3,z+depth-4,a+5,top+3,z+depth-4,'#fff0a6cc',null);
  if(mid)continue;
  const p=project(col*laneWidth,top+3,z+depth/2);
  if(world===1){ctx.save();ctx.translate(p.x,p.y);ctx.scale(1,.62);ctx.font=`600 ${Math.max(8,35*p.s)}px 'DM Sans',sans-serif`;ctx.textAlign='center';ctx.fillStyle=compression>2?'#a77ac4':'#fff6fb';ctx.fillText('YOUARELOVED'[(row*3+col+1)%11],0,8);ctx.restore();}
  else{ctx.globalAlpha=.45;ellipse(p.x,p.y,Math.max(1,3*p.s),Math.max(1,1.6*p.s),t.edge);ctx.globalAlpha=1;}
 }
}
function drawObstacle(o){
 const t=themes[world],s=runner.shape(o),z=o.z-distance,top=s.height;
 if(o.type==='milk'){
  // Cartons remain rigid; only the lid gives slightly on a landing.
  box(s.x,z,s.width,s.depth,top,'#fff0ea','#fff8f1','#dfaaa9',s.base);
  const a=s.x-s.width/2,b=s.x+s.width/2,front=z-s.depth/2;
  poly3([[a,top-12,front],[b,top-12,front],[b,top,front],[a,top,front]],t.accent);
  const p=project(s.x,s.base+(top-s.base)*.47,front-.2);heart(p.x,p.y,19*p.s,'#df819d');
 }else{
  box(s.x,z,s.width,s.depth,top,t.accent,t.edge,world===1?'#8e69b9':'#ce728e',s.base);
  const inset=world===1?6:9,a=s.x-s.width/2+inset,b=s.x+s.width/2-inset,c=z-s.depth/2+inset,d=z+s.depth/2-inset;
  poly3([[a,top+.5,c],[b,top+.5,c],[b,top+.5,d],[a,top+.5,d]],world===1?'#bd98df':'#f6a7bd',t.edge);
  const p=project(s.x,top+2,z);ctx.fillStyle='#ffffffc0';ctx.font=`${17*p.s}px sans-serif`;ctx.textAlign='center';ctx.fillText(world===1?'⌘':world===2?'☁':'✿',p.x,p.y);
 }
}
function drawPickup(h){const p=project(h.lane*laneWidth,h.height+Math.sin(time*2+h.z)*5,h.z-distance);ctx.save();ctx.shadowColor='#fff0b8';ctx.shadowBlur=12;heart(p.x,p.y,22*p.s,'#fff4c3');ctx.restore();}
function drawReward(r){const p=project(r.lane*laneWidth,r.height+Math.sin(time*2.4+r.z)*6,r.z-distance);ctx.save();ctx.shadowColor='#ffeaa5';ctx.shadowBlur=16;star(p.x,p.y,18*p.s,'#ffe38b');ctx.restore();}
function drawSpeedPath(path){const start=path.start-distance,end=path.end-distance,center=path.lane*laneWidth;if(end<-220||start-320>2700)return;for(let z=Math.max(start,-180);z<Math.min(end,2700);z+=90){const worldZ=distance+z,next=Math.min(z+90,end),y1=floorHeight(worldZ,path.lane)+3,y2=floorHeight(distance+next,path.lane)+3;poly3([[center-47,y1,z],[center+47,y1,z],[center+47,y2,next],[center-47,y2,next]],'#ffe29a66','#fff3c099');if(((z-start)/90|0)%2===0)poly3([[center-18,y1+3,z+34],[center,y1+3,z+12],[center+18,y1+3,z+34]],'#fff5bddd');}for(let z=Math.max(start-300,-180);z<Math.min(start,2700);z+=95){const y=floorHeight(distance+z,path.lane)+4;poly3([[center-14,y,z+28],[center,y,z+10],[center+14,y,z+28]],'#fff5bd88');}}
function drawHardTurn(turn){
 const start=turn.start-distance,end=turn.end-distance;
 if(end<-220||start>2700)return;
 const segments=10;
 for(let i=0;i<segments;i++){
  const a=i/segments,b=(i+1)/segments,z1=start+(end-start)*a,z2=start+(end-start)*b,y1=floorHeight(distance+z1,0)+4,y2=floorHeight(distance+z2,0)+4;
  poly3([[-148,y1,z1],[148,y1,z1],[148,y2,z2],[-148,y2,z2]],turn.direction<0?'#edc7d744':'#dfc9f244','#fff8e688');
 }
}
function drawActivityStop(stop){const z=stop.z-distance;if(z<-220||z>2700)return;const center=stop.lane*laneWidth,start=z-300,end=z+50,fill=stop.type==='sleep'?'#fff0c855':'#e9dcff55';for(let a=start;a<end;a+=60){const b=Math.min(end,a+60),y1=floorHeight(distance+a,stop.lane)+4,y2=floorHeight(distance+b,stop.lane)+4;poly3([[center-47,y1,a],[center+47,y1,a],[center+47,y2,b],[center-47,y2,b]],fill,'#fffaf099');}const labelY=floorHeight(stop.z,stop.lane)+92,p=project(center,labelY,z);ctx.save();ctx.textAlign='center';ctx.font=`700 ${Math.max(9,12*p.s)}px 'DM Sans',sans-serif`;ctx.fillStyle=stop.type==='sleep'?'#fff0c8':'#e9dcff';ctx.fillText(stop.type==='sleep'?'NAP · 10s':'TOILET · 5s',p.x,p.y);ctx.font=`500 ${Math.max(7,8*p.s)}px 'DM Sans',sans-serif`;ctx.fillStyle='#fffaf0';ctx.fillText('optional lane',p.x,p.y+11*p.s);ctx.restore();}
const jumpAnimationLabels={spin:'360° spin',backflip:'Backflip',twirl:'Twirl',tuck:'Tuck jump'};
function triggerJumpAnimation(){if(reduced){jumpAnimation='none';jumpAnimationProgress=1;return;}const types=Object.keys(jumpAnimationLabels);jumpAnimation=types[Math.floor(Math.random()*types.length)];jumpAnimationProgress=0;flashGameEvent('✦',jumpAnimationLabels[jumpAnimation]);}
function updateJumpAnimation(dt){if(jumpAnimationProgress<1)jumpAnimationProgress=Math.min(1,jumpAnimationProgress+dt/.9);}
function drawCat(){
 const p=project(x,y,22),ground=runner.supportAt(x,distance+22,y+1),shadow=project(x,ground?.height||0,22);
 ctx.globalAlpha=Math.max(.06,.22-y/750);ellipse(shadow.x,shadow.y+4,28*shadow.s,8*shadow.s,'#684f76');ctx.globalAlpha=1;
 ctx.save();if(runner.elapsed<luckyUntil){ctx.shadowColor='#ffe59a';ctx.shadowBlur=reduced?4:16;}ctx.translate(p.x,p.y-6*p.s);ctx.scale(p.s,p.s);
 const bob=state==='playing'&&runner.grounded?Math.sin(time*15)*1.2:0;
 ctx.translate(0,bob);ctx.scale(1+runner.squash*.08,1-runner.squash*.13);
 let jumpRotation=0,jumpScaleX=1,jumpScaleY=1;
 if(!runner.grounded&&jumpAnimation!=='none'){
  const progress=jumpAnimationProgress,arc=Math.sin(Math.PI*progress),fold=Math.abs(Math.cos(Math.PI*progress));
  if(jumpAnimation==='spin')jumpRotation=progress*Math.PI*2;
  else if(jumpAnimation==='backflip'){jumpRotation=progress*Math.PI*2;jumpScaleX=1+.05*arc;jumpScaleY=.72+.28*fold;}
  else if(jumpAnimation==='twirl'){jumpRotation=arc*Math.PI*1.25;jumpScaleX=1+.12*arc;jumpScaleY=.88+.12*fold;}
  else{jumpRotation=arc*.45;jumpScaleX=1+.18*arc;jumpScaleY=.66+.34*fold;}
 }
 ctx.scale(jumpScaleX,jumpScaleY);ctx.rotate((lane*laneWidth-x)*.0011+jumpRotation);
 const fur='#ad805c';
 // A swishing tail and four tiny paws; the tabby faces the path ahead.
 ctx.lineCap='round';ctx.strokeStyle='#956c4b';ctx.lineWidth=11;ctx.beginPath();ctx.moveTo(5,-9);ctx.bezierCurveTo(35,8,41,-13+Math.sin(time*4)*6,26,-24);ctx.stroke();ctx.strokeStyle='#684b3d';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(32,-15+Math.sin(time*4)*3);ctx.lineTo(28,-23);ctx.stroke();
 ellipse(-16,0,8,6,'#f1d7b0');ellipse(16,0,8,6,'#f1d7b0');ellipse(-17,-31,7,10,fur);ellipse(17,-31,7,10,fur);ellipse(0,-25,23,32,fur);
 ctx.strokeStyle='#634b3e';ctx.lineWidth=3.5;for(let side of [-1,1])for(let i=0;i<5;i++){ctx.beginPath();ctx.moveTo(side*21,-40+i*8);ctx.quadraticCurveTo(side*12,-43+i*8,side*7,-38+i*8);ctx.stroke();}ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(0,-46);ctx.lineTo(0,-8);ctx.stroke();
 polygon([{x:-24,y:-61},{x:-23,y:-86},{x:-8,y:-71}], '#976a4d');polygon([{x:24,y:-61},{x:23,y:-86},{x:8,y:-71}], '#976a4d');polygon([{x:-21,y:-70},{x:-21,y:-80},{x:-13,y:-71}], '#d39e95');polygon([{x:21,y:-70},{x:21,y:-80},{x:13,y:-71}], '#d39e95');ellipse(0,-58,27,23,fur);
 ctx.strokeStyle='#735140';ctx.lineWidth=4;for(let side of [-1,1]){for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(side*(8+i*7),-76+i*4);ctx.lineTo(side*(5+i*6),-65+i*4);ctx.stroke();}}ctx.strokeStyle='#e495b2';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(-17,-40);ctx.quadraticCurveTo(0,-34,17,-40);ctx.stroke();heart(0,-34,9,'#ffdc9e');ctx.restore();if(state==='playing'&&!runner.grounded){for(let index=0;index<2;index++){ctx.globalAlpha=index<runner.jumpsUsed ? .25 : .9;ellipse(p.x-8+index*16,p.y+18,4,4,'#fff7d0');}ctx.globalAlpha=1;}}
function decorate(){for(let i=4;i>=0;i--){const z=i*480+250-(distance%480),sign=i%2?1:-1,bob=reduced?0:Math.sin(time+i)*12,p=project(sign*(230+i%2*20),90+bob,z);if(p.y>H+60)continue;ellipse(p.x,p.y,27*p.s,22*p.s,world===1?'#bf8fdd':'#e994b5');ellipse(p.x-8*p.s,p.y-2*p.s,2*p.s,3*p.s,'#785579');ellipse(p.x+8*p.s,p.y-2*p.s,2*p.s,3*p.s,'#785579');ctx.strokeStyle='#785579';ctx.lineWidth=Math.max(.8,p.s);ctx.beginPath();ctx.arc(p.x,p.y+3*p.s,4*p.s,0,Math.PI);ctx.stroke();}}
function drawBoostEffects(){if(reduced||(!activePath&&boostFlash<.015))return;const intensity=Math.max(boostFlash,activePath ? .45 : 0);ctx.save();ctx.lineCap='round';ctx.lineWidth=1.5;for(let i=0;i<14;i++){const side=i%2?-1:1,phase=(time*(240+i*7)+i*83)%(H+180),y=phase-90,x=side<0?(i*37%Math.max(1,W*.28)):W-(i*43%Math.max(1,W*.28));ctx.globalAlpha=intensity*(.18+(i%4)*.035);ctx.strokeStyle=i%3?'#fff7cf':'#ffffff';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+(W*.5-x)*.18,y+42+intensity*35);ctx.stroke();}if(boostFlash>.02){ctx.globalAlpha=Math.min(.18,boostFlash*.16);ctx.fillStyle='#fff4bd';ctx.fillRect(0,0,W,H);}ctx.restore();}
function roundedPath(x,y,w,h,r){r=Math.min(r,w*.5,h*.5);ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
function roundPanel(x,y,w,h,r,fill,stroke){roundedPath(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}}
function canvasText(text,x,y,size,color='#63445a',align='left',weight=600){ctx.font=`${weight} ${size}px 'DM Sans',sans-serif`;ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillStyle=color;ctx.fillText(text,x,y);}
function drawCanvasHud(){
 if(state==='ready')return;
 const compact=W<560,top=compact?14:20,pad=compact?10:14,hudRight=fullscreenActive()?W-66:W-12,w=compact?hudRight-12:Math.min(620,hudRight-12),height=compact?58:42;
 ctx.save();roundPanel(12,top-12,w,height,18,'#fffaf0e8','#ffffff99');
 canvasText(`♡ ${hearts}   ✦ ${rewards}   ↪ ${turnCount}   🏆 ${unlockedAchievements.size}`,12+pad,compact?top+4:top+9,compact?13:15,'#71475f');
 const comboLabel=combo>1&&runner.elapsed<=comboExpiresAt?` · combo ×${combo}`:'';
 const right=12+w-pad;canvasText(`${score} pts · ${Math.floor(distance/10)} m · ${(runner.speed/CatPhysics.BASE_SPEED).toFixed(1)}×${comboLabel}`,right,compact?top+30:top+9,compact?11:14,'#71475f','right',500);
 ctx.restore();
}
function drawCanvasNotice(){if(!canvasNotice||canvasAchievement)return;const alpha=canvasNotice.persistent?1:Math.min(1,canvasNotice.remaining*1.8),label=`${canvasNotice.icon}  ${canvasNotice.label}`,w=Math.min(W-36,Math.max(190,label.length*7.5+42));ctx.save();ctx.globalAlpha=alpha;roundPanel((W-w)/2,68,w,39,18,'#5e3d57dc','#fff6');canvasText(label,W/2,88,13,'#fff8e9','center',700);ctx.restore();}
function drawAchievementUnlock(){
 if(!canvasAchievement)return;
 const a=canvasAchievement,age=a.total-a.remaining,inTime=Math.min(1,age/.16),outTime=Math.min(1,a.remaining/.3),alpha=Math.min(inTime,outTime),w=Math.min(W-24,400),h=64,top=W<560?68:58,drop=(1-Math.pow(1-inTime,3))*8-8,left=W/2-w/2;
 ctx.save();ctx.globalAlpha=alpha;ctx.translate(0,drop);roundPanel(left,top,w,h,16,'#4d3049f2','#ffe7a588');
 canvasText('🏆',left+25,top+32,19,'#ffe39a','center',700);canvasText('ACHIEVEMENT UNLOCKED',left+48,top+20,9,'#ffe39a','left',800);canvasText(a.name,left+48,top+41,16,'#fffaf0','left',800);canvasText(`+${a.bonus}`,left+w-16,top+32,12,'#ffe39a','right',800);ctx.restore();
}
function drawBreakUi(){if(state!=='resting'||!activeHalt)return;const sleep=activeHalt.type==='sleep',w=Math.min(W-36,390);ctx.save();roundPanel((W-w)/2,H*.35,w,122,22,'#51374eea','#fff7d080');canvasText(sleep?'☾  NAP BREAK':'✦  TOILET BREAK',W/2,H*.35+29,16,'#fff0b5','center',800);canvasText(`${Math.ceil(activeHalt.remaining)}s`,W/2,H*.35+65,30,'#fffaf1','center',800);canvasText(activeHalt.elapsed>=1?'tap to skip':'optional pause',W/2,H*.35+96,12,'#e8d6e2','center',500);ctx.restore();}
function drawCanvasControls(){if(state!=='playing'||controlMode!=='buttons'||!coarsePointer)return;const y=H-82;ctx.save();ctx.globalAlpha=.86;roundPanel(18,y,64,56,16,'#5c3d56b8','#fff8');roundPanel(92,y,64,56,16,'#5c3d56b8','#fff8');roundPanel(W-116,y,98,56,16,'#5c3d56c9','#fff8');canvasText('←',50,y+28,25,'#fff8ed','center');canvasText('→',124,y+28,25,'#fff8ed','center');canvasText('JUMP ×2',W-67,y+28,12,'#fff8ed','center',800);ctx.restore();}
function drawCanvasStateOverlay(){
 if(state!=='paused'&&state!=='lost')return;
 ctx.save();ctx.fillStyle='#271923c7';ctx.fillRect(0,0,W,H);const lost=state==='lost';
 if(lost&&lossImage.complete&&lossImage.naturalWidth){
  const imageH=Math.min(H*.56,430),imageW=imageH*lossImage.naturalWidth/lossImage.naturalHeight,imageX=(W-imageW)/2,imageY=Math.max(62,H*.08);
  roundPanel(imageX-4,imageY-4,imageW+8,imageH+8,20,'#fff7ef','#ffe6bb');ctx.save();roundedPath(imageX,imageY,imageW,imageH,16);ctx.clip();ctx.drawImage(lossImage,imageX,imageY,imageW,imageH);ctx.restore();
  const copyY=Math.min(H-76,imageY+imageH+28);canvasText('MISSED A STEP',W/2,copyY,Math.min(28,W*.07),'#fff8ed','center',800);canvasText(`${score} pts · ${Math.floor(distance/10)} m · tap to run again`,W/2,copyY+30,12,'#ffe6b2','center',600);
 }else if(lost){canvasText('MISSED A STEP',W/2,H*.43,Math.min(40,W*.085),'#fff8ed','center',800);canvasText(`${score} pts · ${Math.floor(distance/10)} m`,W/2,H*.51,16,'#ffe6b2','center',600);canvasText('tap to run again',W/2,H*.59,13,'#f5e7ef','center',500);}
 else{canvasText('PAUSED',W/2,H*.43,Math.min(40,W*.085),'#fff8ed','center',800);canvasText('the paws are waiting',W/2,H*.51,16,'#ffe6b2','center',600);canvasText('tap to resume',W/2,H*.59,13,'#f5e7ef','center',500);}
 ctx.restore();
}
function drawCanvasUi(){
 drawCanvasHud();drawCanvasNotice();drawBreakUi();drawCanvasControls();drawCanvasStateOverlay();drawAchievementUnlock();
 if(time<canvasHintUntil&&state==='playing'){ctx.save();roundPanel(Math.max(14,W/2-170),H-64,Math.min(W-28,340),40,18,'#51374ed9','#fff7');canvasText('Swipe ← → to move · swipe ↑ to jump',W/2,H-44,12,'#fff8ed','center',700);ctx.restore();}
 if(fullscreenActive()&&state!=='ready')canvasText('×',W-28,28,28,'#fff8ed','center',500);
}
function draw(){
 routePoseCache.clear();frameCameraRoute=routePoseAt(distance+22);ctx.clearRect(0,0,W,H);backdrop();decorate();
 const viewDistance=W<720?2200:2500,firstRow=Math.max(0,Math.floor((distance-360)/180)),lastRow=Math.ceil((distance+viewDistance)/180);
 // Below the floor, the platforms occlude the falling cat; otherwise paws stay above them.
 const beneath=y<-24;
 if(beneath)drawCat();
 for(let row=lastRow-1;row>=firstRow;row--)drawTile(row);
 const visibleMin=distance-220,visibleMax=distance+viewDistance;
 forCourseRange(speedPaths,visibleMin,visibleMax,drawSpeedPath,'start','end');
 forCourseRange(turnMarkers,distance-400,distance+viewDistance+200,drawHardTurn,'start','end');
 forCourseRange(activityStops,visibleMin,visibleMax,drawActivityStop);
 const entities=renderEntities;entities.length=0;
 forCourseRange(obstacles,visibleMin,visibleMax,o=>{const z=o.z-distance,s=runner.shape(o),above=y>=s.height-.5&&Math.abs(x-s.x)<s.width/2+CatPhysics.CAT.halfWidth&&Math.abs(z-22)<s.depth/2+CatPhysics.CAT.halfDepth;entities.push({z:above?23:z-s.depth/2,type:'obstacle',o});});
 forCourseRange(pickups,distance-70,visibleMax,h=>{const z=h.z-distance;if(!h.taken)entities.push({z,type:'heart',h});});
 forCourseRange(rewardPickups,distance-70,visibleMax,r=>{const z=r.z-distance;if(!r.taken)entities.push({z,type:'reward',r});});
 if(!beneath)entities.push({z:22,type:'cat'});
 entities.sort((a,b)=>b.z-a.z);
 for(const e of entities){if(e.type==='cat')drawCat();else if(e.type==='heart')drawPickup(e.h);else if(e.type==='reward')drawReward(e.r);else drawObstacle(e.o);}
 for(const p of particles){ctx.globalAlpha=Math.max(0,Math.min(1,p.life));heart(p.x,p.y,10,p.color);}ctx.globalAlpha=1;
 drawBoostEffects();
 drawCanvasUi();
 frameCameraRoute=null;
}
function syncRunner(){distance=runner.distance;x=runner.x;y=runner.y;vy=runner.vy;lane=runner.lane;}
function contactSound(kind,impact){if(!sound)return;if(kind==='key')melody([920,1160],.035,.03,{name:'step-key',cooldown:90});else if(kind==='carton')melody([230,180],.07,.045,{name:'step-carton',cooldown:110});else if(kind==='cloud')melody([520,700],.06,.04,{name:'step-cloud',cooldown:100});else tone(140,Math.min(.11,.045+impact/3000),{name:'step-jelly',cooldown:100});}
function update(dt){
 routePoseCache.clear();frameCameraRoute=null;
 if(state==='resting'){
  updateHalt(dt);
  if(state==='resting')runner.tickSprings(Math.min(dt,1/60),false);
 }else if(state==='playing'||state==='falling'){
  const previousDistance=distance;
  if(state==='playing')ensureCourseAhead();
  if(state==='playing')updatePathState();
  const events=runner.advance(dt);syncRunner();
  for(const event of events){if(event.type==='jump'){triggerJumpAnimation();if(event.jumpsUsed===2){doubleJumps++;melody([520,760,980],.08,.045,{name:'double-jump'});}else tone(390,.13,{name:'jump'});}else if(event.type==='land'||event.type==='step')contactSound(event.kind,event.impact);else if(event.type==='fall'){state='falling';updateGameplayTouchLock();melody([180,130],.1,.055,{name:'fall'});}else if(event.type==='lost')end();}
 if(state==='playing'){
   handleCourseEvents(previousDistance);
   if(state==='playing')forCourseRange(pickups,distance-15,distance+60,h=>{const radius=runner.elapsed<luckyUntil?105:42;if(!h.taken&&Math.abs(h.z-distance-22)<33&&Math.abs(h.lane*laneWidth-x)<radius&&y<h.height+20&&y+86>h.height-15){h.taken=true;hearts++;awardPoints(10);melody([620+hearts%5*60,780+hearts%3*50],.06,.04,{name:'heart'});const p=project(x,y+50,22),count=reduced?2:5;for(let i=0;i<count;i++)particles.push({x:p.x,y:p.y,vx:(Math.random()-.5)*80,vy:-60-Math.random()*70,life:1,color:'#fff3b4'});}});
   if(state==='playing')forCourseRange(rewardPickups,distance-20,distance+65,r=>{const radius=runner.elapsed<luckyUntil?110:44;if(!r.taken&&Math.abs(r.z-distance-22)<36&&Math.abs(r.lane*laneWidth-x)<radius&&y<r.height+22&&y+86>r.height-15){r.taken=true;collectReward('Lucky Paws · 6s');}});
 }
 }else runner.tickSprings(Math.min(dt,1/60),false);
 updateCamera(dt);
 updateJumpAnimation(dt);
 updateGameEvent(dt);
 checkAchievements(dt);
 hud();
 let liveParticles=0;for(let i=0;i<particles.length;i++){const p=particles[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;if(p.life>0)particles[liveParticles++]=p;}particles.length=liveParticles;
}
function frame(now){const dt=Math.min(.1,(now-last)/1000||.016);last=now;const active=state==='playing'||state==='falling'||state==='resting';if(active){time+=dt;update(dt);draw();}else if(state!=='paused'&&now-lastIdleDraw>100){lastIdleDraw=now;time+=dt;update(dt);draw();}else if(state==='paused'&&now-lastIdleDraw>250){lastIdleDraw=now;draw();}requestAnimationFrame(frame);}
$('play').addEventListener('click',start);
$('pause').addEventListener('click',()=>state==='paused'?resume():pause());
 $('sound').addEventListener('click',()=>{sound=!sound;audioBus.setEnabled(sound);try{localStorage.setItem('purrfect-sound',sound?'on':'off');}catch{}syncSoundUi();if(sound)tone(540,.08,{name:'sound-on'});});
fullscreenButtons.forEach(button=>button.addEventListener('click',toggleFullscreen));
controlModeButtons.forEach(button=>button.addEventListener('click',()=>setControlMode(button.dataset.controlMode)));
$('achievements-button').addEventListener('click',()=>{renderAchievements();$('achievements-dialog').showModal();});
$('close-achievements').addEventListener('click',()=>$('achievements-dialog').close());
$('achievements-dialog').addEventListener('click',e=>{if(e.target===$('achievements-dialog'))$('achievements-dialog').close();});
document.addEventListener('fullscreenchange',syncFullscreenUi);
document.addEventListener('webkitfullscreenchange',syncFullscreenUi);
function canvasPoint(event){const r=canvas.getBoundingClientRect();return{x:(event.clientX-r.left)*W/r.width,y:(event.clientY-r.top)*H/r.height};}
canvas.addEventListener('pointerdown',e=>{
 const p=canvasPoint(e);e.preventDefault();
 if(fullscreenActive()&&p.x>W-62&&p.y<62){toggleFullscreen();return;}
 if(state==='paused'){resume();return;}
 if(state==='lost'){if(performance.now()-lastDeathAt>250)start();return;}
 if(state==='resting'){if(activeHalt&&activeHalt.elapsed>=1)activeHalt.remaining=0;return;}
 if(state!=='playing')return;
 if(controlMode==='gesture'&&e.pointerType!=='mouse'){beginGesture(e);return;}
 if(controlMode==='buttons'&&e.pointerType!=='mouse'){
  if(p.y>H-105){if(p.x<87)move(-1);else if(p.x<166)move(1);else if(p.x>W-140)jump();return;}
 }
 jump();
});
canvas.addEventListener('pointermove',moveGesture,{passive:false});
canvas.addEventListener('pointerup',endGesture);
canvas.addEventListener('pointercancel',cancelGesture);
for(const type of ['touchstart','touchmove','touchend','touchcancel','pointerdown','pointermove','pointerup','pointercancel'])document.addEventListener(type,blockOutsideGameTouch,{capture:true,passive:false});
document.addEventListener('keydown',e=>{if($('note').open||$('achievements-dialog').open||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;const key=e.code,inGame=e.target===canvas||gameStage.contains(e.target),restart=state==='lost'&&performance.now()-lastDeathAt>250&&['Space','ArrowUp','KeyW'].includes(key);if(restart){e.preventDefault();if(!e.repeat)start();return;}if(['Space','ArrowUp','ArrowLeft','ArrowRight','KeyA','KeyD','KeyW','KeyP','Escape'].includes(key)&&(state==='playing'||state==='paused'||inGame)){e.preventDefault();if(e.repeat)return;if(key==='KeyP'||key==='Escape'){state==='paused'?resume():pause();return;}if(state!=='playing'){if(key==='Space'||key==='ArrowUp')start();return;}if(['Space','ArrowUp','KeyW'].includes(key))jump();if(['ArrowLeft','KeyA'].includes(key))move(-1);if(['ArrowRight','KeyD'].includes(key))move(1);}});
document.querySelectorAll('[data-world]').forEach(b=>b.addEventListener('click',()=>setWorld(+b.dataset.world)));
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
window.addEventListener('blur',()=>pause());
$('open-note').addEventListener('click',()=>{pause();$('note').showModal();});$('close-note').addEventListener('click',()=>$('note').close());$('note').addEventListener('click',e=>{if(e.target===$('note')){const r=$('note').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('note').close();}});
if(document.modelContext?.registerTool){const life=new AbortController();const specs=[{name:'read_cat_adventure',description:'Read the current cat adventure world, state, rewards, turns and distance.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute(){return{world:themes[world].name,state,hearts,rewards,turns:turnCount,meters:Math.floor(distance/10),speedMultiplier:Number((runner.speed/CatPhysics.BASE_SPEED).toFixed(2)),halt:activeHalt?{type:activeHalt.type,secondsRemaining:Number(activeHalt.remaining.toFixed(1))}:null};}},{name:'select_cat_world',description:'Select a cat adventure world and reset the game to its ready screen.',inputSchema:{type:'object',properties:{world:{type:'integer',minimum:0,maximum:2}},required:['world'],additionalProperties:false},execute(input){if(!input||Object.keys(input).some(k=>k!=='world'))throw new Error('Provide only a world number.');setWorld(input.world);return{world:themes[world].name,state};}}];for(const spec of specs){try{Promise.resolve(document.modelContext.registerTool(spec,{signal:life.signal})).catch(()=>{});}catch{}}window.addEventListener('pagehide',()=>life.abort(),{once:true});}
syncFullscreenUi();
syncControlModeUi();
syncSoundUi();
resize();reset();requestAnimationFrame(frame);
})();

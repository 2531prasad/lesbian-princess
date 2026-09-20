'use strict';
(() => {
const $ = id => document.getElementById(id);
const canvas = $('game'), ctx = canvas.getContext('2d');
const gameStage = $('game-stage');
const fullscreenButtons = [$('fullscreen'), $('stage-fullscreen')];
const themes = [
 {name:'Strawberry skies',icon:'✿',sky:['#f7c6b5','#f4d5d9','#ddcbef'],tile:'#f5b5c3',side:'#d992ac',edge:'#ffe4e9',accent:'#ed788d',wall:'#e2c9ef'},
 {name:'Lavender letters',icon:'⌘',sky:['#ead1fa','#d6c8ee','#f0cfe2'],tile:'#d1bbed',side:'#aa8ac9',edge:'#efe1ff',accent:'#a379ce',wall:'#dccbf0'},
 {name:'Cloud nine',icon:'☁',sky:['#f9d5a4','#f8ddd0','#e6d9f3'],tile:'#ffdeb8',side:'#dcac92',edge:'#fff0d6',accent:'#e6ac71',wall:'#edd5cb'}
];
let W=800,H=490,dpr=1,cameraFocal=H*1.14,cameraDistance=430,cameraBase=H*.29,cameraLookAt=225,world=0,state='ready',distance=0,hearts=0,rewards=0,turnCount=0,lane=0,x=0,y=0,vy=0,time=0,last=0,flight=0,fall=0,sound=true,audio;
let activeHalt=null,pausedFrom='playing',activePath=null,eventMessageTimer=0;
let obstacles=[],pickups=[],rewardPickups=[],turnMarkers=[],speedPaths=[],activityStops=[],particles=[],jumpBuffer=0;
let courseGeneratedTo=0,obstacleIndex=0,pickupIndex=0,rewardIndex=0,speedFeatureIndex=0,turnFeatureIndex=0,stopFeatureIndex=0,nextObstacleId=0;
let jumpAnimation='none',jumpAnimationProgress=1;
const progressLoop=7200,laneWidth=100,featureCycle=6300,routeHeight=64;
const speedPathBases=[1100,2500,3600,5000,6400],turnBases=[1850,3250,4650,5850],stopBases=[2100,3350,4700,6000];
const runner=new CatPhysics.Runner();
const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const controlModeButtons=[$('control-buttons'),$('control-gesture')];
let controlMode='buttons',gestureStart=null,hudSnapshot='',skyGradient=null,skyGlow=null,backdropPaintSize='';
try{controlMode=localStorage.getItem('purrfect-control-mode')==='gesture'?'gesture':'buttons';}catch{}
function resize(){const r=canvas.getBoundingClientRect();W=r.width;H=r.height;dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);updateCamera();rebuildBackdropPaints();}
new ResizeObserver(resize).observe(canvas);
function announce(text){$('announcement').textContent=text;}
function updateCamera(){const mobileFrame=W<720||W/Math.max(1,H)<.9;cameraDistance=mobileFrame?620:430;cameraFocal=H*(mobileFrame?.9:1.14);cameraLookAt=225;const catScale=cameraFocal/(cameraDistance+22);cameraBase=mobileFrame?H*.74-cameraLookAt*catScale:H*.29;}
function rebuildBackdropPaints(){const size=`${W}|${H}|${world}`;if(size===backdropPaintSize)return;const t=themes[world];skyGradient=ctx.createLinearGradient(0,0,0,H);t.sky.forEach((color,index)=>skyGradient.addColorStop(index/2,color));skyGlow=ctx.createRadialGradient(W*.64,H*.15,0,W*.64,H*.15,W*.5);skyGlow.addColorStop(0,'#fff4caad');skyGlow.addColorStop(1,'#fff4ca00');backdropPaintSize=size;}
function syncControlModeUi(){const gameStarted=!['ready','lost','won'].includes(state);gameStage.dataset.controlMode=controlMode;gameStage.dataset.gameActive=String(gameStarted);$('control-mode-picker').hidden=gameStarted;controlModeButtons.forEach(button=>{const selected=button.dataset.controlMode===controlMode;button.setAttribute('aria-pressed',String(selected));});const touchControls=gameStage.querySelector('.touch-controls');if(touchControls)touchControls.setAttribute('aria-hidden',String(controlMode!=='buttons'));$('gesture-hint').setAttribute('aria-hidden',String(!(controlMode==='gesture'&&gameStarted)));}
function setControlMode(mode){if(mode!=='buttons'&&mode!=='gesture')return;controlMode=mode;try{localStorage.setItem('purrfect-control-mode',mode);}catch{}syncControlModeUi();announce(mode==='gesture'?'Swipe controls enabled. Swipe left or right to move and up to jump.':'Button controls enabled. Use the on-screen arrows and jump button.');}
function nativeFullscreenElement(){return document.fullscreenElement||document.webkitFullscreenElement||null;}
function fullscreenActive(){return nativeFullscreenElement()===gameStage||gameStage.classList.contains('fullscreen-fallback');}
function syncFullscreenUi(){const active=fullscreenActive(),label=active?'Exit full screen':'Enter full screen',icon=active?'×':'⛶';fullscreenButtons.forEach(button=>{button.textContent=icon;button.setAttribute('aria-label',label);button.setAttribute('aria-pressed',String(active));button.title=label;});document.body.classList.toggle('fullscreen-fallback-active',gameStage.classList.contains('fullscreen-fallback'));}
function leaveFallbackFullscreen(){gameStage.classList.remove('fullscreen-fallback');syncFullscreenUi();}
function enterFallbackFullscreen(){gameStage.classList.add('fullscreen-fallback');syncFullscreenUi();announce('Full-screen view enabled. Tap the button again to exit.');}
async function toggleFullscreen(){
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
function setGameEvent(icon,label){$('game-event-icon').textContent=icon;$('game-event-label').textContent=label;$('game-event').hidden=false;}
function hideGameEvent(){$('game-event').hidden=true;}
function restorePathEvent(){if(activePath)setGameEvent('⚡',`Accelerated path · ${activePath.multiplier.toFixed(1)}×`);else hideGameEvent();}
function flashGameEvent(icon,label){setGameEvent(icon,label);eventMessageTimer=1.8;}
function updateGameEvent(dt){if(eventMessageTimer>0){eventMessageTimer=Math.max(0,eventMessageTimer-dt);if(eventMessageTimer===0)restorePathEvent();}else if(activePath)setGameEvent('⚡',`Accelerated path · ${activePath.multiplier.toFixed(1)}×`);}
function setActivityBanner(stop){$('activity-icon').textContent=stop.type==='sleep'?'☾':'🚽';$('activity-title').textContent=stop.type==='sleep'?'Nap time':'Bathroom break';$('activity-detail').textContent=stop.type==='sleep'?'Resting paws for ten seconds':'A quick five-second break';$('activity-timer').textContent=`${Math.ceil(stop.remaining??stop.duration)}s`;$('activity-banner').hidden=false;}
function clearActivityBanner(){$('activity-banner').hidden=true;}
function tone(frequency=500,duration=.1){if(!sound)return;try{audio ||= new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();const o=audio.createOscillator(),g=audio.createGain();o.type='sine';o.frequency.setValueAtTime(frequency,audio.currentTime);o.frequency.exponentialRampToValueAtTime(frequency*1.4,audio.currentTime+duration);g.gain.setValueAtTime(.06,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+duration);}catch{}}
function melody(notes,duration=.08,spacing=.055){if(!sound||!notes.length)return;tone(notes[0],duration);notes.slice(1).forEach((frequency,index)=>setTimeout(()=>tone(frequency,duration),(index+1)*spacing*1000));}
function syncSoundUi(){const button=$('sound');button.setAttribute('aria-pressed',String(sound));button.setAttribute('aria-label',sound?'Turn sound off':'Turn sound on');button.querySelector('.sound-slash').hidden=sound;}
function floorHeight(z,lane){return (world===1?10:0)+CatPhysics.elevationAt(world,Math.floor(z/180),lane);}
function featureBlocksObstacle(z){return speedPaths.some(p=>z>p.start-75&&z<p.end+75)||turnMarkers.some(t=>Math.abs(t.z-z)<90)||activityStops.some(s=>Math.abs(s.z-z)<170);}
function generateCourseUntil(limit){
 const featureLimit=limit+500;
 while(speedFeatureIndex<speedPathBases.length*Math.ceil((featureLimit+1)/featureCycle)){
  const index=speedFeatureIndex%speedPathBases.length,cycle=Math.floor(speedFeatureIndex/speedPathBases.length),start=speedPathBases[index]+cycle*featureCycle;
  if(start>featureLimit)break;
  speedPaths.push({id:speedPaths.length,start,end:start+520,multiplier:1.55});
  speedFeatureIndex++;
 }
 while(turnFeatureIndex<turnBases.length*Math.ceil((featureLimit+1)/featureCycle)){
  const index=turnFeatureIndex%turnBases.length,cycle=Math.floor(turnFeatureIndex/turnBases.length),z=turnBases[index]+cycle*featureCycle,direction=turnFeatureIndex%2===0?-1:1;
  if(z>featureLimit)break;
  turnMarkers.push({id:turnMarkers.length,z,direction,targetLane:direction,handled:false});
  turnFeatureIndex++;
 }
 while(stopFeatureIndex<stopBases.length*Math.ceil((featureLimit+1)/featureCycle)){
  const index=stopFeatureIndex%stopBases.length,cycle=Math.floor(stopFeatureIndex/stopBases.length),z=stopBases[index]+cycle*featureCycle,isSleep=stopFeatureIndex%2===0;
  if(z>featureLimit)break;
  activityStops.push({id:activityStops.length,z,type:isSleep?'sleep':'toilet',duration:isSleep?10:5,lane:isSleep?1:-1,triggered:false});
  stopFeatureIndex++;
 }
 while(650+obstacleIndex*170<=featureLimit){
  const i=obstacleIndex++,z=650+i*170,obstacleLane=((i*7+world)%3)-1;
  if(isGap(z-55)||isGap(z)||isGap(z+55)||featureBlocksObstacle(z))continue;
  obstacles.push({id:nextObstacleId++,z,lane:obstacleLane,base:floorHeight(z,obstacleLane),type:i%4===2?'milk':'block',hit:false});
  const alternateLane=obstacleLane===1?-1:1;
  if(i%6===4&&!featureBlocksObstacle(z))obstacles.push({id:nextObstacleId++,z,lane:alternateLane,base:floorHeight(z,alternateLane),type:'block',hit:false});
 }
 while(340+pickupIndex*104<=featureLimit){
  const i=pickupIndex++,z=340+i*104,lane=((Math.floor(i/3)+world)%3)-1;
  const obstacle=obstacles.find(o=>o.lane===lane&&Math.abs(o.z-z)<65);
  pickups.push({z,lane,taken:false,height:floorHeight(z,lane)+(obstacle?.type==='milk'?75:43)+ (obstacle?35:0)});
 }
 while(720+rewardIndex*560<=featureLimit){
  const i=rewardIndex++,z=720+i*560,lane=((i*2+world)%3)-1;
  rewardPickups.push({z,lane,taken:false,height:floorHeight(z,lane)+58});
 }
 courseGeneratedTo=limit;
}
function trimCourseHistory(){const cutoff=distance-900;const trim=(items,startKey='z',endKey=startKey)=>{let index=courseLowerBound(items,cutoff,startKey);if(startKey!==endKey)while(index>0&&items[index-1][endKey]>=cutoff)index--;if(index>0)items.splice(0,index);};trim(obstacles);trim(pickups);trim(rewardPickups);trim(turnMarkers);trim(activityStops);trim(speedPaths,'start','end');}
function ensureCourseAhead(){const target=Math.max(9000,distance+5000);if(target>courseGeneratedTo)generateCourseUntil(target);trimCourseHistory();}
function makeCourse(){
 obstacles=[];pickups=[];rewardPickups=[];turnMarkers=[];speedPaths=[];activityStops=[];particles=[];
 courseGeneratedTo=0;obstacleIndex=0;pickupIndex=0;rewardIndex=0;speedFeatureIndex=0;turnFeatureIndex=0;stopFeatureIndex=0;nextObstacleId=0;
 generateCourseUntil(9000);
}
function gapAt(z){const row=Math.floor(z/180);return row>4 && row%7===5;}
function isGap(z){return gapAt(z)&&z%180>120;}
function courseLowerBound(items,value,key){let low=0,high=items.length;while(low<high){const middle=(low+high)>>1;if(items[middle][key]<value)low=middle+1;else high=middle;}return low;}
function forCourseRange(items,min,max,visit,startKey='z',endKey=startKey){if(!items.length)return;let index=courseLowerBound(items,min,startKey);if(endKey!==startKey)while(index>0&&items[index-1][endKey]>=min)index--;for(;index<items.length&&items[index][startKey]<=max;index++){if(items[index][endKey]>=min)visit(items[index]);}}
function hud(){const speed=(runner.speed/CatPhysics.BASE_SPEED).toFixed(1),snapshot=`${hearts}|${rewards}|${turnCount}|${Math.floor(distance/10)}|${speed}`;if(snapshot===hudSnapshot)return;hudSnapshot=snapshot;$('heart-count').textContent=hearts;$('reward-count').textContent=rewards;$('turn-count').textContent=turnCount;$('distance').textContent=Math.floor(distance/10);$('speed').textContent=speed;}
function setWorld(value){if(!Number.isInteger(value)||value<0||value>2)throw new Error('Choose world 0, 1, or 2.');world=value;reset();$('world-label').textContent=themes[world].name;$('world-emoji').textContent=themes[world].icon;document.querySelectorAll('[data-world]').forEach(b=>{const selected=+b.dataset.world===world;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',selected);b.querySelector('.world-check').textContent=selected?'✓':'↗';});announce(themes[world].name+' selected. Ready to play.');}
function showOverlay(kicker,title,copy,button){clearActivityBanner();$('loss-photo').hidden=state!=='lost';$('overlay').classList.toggle('loss-overlay',state==='lost');$('overlay-kicker').textContent=kicker;$('overlay-title').textContent=title;$('overlay-copy').innerHTML=copy;$('play').innerHTML=button+' <span>▸</span>';$('overlay').classList.remove('hidden');}
function reset(){state='ready';updateGameplayTouchLock();distance=0;hearts=0;rewards=0;turnCount=0;lane=0;x=0;y=0;vy=0;fall=0;flight=0;jumpBuffer=0;activeHalt=null;pausedFrom='playing';activePath=null;eventMessageTimer=0;jumpAnimation='none';jumpAnimationProgress=1;hudSnapshot='';makeCourse();runner.reset(world,obstacles);hideGameEvent();syncRunner();hud();$('pause').disabled=true;$('pause').textContent='Ⅱ';$('pause').setAttribute('aria-label','Pause game');$('world-caption').hidden=false;showOverlay('A WORLD MADE FOR YOU','Hey, pretty kitty.','A tiny adventure. A whole lot of heart.<br>Ready to land on your paws?','Let’s play');$('start-hint').hidden=false;}
function start(){if(state==='paused'){resume();return;}if(state!=='ready')reset();state='playing';updateGameplayTouchLock();$('overlay').classList.add('hidden');$('pause').disabled=false;$('world-caption').hidden=true;canvas.focus({preventScroll:true});melody([420,560,720],.08,.06);announce('Adventure started. Double jump, ride the automatic turns, chase rewards, and use the accelerated paths.');}
function pause(){if(state!=='playing'&&state!=='resting')return;pausedFrom=state;state='paused';updateGameplayTouchLock();$('pause').textContent='▸';$('pause').setAttribute('aria-label','Resume game');showOverlay('A LITTLE PAWS','Take your time.','Your daydream will be right here.','Keep going');announce('Game paused.');}
function resume(){state=pausedFrom==='resting'?'resting':'playing';updateGameplayTouchLock();last=performance.now();$('overlay').classList.add('hidden');if(state==='resting'&&activeHalt)setActivityBanner(activeHalt);$('pause').textContent='Ⅱ';$('pause').setAttribute('aria-label','Pause game');canvas.focus({preventScroll:true});}
function jump(){if(state==='playing')runner.jump();}
function move(direction){if(state==='playing'){const previousLane=runner.lane;runner.steer(direction);lane=runner.lane;if(lane!==previousLane)tone(direction<0?310:360,.045);}}
function beginGesture(event){if(controlMode!=='gesture'||state!=='playing'||event.pointerType==='mouse'||gestureStart)return;gestureStart={x:event.clientX,y:event.clientY,pointerId:event.pointerId};try{canvas.setPointerCapture(event.pointerId);}catch{}event.preventDefault();}
function endGesture(event){const start=gestureStart;if(!start||event.pointerId!==start.pointerId){return;}gestureStart=null;try{canvas.releasePointerCapture(event.pointerId);}catch{}const dx=event.clientX-start.x,dy=event.clientY-start.y,threshold=Math.max(28,Math.min(58,Math.min(W,H)*.08));if(state==='playing'&&Math.max(Math.abs(dx),Math.abs(dy))>=threshold){if(Math.abs(dx)>Math.abs(dy))move(dx<0?-1:1);else if(dy<0)jump();}event.preventDefault();}
function cancelGesture(){gestureStart=null;}
function end(won=false){if(state!=='playing'&&state!=='falling')return;state=won?'won':'lost';updateGameplayTouchLock();$('pause').disabled=true;$('start-hint').hidden=true;const score=`${hearts} heart${hearts===1?'':'s'} · ${rewards} reward${rewards===1?'':'s'} · ${turnCount} turn${turnCount===1?'':'s'} in ${Math.floor(distance/10)} m.`;showOverlay(won?'ROYALLY WELL DONE':'SOFT LANDINGS, ALWAYS',won?'That’s my girl.':'Oh no, you lost!',score+'<br>'+(won?'A whole little world, conquered by you.':'Even princesses miss a jump. Try again?'),won?'Another daydream':'One more life');announce((won?'Course complete. ':'Missed a jump. ')+score);if(won){for(let i=0;i<60;i++)particles.push({x:Math.random()*W,y:Math.random()*H,vy:-Math.random()*80,vx:(Math.random()-.5)*100,life:4,color:['#dc6f91','#b38ccc','#eab56e'][i%3]});melody([740,880,1040],.12,.08);}else melody([190,150,110],.12,.08);}
function updatePathState(){
 const next=speedPaths.find(path=>distance>=path.start&&distance<path.end)||null;
 if(next===activePath)return;
 activePath=next;
 const multiplier=activePath?.multiplier||1;
 runner.pathMultiplier=multiplier;
 runner.speed=CatPhysics.BASE_SPEED*Math.exp(CatPhysics.RAMP*runner.elapsed)*multiplier;
 eventMessageTimer=0;
 if(activePath){setGameEvent('⚡',`Accelerated path · ${activePath.multiplier.toFixed(1)}×`);melody([520,680,860],.06,.05);announce(`Accelerated path active at ${activePath.multiplier.toFixed(1)} times speed.`);}
 else {hideGameEvent();tone(250,.055);}
}
function collectReward(label='Reward +1',icon='✦'){
 rewards++;
 flashGameEvent(icon,label);
 melody([680+rewards%4*80,820+rewards%3*70,980],.07,.045);
 const p=project(x,y+50,22);
 for(let i=0;i<7;i++)particles.push({x:p.x,y:p.y,vx:(Math.random()-.5)*100,vy:-70-Math.random()*80,life:1.2,color:'#ffe9a6'});
 hud();
}
function beginHalt(stop){
 activeHalt={id:stop.id,type:stop.type,duration:stop.duration,remaining:stop.duration};
 stop.triggered=true;
 state='resting';
 activePath=null;
 eventMessageTimer=0;
 runner.pathMultiplier=1;
 runner.speed=CatPhysics.BASE_SPEED*Math.exp(CatPhysics.RAMP*runner.elapsed);
 hideGameEvent();
 updateGameplayTouchLock();
 setActivityBanner(activeHalt);
 melody(stop.type==='sleep'?[280,230,180]:[420,320,250],.11,.08);
 announce(stop.type==='sleep'?'Nap time. The run is resting for 10 seconds.':'Bathroom break. The run is resting for 5 seconds.');
}
function updateHalt(dt){
 if(!activeHalt)return;
 activeHalt.remaining=Math.max(0,activeHalt.remaining-dt);
 $('activity-timer').textContent=`${Math.ceil(activeHalt.remaining)}s`;
 if(activeHalt.remaining>0)return;
 const type=activeHalt.type;
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
  if(halted||stop.triggered||previousDistance>=stop.z||distance<stop.z||runner.lane!==stop.lane)return;
  runner.distance=stop.z;syncRunner();beginHalt(stop);halted=true;
 });
 if(halted)return;
 forCourseRange(turnMarkers,previousDistance,distance,turn=>{
  if(turn.handled||previousDistance>=turn.z||distance<turn.z)return;
  turn.handled=true;
  runner.lane=turn.targetLane;
  lane=runner.lane;
  turnCount++;
  collectReward('Hard turn reward +1','↪');
  melody(turn.direction<0?[360,500,700]:[700,500,360],.06,.045);
  announce(`Automatic hard turn ${turn.direction<0?'left':'right'} completed. Reward earned.`);
 });
}
function project(wx,wy,wz){const s=cameraFocal/Math.max(45,wz+cameraDistance);return{x:W*.5+wx*s,y:cameraBase+(cameraLookAt-wy)*s,s};}
function polygon(points,fill,stroke){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=.6;ctx.stroke();}}
function poly3(points,fill,stroke){polygon(points.map(p=>project(...p)),fill,stroke);}
function box(wx,z,width,depth,height,color,edge,side,base=0){const a=wx-width/2,b=wx+width/2,c=z-depth/2,d=z+depth/2;poly3([[a,base,c],[b,base,c],[b,height,c],[a,height,c]],side);poly3([[b,base,c],[b,base,d],[b,height,d],[b,height,c]],side);poly3([[a,height,c],[b,height,c],[b,height,d],[a,height,d]],color,edge);}
function ellipse(x,y,rx,ry,color){ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,Math.max(.1,rx),Math.max(.1,ry),0,0,Math.PI*2);ctx.fill();}
function heart(px,py,size,color){ctx.save();ctx.translate(px,py);ctx.scale(size/24,size/24);ctx.beginPath();ctx.moveTo(0,7);ctx.bezierCurveTo(-25,-8,-10,-23,0,-12);ctx.bezierCurveTo(10,-23,25,-8,0,7);ctx.fillStyle=color;ctx.fill();ctx.restore();}
function star(px,py,size,color){ctx.save();ctx.translate(px,py);ctx.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?size*.42:size;const x=Math.cos(a)*r,y=Math.sin(a)*r;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();ctx.fillStyle=color;ctx.fill();ctx.restore();}
function backdrop(){rebuildBackdropPaints();ctx.fillStyle=skyGradient;ctx.fillRect(0,0,W,H);ctx.fillStyle=skyGlow;ctx.fillRect(0,0,W,H);
 for(let layer=0;layer<2;layer++){for(let i=-1;i<9;i++){let px=((i*167+layer*79+(reduced?0:Math.sin(time*.035)*35))%(W+220))-70;let py=H*(.57+layer*.19)+Math.sin(i*4+layer)*29;ctx.globalAlpha=layer?.22:.25;ellipse(px,py,100,39,'#fff8e7');ellipse(px+30,py-21,52,39,'#fff8e7');ellipse(px-33,py-12,52,32,'#fff8e7');}}ctx.globalAlpha=1;
 // Floating tiled walls, receding into the dream.
 for(let i=13;i>=0;i--){let z=i*155-(distance%155);for(let row=0;row<3;row++){poly3([[-345,row*115,z],[-345,(row+1)*115,z],[-345,(row+1)*115,z+150],[-345,row*115,z+150]],(i+row)%2?'#dfc9ea5c':'#f5e6f270','#ffffff30');}}
 for(let i=0;i<26;i++){const px=(Math.sin(i*127.1)*.5+.5)*W,py=(Math.cos(i*73.6)*.5+.5)*H;const alpha=.2+(Math.sin(time*(reduced?0:.7)+i)+1)*.2;ctx.fillStyle=`rgba(255,255,245,${alpha})`;ctx.fillRect(px,py,2,2);if(i%5===0){ctx.fillRect(px-3,py+1,8,1);ctx.fillRect(px+1,py-3,1,8);}}
}
// Raised keycaps and soft pads share their visible shape with the physics surface.
function drawTile(row){
 const t=themes[world],z=row*180-distance,depth=gapAt(row*180+1)?120:179;
 for(let col=-1;col<=1;col++){
  const surface=runner.tile(row,col),compression=runner.compression(surface.id),top=surface.height;
  const soft=world!==1,spread=soft?compression*.17:0,a=col*laneWidth-48-spread,b=col*laneWidth+48+spread;
  const inset=world===1?7:10;
  poly3([[a,top,z],[b,top,z],[b,-22,z],[a,-22,z]],t.side);
  poly3([[b,top,z],[b,top,z+depth-3],[b,-22,z+depth-3],[b,-22,z]],t.side);
  poly3([[a,top,z],[b,top,z],[b,top,z+depth-3],[a,top,z+depth-3]],t.tile,t.edge);
  poly3([[a+inset,top+2,z+inset],[b-inset,top+2,z+inset],[b-inset,top+2,z+depth-inset-3],[a+inset,top+2,z+depth-inset-3]],compression>2?t.edge:t.tile,t.edge);
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
function drawSpeedPath(path){const start=path.start-distance,end=path.end-distance;if(end<-220||start>2700)return;poly3([[-155,routeHeight,start],[155,routeHeight,start],[155,routeHeight,end],[-155,routeHeight,end]],'#ffe29a55','#fff3c088');for(let i=0;i<4;i++){const z=start+45+i*55;if(z<-180||z>2600)continue;poly3([[-23,routeHeight+4,z+28],[0,routeHeight+4,z],[23,routeHeight+4,z+28]],'#fff5bdcc');}}
function drawHardTurn(turn){
 const start=turn.z-180-distance,end=turn.z+160-distance;
 if(end<-220||start>2700)return;
 const destination=turn.targetLane*laneWidth,segments=6;
 for(let i=0;i<segments;i++){
  const a=i/segments,b=(i+1)/segments,ease=t=>t*t*(3-2*t),x1=ease(a)*destination,x2=ease(b)*destination,z1=start+(end-start)*a,z2=start+(end-start)*b;
  poly3([[x1-47,routeHeight,z1],[x1+47,routeHeight,z1],[x2+47,routeHeight,z2],[x2-47,routeHeight,z2]],turn.direction<0?'#edc7d788':'#dfc9f288','#fff8e6aa');
  poly3([[x1-8,routeHeight+4,z1+4],[x1+8,routeHeight+4,z1+4],[x2+8,routeHeight+4,z2-4],[x2-8,routeHeight+4,z2-4]],'#fff4bdcc');
 }
}
function drawActivityStop(stop){const z=stop.z-distance;if(z<-220||z>2700)return;const p=project(stop.lane*laneWidth,92,z);ctx.save();ctx.textAlign='center';ctx.font=`700 ${Math.max(9,12*p.s)}px 'DM Sans',sans-serif`;ctx.fillStyle=stop.type==='sleep'?'#fff0c8':'#e9dcff';ctx.shadowColor='#6d506f';ctx.shadowBlur=7;ctx.fillText(stop.type==='sleep'?'NAP · 10s':'TOILET · 5s',p.x,p.y);ctx.font=`500 ${Math.max(7,8*p.s)}px 'DM Sans',sans-serif`;ctx.fillStyle='#fffaf0';ctx.fillText('optional',p.x,p.y+11*p.s);ctx.restore();}
const jumpAnimationLabels={spin:'360° spin',backflip:'Backflip',twirl:'Twirl',tuck:'Tuck jump'};
function triggerJumpAnimation(){const types=Object.keys(jumpAnimationLabels);jumpAnimation=types[Math.floor(Math.random()*types.length)];jumpAnimationProgress=0;flashGameEvent('✦',jumpAnimationLabels[jumpAnimation]);}
function updateJumpAnimation(dt){if(jumpAnimationProgress<1)jumpAnimationProgress=Math.min(1,jumpAnimationProgress+dt/.9);}
function drawCat(){
 const p=project(x,y,22),ground=runner.supportAt(x,distance+22,y+1),shadow=project(x,ground?.height||0,22);
 ctx.globalAlpha=Math.max(.06,.22-y/750);ellipse(shadow.x,shadow.y+4,28*shadow.s,8*shadow.s,'#684f76');ctx.globalAlpha=1;
 ctx.save();ctx.translate(p.x,p.y-6*p.s);ctx.scale(p.s,p.s);
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
 const fur=ctx.createLinearGradient(-24,0,25,0);fur.addColorStop(0,'#936548');fur.addColorStop(.3,'#cfab7e');fur.addColorStop(.52,'#b99466');fur.addColorStop(1,'#8a6046');
 // A swishing tail and four tiny paws; the tabby faces the path ahead.
 ctx.lineCap='round';ctx.strokeStyle='#956c4b';ctx.lineWidth=11;ctx.beginPath();ctx.moveTo(5,-9);ctx.bezierCurveTo(35,8,41,-13+Math.sin(time*4)*6,26,-24);ctx.stroke();ctx.strokeStyle='#684b3d';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(32,-15+Math.sin(time*4)*3);ctx.lineTo(28,-23);ctx.stroke();
 ellipse(-16,0,8,6,'#f1d7b0');ellipse(16,0,8,6,'#f1d7b0');ellipse(-17,-31,7,10,fur);ellipse(17,-31,7,10,fur);ellipse(0,-25,23,32,fur);
 ctx.strokeStyle='#634b3e';ctx.lineWidth=3.5;for(let side of [-1,1])for(let i=0;i<5;i++){ctx.beginPath();ctx.moveTo(side*21,-40+i*8);ctx.quadraticCurveTo(side*12,-43+i*8,side*7,-38+i*8);ctx.stroke();}ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(0,-46);ctx.lineTo(0,-8);ctx.stroke();
 polygon([{x:-24,y:-61},{x:-23,y:-86},{x:-8,y:-71}], '#976a4d');polygon([{x:24,y:-61},{x:23,y:-86},{x:8,y:-71}], '#976a4d');polygon([{x:-21,y:-70},{x:-21,y:-80},{x:-13,y:-71}], '#d39e95');polygon([{x:21,y:-70},{x:21,y:-80},{x:13,y:-71}], '#d39e95');ellipse(0,-58,27,23,fur);
 ctx.strokeStyle='#735140';ctx.lineWidth=4;for(let side of [-1,1]){for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(side*(8+i*7),-76+i*4);ctx.lineTo(side*(5+i*6),-65+i*4);ctx.stroke();}}ctx.strokeStyle='#e495b2';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(-17,-40);ctx.quadraticCurveTo(0,-34,17,-40);ctx.stroke();heart(0,-34,9,'#ffdc9e');ctx.restore();}
function decorate(){for(let i=4;i>=0;i--){const z=i*480+250-(distance%480),sign=i%2?1:-1;const p=project(sign*(230+i%2*20),90+Math.sin(time+i)*12,z);if(p.y>H+60)continue;ellipse(p.x,p.y,27*p.s,22*p.s,world===1?'#bf8fdd':'#e994b5');ellipse(p.x-8*p.s,p.y-2*p.s,2*p.s,3*p.s,'#785579');ellipse(p.x+8*p.s,p.y-2*p.s,2*p.s,3*p.s,'#785579');ctx.strokeStyle='#785579';ctx.lineWidth=Math.max(.8,p.s);ctx.beginPath();ctx.arc(p.x,p.y+3*p.s,4*p.s,0,Math.PI);ctx.stroke();}}
function draw(){
 ctx.clearRect(0,0,W,H);backdrop();decorate();
 const tiles=[];for(let r=Math.max(0,Math.floor((distance-360)/180));r<Math.ceil((distance+2700)/180);r++)tiles.push(r);
 // Below the floor, the platforms occlude the falling cat; otherwise paws stay above them.
 const beneath=y<-24;
 if(beneath)drawCat();
 for(const row of tiles.reverse())drawTile(row);
 const visibleMin=distance-220,visibleMax=distance+2700;
 forCourseRange(speedPaths,visibleMin,visibleMax,drawSpeedPath,'start','end');
 forCourseRange(turnMarkers,distance-400,distance+2900,drawHardTurn);
 forCourseRange(activityStops,visibleMin,visibleMax,drawActivityStop);
 const entities=[];
 forCourseRange(obstacles,visibleMin,visibleMax,o=>{const z=o.z-distance,s=runner.shape(o),above=y>=s.height-.5&&Math.abs(x-s.x)<s.width/2+CatPhysics.CAT.halfWidth&&Math.abs(z-22)<s.depth/2+CatPhysics.CAT.halfDepth;entities.push({z:above?23:z-s.depth/2,type:'obstacle',o});});
 forCourseRange(pickups,distance-70,distance+2700,h=>{const z=h.z-distance;if(!h.taken)entities.push({z,type:'heart',h});});
 forCourseRange(rewardPickups,distance-70,distance+2700,r=>{const z=r.z-distance;if(!r.taken)entities.push({z,type:'reward',r});});
 if(!beneath)entities.push({z:22,type:'cat'});
 entities.sort((a,b)=>b.z-a.z);
 for(const e of entities){if(e.type==='cat')drawCat();else if(e.type==='heart')drawPickup(e.h);else if(e.type==='reward')drawReward(e.r);else drawObstacle(e.o);}
 for(const p of particles){ctx.globalAlpha=Math.max(0,Math.min(1,p.life));heart(p.x,p.y,10,p.color);}ctx.globalAlpha=1;
 if(state==='playing'){const progress=(distance%progressLoop)/progressLoop;ctx.fillStyle='#fff8';ctx.fillRect(0,H-3,W,3);ctx.fillStyle='#ba6488';ctx.fillRect(0,H-3,W*progress,3);}
}
function syncRunner(){distance=runner.distance;x=runner.x;y=runner.y;vy=runner.vy;lane=runner.lane;}
function contactSound(kind,impact){if(!sound)return;if(kind==='key')melody([920,1160],.035,.03);else if(kind==='carton')melody([230,180],.07,.045);else if(kind==='cloud')melody([520,700],.06,.04);else tone(140,Math.min(.11,.045+impact/3000));}
function update(dt){
 if(state==='resting'){
  updateHalt(dt);
  if(state==='resting')runner.tickSprings(Math.min(dt,1/60),false);
 }else if(state==='playing'||state==='falling'){
  const previousDistance=distance;
  if(state==='playing')ensureCourseAhead();
  if(state==='playing')updatePathState();
  const events=runner.advance(dt);syncRunner();
  for(const event of events){if(event.type==='jump'){triggerJumpAnimation();event.jumpsUsed===2?melody([520,760,980],.08,.045):tone(390,.13);}else if(event.type==='land'||event.type==='step')contactSound(event.kind,event.impact);else if(event.type==='fall'){state='falling';updateGameplayTouchLock();melody([180,130],.1,.055);}else if(event.type==='lost')end();else if(event.type==='won')end(true);}
 if(state==='playing'){
   handleCourseEvents(previousDistance);
   if(state==='playing')forCourseRange(pickups,distance-15,distance+60,h=>{if(!h.taken&&Math.abs(h.z-distance-22)<33&&Math.abs(h.lane*laneWidth-x)<42&&y<h.height+20&&y+86>h.height-15){h.taken=true;hearts++;melody([620+hearts%5*60,780+hearts%3*50],.06,.04);const p=project(x,y+50,22);for(let i=0;i<5;i++)particles.push({x:p.x,y:p.y,vx:(Math.random()-.5)*80,vy:-60-Math.random()*70,life:1,color:'#fff3b4'});}});
   if(state==='playing')forCourseRange(rewardPickups,distance-20,distance+65,r=>{if(!r.taken&&Math.abs(r.z-distance-22)<36&&Math.abs(r.lane*laneWidth-x)<44&&y<r.height+22&&y+86>r.height-15){r.taken=true;collectReward();}});
 }
 }else runner.tickSprings(Math.min(dt,1/60),false);
 updateJumpAnimation(dt);
 updateGameEvent(dt);
 hud();
 let liveParticles=0;for(let i=0;i<particles.length;i++){const p=particles[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;if(p.life>0)particles[liveParticles++]=p;}particles.length=liveParticles;
}
function frame(now){const dt=Math.min(.1,(now-last)/1000||.016);last=now;if(state!=='paused'){time+=dt;update(dt);}draw();requestAnimationFrame(frame);}
$('play').addEventListener('click',start);
$('pause').addEventListener('click',()=>state==='paused'?resume():pause());
 $('sound').addEventListener('click',()=>{sound=!sound;syncSoundUi();tone(540);});
fullscreenButtons.forEach(button=>button.addEventListener('click',toggleFullscreen));
controlModeButtons.forEach(button=>button.addEventListener('click',()=>setControlMode(button.dataset.controlMode)));
document.addEventListener('fullscreenchange',syncFullscreenUi);
document.addEventListener('webkitfullscreenchange',syncFullscreenUi);
for(const [id,action] of [['left',()=>move(-1)],['right',()=>move(1)],['jump',jump]]){$(id).addEventListener('pointerdown',e=>{e.preventDefault();action();});}
canvas.addEventListener('pointerdown',e=>{if(state!=='playing')return;if(controlMode==='gesture'&&e.pointerType!=='mouse'){beginGesture(e);return;}e.preventDefault();jump();});
canvas.addEventListener('pointerup',endGesture);
canvas.addEventListener('pointercancel',cancelGesture);
for(const type of ['touchstart','touchmove','touchend','touchcancel','pointerdown','pointermove','pointerup','pointercancel'])document.addEventListener(type,blockOutsideGameTouch,{capture:true,passive:false});
document.addEventListener('keydown',e=>{if($('note').open||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;const key=e.code;const inGame=e.target===canvas||$('game-stage').contains(e.target);if(['Space','ArrowUp','ArrowLeft','ArrowRight','KeyA','KeyD','KeyW','KeyP','Escape'].includes(key)&&(state==='playing'||state==='paused'||inGame)){e.preventDefault();if(e.repeat)return;if(key==='KeyP'||key==='Escape'){state==='paused'?resume():pause();return;}if(state!=='playing'){if(key==='Space'||key==='ArrowUp')start();return;}if(['Space','ArrowUp','KeyW'].includes(key))jump();if(['ArrowLeft','KeyA'].includes(key))move(-1);if(['ArrowRight','KeyD'].includes(key))move(1);}});
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

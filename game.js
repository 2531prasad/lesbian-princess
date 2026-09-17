'use strict';
(() => {
const $ = id => document.getElementById(id);
const canvas = $('game'), ctx = canvas.getContext('2d');
const themes = [
 {name:'Strawberry skies',icon:'✿',sky:['#f7c6b5','#f4d5d9','#ddcbef'],tile:'#f5b5c3',side:'#d992ac',edge:'#ffe4e9',accent:'#ed788d',wall:'#e2c9ef'},
 {name:'Lavender letters',icon:'⌘',sky:['#ead1fa','#d6c8ee','#f0cfe2'],tile:'#d1bbed',side:'#aa8ac9',edge:'#efe1ff',accent:'#a379ce',wall:'#dccbf0'},
 {name:'Cloud nine',icon:'☁',sky:['#f9d5a4','#f8ddd0','#e6d9f3'],tile:'#ffdeb8',side:'#dcac92',edge:'#fff0d6',accent:'#e6ac71',wall:'#edd5cb'}
];
let W=800,H=490,dpr=1,world=0,state='ready',distance=0,hearts=0,lane=0,x=0,y=0,vy=0,time=0,last=0,flight=0,fall=0,sound=false,audio;
let obstacles=[],pickups=[],particles=[],jumpBuffer=0;
const finish=CatPhysics.FINISH,laneWidth=100;
const runner=new CatPhysics.Runner();
const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function resize(){const r=canvas.getBoundingClientRect();W=r.width;H=r.height;dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);}
new ResizeObserver(resize).observe(canvas);
function announce(text){$('announcement').textContent=text;}
function tone(frequency=500,duration=.1){if(!sound)return;try{audio ||= new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();const o=audio.createOscillator(),g=audio.createGain();o.type='sine';o.frequency.setValueAtTime(frequency,audio.currentTime);o.frequency.exponentialRampToValueAtTime(frequency*1.4,audio.currentTime+duration);g.gain.setValueAtTime(.06,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+duration);}catch{}}
function makeCourse(){obstacles=[];pickups=[];particles=[];for(let i=0;i<37;i++){let z=650+i*170;let obstacleLane=((i*7+world)%3)-1;if(isGap(z-55)||isGap(z)||isGap(z+55))continue;obstacles.push({id:obstacles.length,z,lane:obstacleLane,type:i%4===2?'milk':'block',hit:false});if(i%6===4)obstacles.push({id:obstacles.length,z,lane:obstacleLane===1?-1:1,type:'block',hit:false});}for(let i=0;i<62;i++){let z=340+i*104;pickups.push({z,lane:((Math.floor(i/3)+world)%3)-1,taken:false,height:43});}for(const h of pickups){const o=obstacles.find(o=>o.lane===h.lane&&Math.abs(o.z-h.z)<65);if(o)h.height=(o.type==='milk'?75:43)+35;}}
function gapAt(z){const row=Math.floor(z/180);return row>4 && row%7===5;}
function isGap(z){return gapAt(z)&&z%180>120;}
function hud(){$('heart-count').textContent=hearts;$('distance').textContent=Math.floor(distance/10);$('speed').textContent=(runner.speed/CatPhysics.BASE_SPEED).toFixed(1);}
function setWorld(value){if(!Number.isInteger(value)||value<0||value>2)throw new Error('Choose world 0, 1, or 2.');world=value;reset();$('world-label').textContent=themes[world].name;$('world-emoji').textContent=themes[world].icon;document.querySelectorAll('[data-world]').forEach(b=>{const selected=+b.dataset.world===world;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',selected);b.querySelector('.world-check').textContent=selected?'✓':'↗';});announce(themes[world].name+' selected. Ready to play.');}
function showOverlay(kicker,title,copy,button){$('loss-photo').hidden=state!=='lost';$('overlay').classList.toggle('loss-overlay',state==='lost');$('overlay-kicker').textContent=kicker;$('overlay-title').textContent=title;$('overlay-copy').innerHTML=copy;$('play').innerHTML=button+' <span>▸</span>';$('overlay').classList.remove('hidden');}
function reset(){state='ready';distance=0;hearts=0;lane=0;x=0;y=0;vy=0;fall=0;flight=0;jumpBuffer=0;makeCourse();runner.reset(world,obstacles);syncRunner();hud();$('pause').disabled=true;$('pause').textContent='Ⅱ';$('pause').setAttribute('aria-label','Pause game');$('world-caption').hidden=false;showOverlay('A WORLD MADE FOR YOU','Hey, pretty kitty.','A tiny adventure. A whole lot of heart.<br>Ready to land on your paws?','Let’s play');$('start-hint').hidden=false;}
function start(){if(state==='paused'){resume();return;}if(state!=='ready')reset();state='playing';$('overlay').classList.add('hidden');$('pause').disabled=false;$('world-caption').hidden=true;canvas.focus({preventScroll:true});tone(420,.12);announce('Adventure started. Arrow keys to move, space to jump.');}
function pause(){if(state!=='playing')return;state='paused';$('pause').textContent='▸';$('pause').setAttribute('aria-label','Resume game');showOverlay('A LITTLE PAWS','Take your time.','Your daydream will be right here.','Keep going');announce('Game paused.');}
function resume(){state='playing';last=performance.now();$('overlay').classList.add('hidden');$('pause').textContent='Ⅱ';$('pause').setAttribute('aria-label','Pause game');canvas.focus({preventScroll:true});}
function jump(){if(state==='playing')runner.jump();}
function move(direction){if(state==='playing'){runner.steer(direction);lane=runner.lane;}}
function end(won=false){if(state!=='playing'&&state!=='falling')return;state=won?'won':'lost';$('pause').disabled=true;$('start-hint').hidden=true;const score=`You collected ${hearts} heart${hearts===1?'':'s'} in ${Math.floor(distance/10)} m.`;showOverlay(won?'ROYALLY WELL DONE':'SOFT LANDINGS, ALWAYS',won?'That’s my girl.':'Oh no, you lost!',score+'<br>'+(won?'A whole little world, conquered by you.':'Even princesses miss a jump. Try again?'),won?'Another daydream':'One more life');announce((won?'Course complete. ':'Missed a jump. ')+score);if(won){for(let i=0;i<60;i++)particles.push({x:Math.random()*W,y:Math.random()*H,vy:-Math.random()*80,vx:(Math.random()-.5)*100,life:4,color:['#dc6f91','#b38ccc','#eab56e'][i%3]});tone(740,.35);}else tone(190,.2);}
function project(wx,wy,wz){const f=H*1.14;const s=f/Math.max(45,wz+430);return{x:W*.5+wx*s,y:H*.29+(225-wy)*s,s};}
function polygon(points,fill,stroke){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=.6;ctx.stroke();}}
function poly3(points,fill,stroke){polygon(points.map(p=>project(...p)),fill,stroke);}
function box(wx,z,width,depth,height,color,edge,side){const a=wx-width/2,b=wx+width/2,c=z-depth/2,d=z+depth/2;poly3([[a,0,c],[b,0,c],[b,height,c],[a,height,c]],side);poly3([[b,0,c],[b,0,d],[b,height,d],[b,height,c]],side);poly3([[a,height,c],[b,height,c],[b,height,d],[a,height,d]],color,edge);}
function ellipse(x,y,rx,ry,color){ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,Math.max(.1,rx),Math.max(.1,ry),0,0,Math.PI*2);ctx.fill();}
function heart(px,py,size,color){ctx.save();ctx.translate(px,py);ctx.scale(size/24,size/24);ctx.beginPath();ctx.moveTo(0,7);ctx.bezierCurveTo(-25,-8,-10,-23,0,-12);ctx.bezierCurveTo(10,-23,25,-8,0,7);ctx.fillStyle=color;ctx.fill();ctx.restore();}
function backdrop(){const t=themes[world];let g=ctx.createLinearGradient(0,0,0,H);t.sky.forEach((c,i)=>g.addColorStop(i/2,c));ctx.fillStyle=g;ctx.fillRect(0,0,W,H);const glow=ctx.createRadialGradient(W*.64,H*.15,0,W*.64,H*.15,W*.5);glow.addColorStop(0,'#fff4caad');glow.addColorStop(1,'#fff4ca00');ctx.fillStyle=glow;ctx.fillRect(0,0,W,H);
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
  box(s.x,z,s.width,s.depth,top,'#fff0ea','#fff8f1','#dfaaa9');
  const a=s.x-s.width/2,b=s.x+s.width/2,front=z-s.depth/2;
  poly3([[a,top-12,front],[b,top-12,front],[b,top,front],[a,top,front]],t.accent);
  const p=project(s.x,top*.47,front-.2);heart(p.x,p.y,19*p.s,'#df819d');
 }else{
  box(s.x,z,s.width,s.depth,top,t.accent,t.edge,world===1?'#8e69b9':'#ce728e');
  const inset=world===1?6:9,a=s.x-s.width/2+inset,b=s.x+s.width/2-inset,c=z-s.depth/2+inset,d=z+s.depth/2-inset;
  poly3([[a,top+.5,c],[b,top+.5,c],[b,top+.5,d],[a,top+.5,d]],world===1?'#bd98df':'#f6a7bd',t.edge);
  const p=project(s.x,top+2,z);ctx.fillStyle='#ffffffc0';ctx.font=`${17*p.s}px sans-serif`;ctx.textAlign='center';ctx.fillText(world===1?'⌘':world===2?'☁':'✿',p.x,p.y);
 }
}
function drawPickup(h){const p=project(h.lane*laneWidth,h.height+Math.sin(time*2+h.z)*5,h.z-distance);ctx.save();ctx.shadowColor='#fff0b8';ctx.shadowBlur=12;heart(p.x,p.y,22*p.s,'#fff4c3');ctx.restore();}
function drawCat(){const p=project(x,y,22);const ground=runner.supportAt(x,distance+22,y+1);const shadow=project(x,ground?.height||0,22);ctx.globalAlpha=Math.max(.06,.22-y/750);ellipse(shadow.x,shadow.y+4,28*shadow.s,8*shadow.s,'#684f76');ctx.globalAlpha=1;ctx.save();ctx.translate(p.x,p.y-6*p.s);ctx.scale(p.s,p.s);const bob=state==='playing'&&runner.grounded?Math.sin(time*15)*1.2:0;ctx.translate(0,bob);ctx.scale(1+runner.squash*.08,1-runner.squash*.13);ctx.rotate((lane*laneWidth-x)*.0011);const fur=ctx.createLinearGradient(-24,0,25,0);fur.addColorStop(0,'#936548');fur.addColorStop(.3,'#cfab7e');fur.addColorStop(.52,'#b99466');fur.addColorStop(1,'#8a6046');
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
 const entities=[];
 for(const o of obstacles){const z=o.z-distance,s=runner.shape(o);if(z>-220&&z<2700){const above=y>=s.height-.5&&Math.abs(x-s.x)<s.width/2+CatPhysics.CAT.halfWidth&&Math.abs(z-22)<s.depth/2+CatPhysics.CAT.halfDepth;entities.push({z:above?23:z-s.depth/2,type:'obstacle',o});}}
 for(const h of pickups){const z=h.z-distance;if(!h.taken&&z>-70&&z<2700)entities.push({z,type:'heart',h});}
 if(!beneath)entities.push({z:22,type:'cat'});
 entities.sort((a,b)=>b.z-a.z);
 for(const e of entities){if(e.type==='cat')drawCat();else if(e.type==='heart')drawPickup(e.h);else drawObstacle(e.o);}
 for(const p of particles){ctx.globalAlpha=Math.max(0,Math.min(1,p.life));heart(p.x,p.y,10,p.color);}ctx.globalAlpha=1;
 if(state==='playing'){ctx.fillStyle='#fff8';ctx.fillRect(0,H-3,W,3);ctx.fillStyle='#ba6488';ctx.fillRect(0,H-3,W*Math.min(1,distance/finish),3);}
}
function syncRunner(){distance=runner.distance;x=runner.x;y=runner.y;vy=runner.vy;lane=runner.lane;}
function contactSound(kind,impact){if(!sound)return;tone(kind==='key'?1050:kind==='carton'?230:130,kind==='key'?.026:.075);}
function update(dt){
 if(state==='playing'||state==='falling'){
  const events=runner.advance(dt);syncRunner();
  for(const event of events){if(event.type==='jump')tone(390,.13);else if(event.type==='land'||event.type==='step')contactSound(event.kind,event.impact);else if(event.type==='fall'){state='falling';tone(140,.13);}else if(event.type==='lost')end();else if(event.type==='won')end(true);}
  if(state==='playing')for(const h of pickups){if(!h.taken&&Math.abs(h.z-distance-22)<33&&Math.abs(h.lane*laneWidth-x)<42&&y<h.height+20&&y+86>h.height-15){h.taken=true;hearts++;tone(620+hearts%5*60,.08);const p=project(x,y+50,22);for(let i=0;i<5;i++)particles.push({x:p.x,y:p.y,vx:(Math.random()-.5)*80,vy:-60-Math.random()*70,life:1,color:'#fff3b4'});}}
  hud();
 }else runner.tickSprings(Math.min(dt,1/60),false);
 for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;}particles=particles.filter(p=>p.life>0);
}
function frame(now){const dt=Math.min(.1,(now-last)/1000||.016);last=now;if(state!=='paused'){time+=dt;update(dt);}draw();requestAnimationFrame(frame);}
$('play').addEventListener('click',start);
$('pause').addEventListener('click',()=>state==='paused'?resume():pause());
$('sound').addEventListener('click',()=>{sound=!sound;$('sound').setAttribute('aria-pressed',String(sound));$('sound').setAttribute('aria-label',sound?'Turn sound off':'Turn sound on');$('sound').querySelector('span').hidden=sound;tone(540);});
$('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if($('game-stage').requestFullscreen)await $('game-stage').requestFullscreen();else announce('Full screen is not supported in this browser.');}catch{announce('Full screen is not available. You can keep playing here.');}});
for(const [id,action] of [['left',()=>move(-1)],['right',()=>move(1)],['jump',jump]]){$(id).addEventListener('pointerdown',e=>{e.preventDefault();action();});}
canvas.addEventListener('pointerdown',e=>{if(state==='playing'){e.preventDefault();jump();}});
document.addEventListener('keydown',e=>{if($('note').open||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;const key=e.code;const inGame=e.target===canvas||$('game-stage').contains(e.target);if(['Space','ArrowUp','ArrowLeft','ArrowRight','KeyA','KeyD','KeyW','KeyP','Escape'].includes(key)&&(state==='playing'||state==='paused'||inGame)){e.preventDefault();if(e.repeat)return;if(key==='KeyP'||key==='Escape'){state==='paused'?resume():pause();return;}if(state!=='playing'){if(key==='Space'||key==='ArrowUp')start();return;}if(['Space','ArrowUp','KeyW'].includes(key))jump();if(['ArrowLeft','KeyA'].includes(key))move(-1);if(['ArrowRight','KeyD'].includes(key))move(1);}});
document.querySelectorAll('[data-world]').forEach(b=>b.addEventListener('click',()=>setWorld(+b.dataset.world)));
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
window.addEventListener('blur',()=>pause());
$('open-note').addEventListener('click',()=>{pause();$('note').showModal();});$('close-note').addEventListener('click',()=>$('note').close());$('note').addEventListener('click',e=>{if(e.target===$('note')){const r=$('note').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('note').close();}});
if(document.modelContext?.registerTool){const life=new AbortController();const specs=[{name:'read_cat_adventure',description:'Read the current cat adventure world, state, hearts and distance.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute(){return{world:themes[world].name,state,hearts,meters:Math.floor(distance/10),speedMultiplier:Number((runner.speed/CatPhysics.BASE_SPEED).toFixed(2))};}},{name:'select_cat_world',description:'Select a cat adventure world and reset the game to its ready screen.',inputSchema:{type:'object',properties:{world:{type:'integer',minimum:0,maximum:2}},required:['world'],additionalProperties:false},execute(input){if(!input||Object.keys(input).some(k=>k!=='world'))throw new Error('Provide only a world number.');setWorld(input.world);return{world:themes[world].name,state};}}];for(const spec of specs){try{Promise.resolve(document.modelContext.registerTool(spec,{signal:life.signal})).catch(()=>{});}catch{}}window.addEventListener('pagehide',()=>life.abort(),{once:true});}
resize();reset();requestAnimationFrame(frame);
})();

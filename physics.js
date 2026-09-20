/* Shared by the canvas game and deterministic physics checks. No browser dependencies. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CatPhysics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const CAT = Object.freeze({halfWidth:24, halfDepth:16, height:86, z:22});
  const BASE_SPEED=175,MAX_BASE_SPEED=650,SPEED_TAU=28,FINISH=Infinity;
  const WORLD_RULES=Object.freeze([
    Object.freeze({gravity:1100,jump:515,laneSharpness:14}),
    Object.freeze({gravity:1160,jump:525,laneSharpness:17}),
    Object.freeze({gravity:940,jump:485,laneSharpness:12})
  ]);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function lowerBoundZ(items,value){let low=0,high=items.length;while(low<high){const middle=(low+high)>>1;if(items[middle].z<value)low=middle+1;else high=middle;}return low;}
  function gapAt(z){const row=Math.floor(z/180);return row>4&&row%7===5;}
  function isGap(z){return gapAt(z)&&z%180>120;}
  function storyHeight(row){
    if(row<=0)return 0;
    const phase=row%64;
    if(phase<8)return phase*12;
    if(phase<18)return 96;
    if(phase<26)return 96+(phase-18)*12;
    if(phase<38)return 192;
    if(phase<54)return 192-(phase-38)*12;
    return 0;
  }
  function elevationAt(world,row,col){if(row<=0)return 0;const detail=Math.round((Math.sin(row*.57+col*1.9+world*.8)+1)*.5)*3;return storyHeight(row)+detail;}
  function speedAt(elapsed){const range=MAX_BASE_SPEED-BASE_SPEED;return BASE_SPEED+range*(1-Math.exp(-Math.max(0,elapsed)/SPEED_TAU));}
  function distanceAt(elapsed){const t=Math.max(0,elapsed),range=MAX_BASE_SPEED-BASE_SPEED;return MAX_BASE_SPEED*t-range*SPEED_TAU*(1-Math.exp(-t/SPEED_TAU));}
  function material(world,type){return type==='milk'?'carton':world===1?'key':world===2?'cloud':'jelly';}
  const properties={key:{travel:7,stiffness:320,damping:30,weight:5},jelly:{travel:17,stiffness:110,damping:12,weight:9},cloud:{travel:22,stiffness:75,damping:11,weight:12},carton:{travel:3,stiffness:380,damping:32,weight:1}};
  // Sweep the whole body through an expanded obstacle, so fast motion cannot tunnel.
  function sweep(a,b,bounds){
    let enter=-Infinity,exit=Infinity,axis=null;
    for(const key of ['x','y','z']){
      const delta=b[key]-a[key],lo=bounds[key][0],hi=bounds[key][1];
      if(Math.abs(delta)<1e-9){if(a[key]<=lo+1e-6||a[key]>=hi-1e-6)return null;continue;}
      let near=(lo-a[key])/delta,far=(hi-a[key])/delta;
      if(near>far)[near,far]=[far,near];
      if(near>enter){enter=near;axis=key;}exit=Math.min(exit,far);
      if(enter>exit)return null;
    }
    if(exit<0||enter>1||enter<-.00001)return null;
    return{t:Math.max(0,enter),axis};
  }
  class Runner {
    constructor(world=0,obstacles=[]){this.reset(world,obstacles);}
    reset(world=0,obstacles=[]){Object.assign(this,{world,obstacles,distance:0,elapsed:0,speed:BASE_SPEED,pathMultiplier:1,x:0,lane:0,y:world===1?10:0,vy:0,grounded:true,support:'tile:0:0',jumpQueued:0,coyoteRemaining:.08,jumpsUsed:0,status:'playing',squash:0,accumulator:0,fallTime:0});this.obstaclesSorted=true;for(let i=1;i<obstacles.length;i++)if(obstacles[i-1].z>obstacles[i].z){this.obstaclesSorted=false;break;}this.elevationCache=new Map();this.springs=new Map();this.events=[];}
    spring(id,kind){let s=this.springs.get(id);if(!s){s={id,kind,amount:0,velocity:0};this.springs.set(id,s);}return s;}
    compression(id){return this.springs.get(id)?.amount||0;}
    baseHeight(row,col){const key=`${row}:${col}`;let height=this.elevationCache.get(key);if(height===undefined){height=(this.world===1?10:0)+elevationAt(this.world,row,col);this.elevationCache.set(key,height);}return height;}
    baseHeightAt(px,pz){const col=clamp(Math.round(px/100),-1,1);return this.baseHeight(Math.floor(pz/180),col);}
    tile(row,col){const id=`tile:${row}:${col}`,kind=material(this.world);return{id,kind,height:this.baseHeight(row,col)-this.compression(id),row,col};}
    shape(o){const kind=material(this.world,o.type),id=`obstacle:${o.id}`,compression=this.compression(id),base=Number.isFinite(o.base)?o.base:this.baseHeight(Math.floor(o.z/180),clamp(o.lane,-1,1));const spread=(kind==='jelly'||kind==='cloud')?compression*.55:0;return{id,kind,x:o.lane*100,z:o.z,width:(o.type==='milk'?62:78)+spread,depth:(o.type==='milk'?50:48)+spread,base,height:base+(o.type==='milk'?75:43)-compression,compression};}
    floorAt(px,pz){
      const col=clamp(Math.round(px/100),-1,1);
      if(Math.abs(px-col*100)>49||pz<0||isGap(pz))return null;
      return this.tile(Math.floor(pz/180),col);
    }
    forNearbyObstacles(minZ,maxZ,visit){
      if(!this.obstaclesSorted){for(const o of this.obstacles)visit(o);return;}
      const first=lowerBoundZ(this.obstacles,minZ);
      for(let i=first;i<this.obstacles.length&&this.obstacles[i].z<=maxZ;i++)visit(this.obstacles[i]);
    }
    supportAt(px,pz,ceiling){
      let best=null;
      const tileCeiling=ceiling+32;
      // Either paw may support an edge, but empty gaps never become solid.
      for(const sx of [-12,12])for(const sz of [-9,9]){const f=this.floorAt(px+sx,pz+sz);if(f&&f.height<=tileCeiling+.01&&(!best||f.height>best.height))best=f;}
      this.forNearbyObstacles(pz-96,pz+96,o=>{const s=this.shape(o);if(Math.abs(px-s.x)<s.width/2+CAT.halfWidth&&Math.abs(pz-s.z)<s.depth/2+CAT.halfDepth&&s.height<=ceiling+.01&&(!best||s.height>best.height))best=s;});
      return best;
    }
    jump(){if(this.status!=='playing')return;if(this.grounded||(this.coyoteRemaining>0&&this.jumpsUsed===0)||this.jumpsUsed<2)this.launch();else this.jumpQueued=.1;}
    launch(){if(this.jumpsUsed>=2&&!this.grounded)return;const rules=WORLD_RULES[this.world]||WORLD_RULES[0];this.vy=rules.jump;this.grounded=false;this.support=null;this.jumpQueued=0;this.coyoteRemaining=0;this.jumpsUsed++;this.events.push({type:'jump',jumpsUsed:this.jumpsUsed});}
    steer(direction){if(this.status==='playing')this.lane=clamp(this.lane+direction,-1,1);}
    tickSprings(dt,loaded=true){
      for(const [id,s] of this.springs){const p=properties[s.kind],target=loaded&&this.grounded&&this.support===id?p.weight:0;s.velocity+=((target-s.amount)*p.stiffness-s.velocity*p.damping)*dt;s.amount+=s.velocity*dt;if(s.amount>p.travel){s.amount=p.travel;s.velocity=Math.min(0,s.velocity)*.3;}if(s.amount<0){s.amount=0;s.velocity=Math.max(0,s.velocity)*.3;}const row=id.startsWith('tile:')?Number(id.split(':')[1]):null;if(row!==null&&row*180<this.distance-700)this.springs.delete(id);}
      this.squash*=Math.exp(-10*dt);
    }
    land(surface,impact){const changed=!this.grounded||this.support!==surface.id,queued=this.jumpQueued>0;this.y=surface.height;this.vy=0;this.grounded=true;this.support=surface.id;this.jumpsUsed=0;this.coyoteRemaining=.08;const spring=this.spring(surface.id,surface.kind);if(changed){spring.velocity+=Math.min(150,25+impact*.18);this.squash=Math.min(1,impact/420);this.events.push({type:impact>80?'land':'step',kind:surface.kind,impact});}if(queued)this.launch();}
    advance(dt){this.accumulator+=Math.min(.2,Math.max(0,dt));while(this.accumulator>=1/120){this.step(1/120);this.accumulator-=1/120;}return this.events.splice(0);}
    step(dt){
      if(this.status!=='playing'){this.tickSprings(dt,false);if(this.status==='falling'){const gravity=(WORLD_RULES[this.world]||WORLD_RULES[0]).gravity;this.vy-=gravity*.5*dt;this.y+=this.vy*dt;this.fallTime+=dt;if(this.fallTime>.5){this.status='lost';this.events.push({type:'lost',reason:'gap'});}}return;}
      const rules=WORLD_RULES[this.world]||WORLD_RULES[0];
      this.tickSprings(dt);this.jumpQueued=Math.max(0,this.jumpQueued-dt);this.coyoteRemaining=Math.max(0,this.coyoteRemaining-dt);
      const old={x:this.x,y:this.y,z:this.distance+CAT.z},previousElapsed=this.elapsed;
      this.elapsed+=dt;this.speed=speedAt(this.elapsed)*this.pathMultiplier;
      const travel=(distanceAt(this.elapsed)-distanceAt(previousElapsed))*this.pathMultiplier;
      const next={x:this.x+(this.lane*100-this.x)*(1-Math.exp(-rules.laneSharpness*dt)),y:this.y,z:old.z+travel};
      let existing=this.grounded?this.supportAt(next.x,next.z,this.y+24):null;
      if(existing&&existing.id!==this.support){const bothTiles=existing.id.startsWith('tile:')&&this.support?.startsWith('tile:'),rise=existing.height-this.y;if((bothTiles&&(rise>28||rise<-2))||(!bothTiles&&Math.abs(rise)>2))existing=null;}
      if(existing){next.y=existing.height;this.vy=0;}else{if(this.grounded)this.coyoteRemaining=.08;this.grounded=false;this.support=null;next.y+=this.vy*dt-.5*rules.gravity*dt*dt;this.vy-=rules.gravity*dt;}
      let collision=null;
      this.forNearbyObstacles(old.z-140,next.z+160,o=>{const s=this.shape(o);if(s.z+s.depth/2<old.z-80||s.z-s.depth/2>next.z+120)return;
        // Standing on a surface is not a penetration of its solid volume.
        if(old.y>=s.height-.1&&next.y>=s.height-.1)return;
        const hit=sweep(old,next,{x:[s.x-s.width/2-CAT.halfWidth,s.x+s.width/2+CAT.halfWidth],y:[-CAT.height,s.height],z:[s.z-s.depth/2-CAT.halfDepth,s.z+s.depth/2+CAT.halfDepth]});
        if(hit&&(!collision||hit.t<collision.t))collision={...hit,s,o};
      });
      if(collision){const {t,axis,s}=collision;this.x=old.x+(next.x-old.x)*t;this.distance=old.z+(next.z-old.z)*t-CAT.z;
        if(axis==='y'&&next.y<old.y&&old.y>=s.height-.1){this.x=next.x;this.distance=next.z-CAT.z;this.land(s,Math.abs(this.vy));return;}
        this.y=old.y+(next.y-old.y)*t;this.distance-=.02;this.spring(s.id,s.kind).velocity+=170;this.status='lost';this.grounded=false;this.events.push({type:'lost',reason:'obstacle'});return;
      }
      this.x=next.x;this.distance=next.z-CAT.z;
      const floor=this.supportAt(next.x,next.z,old.y+.1);
      if(existing){this.land(existing,0);}else if(floor&&next.y<=floor.height&&old.y>=floor.height-.1&&this.vy<=0){this.land(floor,Math.abs(this.vy));}else this.y=next.y;
      if(!this.grounded&&this.y<-25){this.status='falling';this.fallTime=0;this.events.push({type:'fall'});}
    }
  }
  return{Runner,CAT,BASE_SPEED,MAX_BASE_SPEED,SPEED_TAU,FINISH,WORLD_RULES,speedAt,distanceAt,storyHeight,elevationAt,gapAt,isGap,sweep,properties};
});

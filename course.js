/* Seeded, solvable course chunks. Shared by the game and Node tests. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CatCourse=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const LANES=[-1,0,1],ROW=180,CHUNK_ROWS=7,CHUNK_LENGTH=ROW*CHUNK_ROWS;
  const PATTERNS=[
    [[-1],[],[1],[0],[-1],[],[1]],
    [[1],[0],[-1],[],[1],[],[0]],
    [[0],[-1],[1],[],[-1,1],[],[0]],
    [[-1],[1],[],[0],[1],[],[-1]]
  ];
  function mulberry32(seed){return function(){let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
  function difficultyTier(elapsed){if(elapsed<25)return 0;if(elapsed<60)return 1;if(elapsed<120)return 2;return 3;}
  function validateLaneRoute(rows,startingLanes=new Set(LANES)){let reachable=new Set(startingLanes);for(const row of rows){const blocked=new Set(row.obstacles||[]),next=new Set();for(const from of reachable)for(const to of LANES)if(Math.abs(to-from)<=1&&!blocked.has(to))next.add(to);if(next.size===0&&!row.jumpable)return false;if(next.size)reachable=next;}return true;}
  class Generator{
    constructor(seed=1,world=0){this.seed=seed>>>0;this.world=world;this.random=mulberry32(this.seed);this.index=0;this.nextObstacleId=0;}
    next(start,tier=0){
      const index=this.index++,pattern=PATTERNS[Math.floor(this.random()*PATTERNS.length)],rows=[];
      const kind=index%6,speedLane=kind===1||kind===4?LANES[Math.floor(this.random()*3)]:null;
      const stopLane=kind===3||kind===5?LANES[Math.floor(this.random()*3)]:null;
      for(let i=0;i<CHUNK_ROWS;i++){
        const worldRow=Math.floor(start/ROW)+i,isGap=worldRow>4&&worldRow%7===5;
        let blocked=isGap?[]:pattern[i].slice();
        if(tier<2&&blocked.length>1)blocked=blocked.slice(0,1);
        if(speedLane!==null&&i>=2)blocked=blocked.filter(lane=>lane!==speedLane);
        if(stopLane!==null&&i===4)blocked=blocked.filter(lane=>lane!==stopLane);
        const safe=LANES.filter(lane=>!blocked.includes(lane));
        rows.push({dz:i*ROW,obstacles:blocked,jumpable:isGap,hearts:safe});
      }
      if(!validateLaneRoute(rows))throw new Error('Generated an unsolvable course chunk');
      const obstacles=[],pickups=[],rewards=[];
      for(let i=0;i<rows.length;i++){
        const row=rows[i],z=start+row.dz+110;
        if(z>=650&&!row.jumpable)for(const lane of row.obstacles)obstacles.push({id:this.nextObstacleId++,z,lane,type:(index+i)%4===2?'milk':'block'});
        const heartLane=row.hearts[(index+i)%row.hearts.length];
        if(z>=300)pickups.push({z:z-45,lane:heartLane});
      }
      const rewardLane=LANES[Math.floor(this.random()*3)];
      rewards.push({z:start+CHUNK_LENGTH-210,lane:rewardLane});
      const speedPath=speedLane===null?null:{id:index,start:start+320,end:start+1220,lane:speedLane,multiplier:1.35};
      const turn=kind===2?{id:index,start:start+280,end:start+920,direction:index%2?-1:1,shift:220,maxYaw:.24,handled:false}:null;
      const stop=stopLane===null?null:{id:index,z:start+790,type:kind===3?'sleep':'toilet',duration:kind===3?10:5,lane:stopLane,triggered:false};
      return{index,start,end:start+CHUNK_LENGTH,rows,obstacles,pickups,rewards,speedPath,turn,stop};
    }
  }
  return{LANES,ROW,CHUNK_ROWS,CHUNK_LENGTH,PATTERNS,mulberry32,difficultyTier,validateLaneRoute,Generator};
});

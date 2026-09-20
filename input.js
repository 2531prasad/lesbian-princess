/* Pure input classification shared by the browser and Node tests. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CatInput=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function classifyGesture(dx,dy,threshold){
    if(Math.max(Math.abs(dx),Math.abs(dy))<threshold)return null;
    if(Math.abs(dx)>Math.abs(dy))return dx<0?'left':'right';
    return dy<0?'jump':null;
  }
  return{classifyGesture};
});

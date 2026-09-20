/* Small managed Web Audio bus. Browser-only, exposed as CatAudio. */
(function (root) {
  'use strict';
  class AudioBus {
    constructor(enabled=true){this.enabled=enabled;this.context=null;this.master=null;this.lastPlayed=new Map();this.timers=new Set();}
    ensure(){if(this.context)return true;try{const AudioContextClass=root.AudioContext||root.webkitAudioContext;if(!AudioContextClass)return false;this.context=new AudioContextClass();this.master=this.context.createGain();this.master.gain.value=.65;this.master.connect(this.context.destination);return true;}catch{return false;}}
    setEnabled(enabled){this.enabled=Boolean(enabled);if(!this.enabled)this.cancel();if(this.master)this.master.gain.setTargetAtTime(this.enabled?.65:.0001,this.context.currentTime,.015);}
    cancel(){for(const timer of this.timers)clearTimeout(timer);this.timers.clear();}
    tone(frequency=500,duration=.1,options={}){
      if(!this.enabled||!this.ensure())return;
      const nowMs=performance.now(),name=options.name||'tone',cooldown=options.cooldown||0;
      if(nowMs-(this.lastPlayed.get(name)||-Infinity)<cooldown)return;
      this.lastPlayed.set(name,nowMs);
      if(this.context.state==='suspended')this.context.resume();
      const now=this.context.currentTime,o=this.context.createOscillator(),g=this.context.createGain();
      o.type=options.type||'sine';o.frequency.setValueAtTime(Math.max(40,frequency),now);o.frequency.exponentialRampToValueAtTime(Math.max(40,frequency*(options.rise||1.35)),now+duration);
      g.gain.setValueAtTime(options.gain||.055,now);g.gain.exponentialRampToValueAtTime(.001,now+duration);
      o.connect(g);g.connect(this.master);o.start(now);o.stop(now+duration);
    }
    melody(notes,duration=.08,spacing=.055,options={}){
      if(!this.enabled||!notes.length)return;
      notes.forEach((frequency,index)=>{if(index===0){this.tone(frequency,duration,{...options,name:(options.name||'melody')+':0'});return;}const timer=setTimeout(()=>{this.timers.delete(timer);this.tone(frequency,duration,{...options,name:(options.name||'melody')+':'+index});},index*spacing*1000);this.timers.add(timer);});
    }
  }
  root.CatAudio={AudioBus};
})(typeof globalThis!=='undefined'?globalThis:this);

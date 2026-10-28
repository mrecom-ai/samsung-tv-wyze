(function(root){
  'use strict';
  function CameraWall(container,api,open,audioChanged,changed){this.container=container;this.api=api;this.open=open;this.audioChanged=audioChanged||function(){};this.changed=changed||function(){};this.items=[];this.generation=0;this.audioIndex=null;this.hideUnavailable=false;}
  CameraWall.prototype.layout=function(){
    var visible=this.items.filter(function(i){return !this.hideUnavailable||i.ready;},this),n=visible.length,cols=n<=1?1:n<=4?2:n<=9?3:4;
    this.container.classList.toggle('dense',cols>=3);
    this.container.style.gridTemplateColumns='repeat('+cols+',minmax(0,1fr))';this.container.style.gridTemplateRows='repeat('+Math.max(1,Math.ceil(n/cols))+',minmax(200px,1fr))';
    this.changed(visible.map(function(i){return i.camera;}),this.items.length-visible.length);
  };
  CameraWall.prototype.removeUnavailable=function(item,gen){
    if(gen!==this.generation||item.removed)return;
    var selected=this.audioIndex===null?null:this.items[this.audioIndex],index=this.items.indexOf(item);if(index<0)return;
    item.removed=true;item.video.onplaying=null;item.video.onerror=null;item.video.muted=true;item.stream.stop();this.items.splice(index,1);this.container.removeChild(item.tile);
    this.setAudio(selected&&selected!==item?this.items.indexOf(selected):null);this.layout();
  };
  CameraWall.prototype.stop=function(){
    this.generation+=1;clearTimeout(this.timer);
    this.items.forEach(function(i){i.video.onplaying=null;i.video.onerror=null;i.stream.stop();});
    this.items=[];this.container.textContent='';this.container.scrollTop=0;this.audioIndex=null;this.audioChanged(null,null);
  };
  CameraWall.prototype.setAudio=function(index){
    if(index!==null && (typeof index!=='number'||index<0||index>=this.items.length||index%1!==0))return;
    this.items.forEach(function(i){i.video.muted=true;i.sound.textContent='Use sound';i.sound.setAttribute('aria-pressed','false');});
    this.audioIndex=index;
    if(index!==null){var item=this.items[index];item.video.muted=false;item.sound.textContent='Sound on';item.sound.setAttribute('aria-pressed','true');var play=item.video.play();if(play&&play.catch)play.catch(function(){item.message.textContent='Press Use sound again to start audio.';});}
    this.audioChanged(index,index===null?null:this.items[index].camera);
  };
  CameraWall.prototype.start=function(cameras,options){
    this.stop();this.hideUnavailable=!!(options&&options.hideUnavailable);var self=this,gen=self.generation;
    if(this.hideUnavailable)cameras=cameras.filter(function(c){return c.online===true;});
    cameras.forEach(function(camera){
      var tile=document.createElement('article'),video=document.createElement('video'),bar=document.createElement('div'),name=document.createElement('strong'),message=document.createElement('span'),sound=document.createElement('button'),retry=document.createElement('button'),expand=document.createElement('button');
      tile.className='feed';tile.hidden=self.hideUnavailable;bar.className='feedbar';video.autoplay=true;video.muted=true;video.setAttribute('playsinline','');
      name.textContent=camera.name;message.textContent='Waiting…';message.className='feedstatus';sound.textContent='Use sound';sound.setAttribute('aria-pressed','false');retry.textContent='Retry';expand.textContent='Expand';
      tile.appendChild(video);tile.appendChild(message);bar.appendChild(name);bar.appendChild(sound);bar.appendChild(retry);bar.appendChild(expand);tile.appendChild(bar);self.container.appendChild(tile);
      var item={camera:camera,video:video,sound:sound,message:message,loading:false,tile:tile,removed:false,ready:false};
      item.stream=new root.CameraStream(video,function(text,error){if(gen!==self.generation||item.removed)return;if(error&&self.hideUnavailable){self.removeUnavailable(item,gen);return;}message.textContent=text;message.classList.toggle('error',!!error);});
      video.onplaying=function(){if(gen!==self.generation||item.removed||!video.videoWidth)return;clearTimeout(item.stream.timer);message.textContent='Live';message.classList.remove('error');if(!item.ready){item.ready=true;tile.hidden=false;self.layout();}};
      video.onerror=function(){if(gen!==self.generation||item.removed)return;if(self.hideUnavailable){self.removeUnavailable(item,gen);return;}item.stream.stop();message.textContent='Video decode failed';message.classList.add('error');if(root.CameraDiagnostics)root.CameraDiagnostics.report('failure',{stage:'video-element',code:'decode'});};
      sound.onclick=function(){var index=self.items.indexOf(item);self.setAudio(self.audioIndex===index?null:index);};
      retry.onclick=function(){self.startItem(item,gen);};expand.onclick=function(){self.open(camera);};self.items.push(item);
    });
    self.layout();var index=0,queue=self.items.slice();
    function next(){if(gen!==self.generation||index>=queue.length)return;var item=queue[index++];self.startItem(item,gen).then(function(){if(gen===self.generation)self.timer=setTimeout(next,500);});}
    next();
  };
  CameraWall.prototype.startItem=function(item,gen){
    var self=this;if(item.loading||item.removed||gen!==self.generation)return Promise.resolve();
    item.loading=true;item.stream.stop();item.message.textContent='Connecting…';item.message.classList.remove('error');
    return self.api.stream(item.camera).then(function(params){if(gen===self.generation&&!item.removed)item.stream.start(params);}).catch(function(e){if(gen===self.generation&&!item.removed){if(self.hideUnavailable){self.removeUnavailable(item,gen);return;}item.message.textContent=e.message;item.message.classList.add('error');}}).then(function(){item.loading=false;});
  };
  root.CameraWall=CameraWall;
}(typeof window==='undefined'?globalThis:window));

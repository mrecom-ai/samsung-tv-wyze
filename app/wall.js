(function(root){
  'use strict';
  function CameraWall(container,api,open,audioChanged){this.container=container;this.api=api;this.open=open;this.audioChanged=audioChanged||function(){};this.items=[];this.generation=0;this.audioIndex=null;}
  CameraWall.prototype.stop=function(){
    this.generation+=1;clearTimeout(this.timer);
    this.items.forEach(function(i){i.video.onplaying=null;i.video.onerror=null;i.stream.stop();});
    this.items=[];this.container.textContent='';this.audioIndex=null;this.audioChanged(null,null);
  };
  CameraWall.prototype.setAudio=function(index){
    if(index!==null && (typeof index!=='number'||index<0||index>=this.items.length||index%1!==0))return;
    this.items.forEach(function(i){i.video.muted=true;i.sound.textContent='Use sound';i.sound.setAttribute('aria-pressed','false');});
    this.audioIndex=index;
    if(index!==null){var item=this.items[index];item.video.muted=false;item.sound.textContent='Sound on';item.sound.setAttribute('aria-pressed','true');var play=item.video.play();if(play&&play.catch)play.catch(function(){item.message.textContent='Press Use sound again to start audio.';});}
    this.audioChanged(index,index===null?null:this.items[index].camera);
  };
  CameraWall.prototype.start=function(cameras){
    this.stop();var self=this,gen=self.generation;
    var cols=cameras.length===1?1:cameras.length<=4?2:cameras.length<=9?3:Math.ceil(Math.sqrt(cameras.length));
    self.container.style.gridTemplateColumns='repeat('+cols+',1fr)';
    self.container.style.gridTemplateRows='repeat('+Math.ceil(cameras.length/cols)+',1fr)';
    cameras.forEach(function(camera){
      var tile=document.createElement('article'),video=document.createElement('video'),bar=document.createElement('div'),name=document.createElement('strong'),message=document.createElement('span'),sound=document.createElement('button'),retry=document.createElement('button'),expand=document.createElement('button');
      tile.className='feed';bar.className='feedbar';video.autoplay=true;video.muted=true;video.setAttribute('playsinline','');
      name.textContent=camera.name;message.textContent='Waiting…';message.className='feedstatus';sound.textContent='Use sound';sound.setAttribute('aria-pressed','false');retry.textContent='Retry';expand.textContent='Expand';
      tile.appendChild(video);tile.appendChild(message);bar.appendChild(name);bar.appendChild(sound);bar.appendChild(retry);bar.appendChild(expand);tile.appendChild(bar);self.container.appendChild(tile);
      var item={camera:camera,video:video,sound:sound,message:message,loading:false};
      item.stream=new root.CameraStream(video,function(text,error){if(gen!==self.generation)return;message.textContent=text;message.classList.toggle('error',!!error);});
      video.onplaying=function(){if(gen!==self.generation)return;clearTimeout(item.stream.timer);message.textContent='Live';message.classList.remove('error');};
      video.onerror=function(){if(gen!==self.generation)return;item.stream.stop();message.textContent='Video decode failed';message.classList.add('error');if(root.CameraDiagnostics)root.CameraDiagnostics.report('failure',{stage:'video-element',code:'decode'});};
      sound.onclick=function(){var index=self.items.indexOf(item);self.setAudio(self.audioIndex===index?null:index);};
      retry.onclick=function(){self.startItem(item,gen);};expand.onclick=function(){self.open(camera);};self.items.push(item);
    });
    var index=0;
    function next(){if(gen!==self.generation||index>=self.items.length)return;var item=self.items[index++];self.startItem(item,gen).then(function(){if(gen===self.generation)self.timer=setTimeout(next,500);});}
    next();
  };
  CameraWall.prototype.startItem=function(item,gen){
    var self=this;if(item.loading||gen!==self.generation)return Promise.resolve();
    item.loading=true;item.stream.stop();item.message.textContent='Connecting…';item.message.classList.remove('error');
    return self.api.stream(item.camera).then(function(params){if(gen===self.generation)item.stream.start(params);}).catch(function(e){if(gen===self.generation){item.message.textContent=e.message;item.message.classList.add('error');}}).then(function(){item.loading=false;});
  };
  root.CameraWall=CameraWall;
}(typeof window==='undefined'?globalThis:window));

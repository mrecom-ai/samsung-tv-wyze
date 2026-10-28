/* Receive-only transport for Wyze lake cameras. Native tracks feed the same
 * video element as the legacy player, preserving sound selection and muting.
 */
(function(root){
  'use strict';
  function LakeStream(video,status){this.video=video;this.status=status;this.generation=0;this.client=null;this.media=null;}
  LakeStream.prototype.stop=function(){
    this.generation+=1;clearTimeout(this.timer);clearInterval(this.checkTimer);if(this.playing)this.video.removeEventListener('playing',this.playing);this.playing=null;var client=this.client;this.client=null;this.media=null;
    if(client){client.removeAllListeners();Promise.resolve(client.leave()).catch(function(){});}
    this.video.pause();this.video.srcObject=null;
  };
  LakeStream.prototype.start=function(params){
    this.stop();var self=this,gen=this.generation,client,subscriptions={},audioUid=null;
    function current(){return gen===self.generation;}
    function fail(stage){if(!current())return;self.stop();self.status('Camera connection failed ('+stage+'). Choose Reconnect.',true);if(root.CameraDiagnostics)root.CameraDiagnostics.report('failure',{stage:stage,code:'lake'});}
    if(!root.AgoraRTC){fail('player-missing');return;}
    root.AgoraRTC.setLogLevel(4);root.AgoraRTC.disableLogUpload();
    try{client=root.AgoraRTC.createClient({mode:'rtc',codec:'h265',audioCodec:'pcmu'});self.client=client;client.setEncryptionConfig(params.encryptionMode,params.key,params.salt,true);self.media=new root.MediaStream();}catch(_){fail('encrypted-player');return;}
    self.status('Connecting camera…');
    self.playing=function(){if(current()&&self.video.videoWidth>0){clearTimeout(self.timer);clearInterval(self.checkTimer);self.status('Live');}};
    self.video.addEventListener('playing',self.playing);
    function subscribe(user,kind){
      if(!current()||!((kind==='video'&&String(user.uid)===String(params.deviceUid))||(kind==='audio'&&(String(user.uid)==='3'||String(user.uid)===String(params.deviceUid)))))return;
      var id=String(user.uid)+':'+kind;if(subscriptions[id])return;subscriptions[id]=true;
      Promise.resolve(client.subscribe(user,kind)).then(function(){
        if(!current()||(kind==='audio'&&audioUid==='3'&&String(user.uid)!=='3'))return;var track=kind==='video'?user.videoTrack:user.audioTrack;if(!track)return;if(kind==='audio')audioUid=String(user.uid);
        var nativeTrack=track.getMediaStreamTrack();self.media.getTracks().filter(function(t){return t.kind===kind;}).forEach(function(t){self.media.removeTrack(t);});
        self.media.addTrack(nativeTrack);self.video.srcObject=self.media;
        if(kind==='video')self.status('Connected. Waiting for video…');
        var play=self.video.play();if(play&&play.catch)play.catch(function(){if(current())self.status('Press the sound button or OK to start playback.');});
      }).catch(function(){if(current()){delete subscriptions[id];fail('subscribe-'+kind);}});
    }
    client.on('user-published',subscribe);
    client.on('user-unpublished',function(user,kind){delete subscriptions[String(user.uid)+':'+kind];if(current()&&kind==='video'&&String(user.uid)===String(params.deviceUid))fail('camera-stopped');});
    client.on('crypt-error',function(){fail('media-decryption');});
    client.on('connection-state-change',function(state,previous){if(state==='DISCONNECTED'&&previous!=='DISCONNECTED')fail('disconnected');});
    function renew(){if(!current())return;Promise.resolve(params.renew()).then(function(token){if(current())return client.renewToken(token);}).catch(function(){fail('session-expired');});}
    client.on('token-privilege-will-expire',renew);client.on('token-privilege-did-expire',renew);
    self.timer=setTimeout(function(){fail('no-video');},60000);
    var checking=false;
    function checkUser(){
      if(!current()||checking)return;checking=true;
      var message=new root.TextEncoder().encode(JSON.stringify([{cmd:'run_action',action:'sight-safe::check-user',params:{userId:params.userId}}]));
      Promise.resolve(client.sendStreamMessage(message)).catch(function(){}).then(function(){checking=false;});
    }
    Promise.resolve(client.join(params.appId,params.channel,params.token,params.uid)).then(function(){if(!current())return client.leave();checkUser();self.checkTimer=setInterval(checkUser,500);client.remoteUsers.forEach(function(user){if(user.hasVideo)subscribe(user,'video');if(user.hasAudio)subscribe(user,'audio');});}).catch(function(){fail('join');});
  };
  root.CameraLakeStream=LakeStream;
}(typeof window==='undefined'?globalThis:window));

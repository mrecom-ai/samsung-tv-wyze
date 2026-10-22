const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
const tick=()=>new Promise(r=>setImmediate(r));
test('WebRTC uses receive-only tracks, queues ICE, and closes on leaving camera',async()=>{
  const peers=[],sockets=[];
  class PC {
    constructor(){this.transceivers=[];this.candidates=[];this.signalingState='stable';peers.push(this);}
    addTransceiver(k,o){this.transceivers.push([k,o.direction]);return {setCodecPreferences:c=>{this.preferredCodecs=c;}};}
    createOffer(){return Promise.resolve({type:'offer',sdp:'test'});}
    setLocalDescription(d){this.localDescription=d;this.signalingState='have-local-offer';return Promise.resolve();}
    setRemoteDescription(d){this.remoteDescription=d;return Promise.resolve();}
    addIceCandidate(c){this.candidates.push(c);return Promise.resolve();}
    close(){this.closed=true;}
  }
  class WS {constructor(url){this.url=url;this.readyState=1;this.sent=[];sockets.push(this);}send(s){this.sent.push(JSON.parse(s));}close(){this.closed=true;}}
  const video={pause(){},play(){return Promise.resolve();},srcObject:null}, statuses=[];
  const ctx=vm.createContext({RTCPeerConnection:PC,RTCRtpReceiver:{getCapabilities:()=>({codecs:[{mimeType:'video/H264',sdpFmtpLine:'profile-level-id=f4001f;packetization-mode=1'},{mimeType:'video/H264',sdpFmtpLine:'profile-level-id=42e02a;packetization-mode=1'},{mimeType:'video/rtx'}]})},WebSocket:WS,Promise,setTimeout,clearTimeout,btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary')});
  vm.runInContext(fs.readFileSync(__dirname+'/../app/stream.js','utf8'),ctx);
  const stream=new ctx.CameraStream(video,(...s)=>statuses.push(s));stream.start({url:'wss://example',iceServers:[]});
  assert.deepEqual(peers[0].transceivers,[['audio','recvonly'],['video','recvonly']]);
  assert.equal(peers[0].preferredCodecs.length,1);assert.ok(peers[0].preferredCodecs.every(c=>!String(c.sdpFmtpLine).includes('f4001f')),'exclude high 4:4:4 offer profiles');
  sockets[0].onopen();await tick();assert.equal(sockets[0].sent[0].action,'SDP_OFFER');
  const message=(type,p)=>({data:JSON.stringify({messageType:type,messagePayload:Buffer.from(JSON.stringify(p)).toString('base64')})});
  sockets[0].onmessage(message('ICE_CANDIDATE',{candidate:'candidate1'}));assert.equal(peers[0].candidates.length,0);
  sockets[0].onmessage(message('SDP_ANSWER',{type:'answer',sdp:'test-answer'}));await tick();assert.equal(peers[0].candidates.length,1);
  const oldTrack=peers[0].ontrack;stream.stop();oldTrack({streams:[{}]});assert.equal(video.srcObject,null);assert.equal(peers[0].closed,true);assert.equal(sockets[0].closed,true);
});

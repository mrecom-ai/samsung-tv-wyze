const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const tick=()=>new Promise(r=>setImmediate(r));
function setup(){
  const clients=[],statuses=[];let pendingJoin;
  class Media {constructor(){this.tracks=[];}getTracks(){return this.tracks;}addTrack(t){this.tracks.push(t);}removeTrack(t){this.tracks=this.tracks.filter(x=>x!==t);}}
  const sdk={setLogLevel(){},disableLogUpload(){},createClient(options){const c={options,events:{},remoteUsers:[],leaves:0,messages:[],sendStreamMessage(data){this.messages.push(new TextDecoder().decode(data));return Promise.resolve();},on(e,f){this.events[e]=f;},removeAllListeners(){this.events={};},setEncryptionConfig(...v){this.encryption=v;},join(){return pendingJoin||Promise.resolve();},leave(){this.leaves++;return Promise.resolve();},subscribe(){return Promise.resolve();},renewToken(t){this.renewed=t;return Promise.resolve();}};clients.push(c);return c;}};
  const video={muted:true,srcObject:null,addEventListener(){},removeEventListener(){},pause(){},play(){return Promise.resolve();}};
  const ctx=vm.createContext({AgoraRTC:sdk,MediaStream:Media,Promise,TextEncoder,setInterval:()=>1,clearInterval(){},setTimeout,clearTimeout});vm.runInContext(fs.readFileSync(__dirname+'/../app/lake.js','utf8'),ctx);
  return {stream:new ctx.CameraLakeStream(video,(...s)=>statuses.push(s)),clients,video,statuses,setJoin:p=>{pendingJoin=p;}};
}
const params=()=>({appId:'demo',channel:'demo',token:'demo',uid:100,deviceUid:2,userId:'demo-account',encryptionMode:'aes-128-gcm2',key:'demo-key',salt:new Uint8Array(32),renew:async()=> 'renewed'});
test('lake subscribes only to its camera video and camera audio, using the existing muted video element',async()=>{
  const x=setup();x.stream.start(params());await tick();const c=x.clients[0],v={kind:'video'},a={kind:'audio'};
  const other={uid:9,videoTrack:{getMediaStreamTrack:()=>({kind:'video'})}};
  c.events['user-published'](other,'video');await tick();assert.equal(x.video.srcObject,null);
  c.events['user-published']({uid:2,videoTrack:{getMediaStreamTrack:()=>v}},'video');c.events['user-published']({uid:3,audioTrack:{getMediaStreamTrack:()=>a}},'audio');await tick();
  assert.deepEqual(x.video.srcObject.getTracks(),[v,a]);assert.equal(x.video.muted,true);assert.equal(JSON.parse(c.messages[0])[0].params.userId,'demo-account');assert.equal(c.encryption[0],'aes-128-gcm2');assert.equal(c.encryption[3],true);
  c.events['token-privilege-will-expire']();await tick();assert.equal(c.renewed,'renewed');x.stream.stop();assert.equal(x.video.srcObject,null);assert.equal(c.leaves,1);
});
test('leaving during a lake join closes the late session and ignores late track events',async()=>{
  const x=setup();let resolve;x.setJoin(new Promise(r=>{resolve=r;}));x.stream.start(params());const c=x.clients[0],late=c.events['user-published'];x.stream.stop();resolve();await tick();
  late({uid:2,videoTrack:{getMediaStreamTrack:()=>({kind:'video'})}},'video');await tick();assert.equal(x.video.srcObject,null);assert.ok(c.leaves>=1);
});
test('decryption errors stop the client and expose no SDK error details',async()=>{
  const x=setup();x.stream.start(params());await tick();const c=x.clients[0];c.events['crypt-error']({message:'private key and token'});assert.match(x.statuses.at(-1)[0],/media-decryption/);assert.ok(!JSON.stringify(x.statuses).includes('private key'));assert.equal(c.leaves,1);
});

test('new OG audio may share the video UID; a dedicated camera audio stream takes precedence',async()=>{
 const x=setup();x.stream.start(params());await tick();const c=x.clients[0],a={kind:'audio',id:'same-camera'},b={kind:'audio',id:'dedicated'};
 c.events['user-published']({uid:2,audioTrack:{getMediaStreamTrack:()=>a}},'audio');await tick();assert.deepEqual(x.video.srcObject.getTracks(),[a]);assert.equal(x.video.muted,true);
 c.events['user-published']({uid:3,audioTrack:{getMediaStreamTrack:()=>b}},'audio');await tick();assert.deepEqual(x.video.srcObject.getTracks(),[b]);c.events['user-published']({uid:2,audioTrack:{getMediaStreamTrack:()=>a}},'audio');await tick();assert.deepEqual(x.video.srcObject.getTracks(),[b]);x.stream.stop();
});

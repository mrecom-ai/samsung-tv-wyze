const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const crypto=require('node:crypto');
function setup() {
  const calls=[], replies=[];
  class XHR {
    open(method,url){this.method=method;this.url=url;this.headers={};}
    setRequestHeader(k,v){this.headers[k]=v;}
    send(body){calls.push({url:this.url,headers:this.headers,body:JSON.parse(body),raw:body});const r=replies.shift();assert.ok(r,'unexpected request');this.status=r.status||200;this.responseText=JSON.stringify(r.body||r);queueMicrotask(()=>this.onload());}
  }
  const ctx=vm.createContext({XMLHttpRequest:XHR,Promise,Date,Math,crypto:crypto.webcrypto,atob:s=>Buffer.from(s,'base64').toString('binary')});
  for(const f of ['vendor/crypto-js.js','vendor/xxtea.js','api.js'])vm.runInContext(fs.readFileSync(__dirname+'/../app/'+f,'utf8'),ctx);
  return {api:new ctx.WyzeAPI(),calls,replies,ctx};
}
const md5=s=>crypto.createHash('md5').update(s).digest('hex');
test('developer login hashes password and drops transient secrets on success',async()=>{
  const {api,calls,replies}=setup();replies.push({access_token:'access',refresh_token:'refresh',user_id:'demo-account'});
  await api.login(' test@example.com ','test password','id','key');
  assert.equal(calls[0].body.password,md5(md5(md5('test password'))));
  assert.equal(calls[0].body.email,'test@example.com');assert.equal(calls[0].headers.Apikey,'key');
  assert.equal(api.pending,null);assert.equal(api.tokens.access_token,'access');assert.equal(api.tokens.user_id,'demo-account');
});
test('OG cameras remain in discovery; camera names are data',async()=>{
  const {api,replies}=setup();api.tokens={access_token:'a',refresh_token:'r',obtained:Date.now()};
  replies.push({code:'1',data:{device_list:[{device_model:'GW_GC1',device_id:'cam1',nickname:'<camera>',property:{'iot-device::iot-state':1},device_param:{p2p:{providers:['mars','webrtc']}}}]}});
  const cams=await api.cameras();assert.equal(cams.length,1);assert.equal(cams[0].model,'GW_GC1');assert.equal(cams[0].name,'<camera>');
});
test('expired session refreshes without repeating password login',async()=>{
  const {api,replies,calls}=setup();api.tokens={access_token:'old',refresh_token:'r',obtained:0};
  replies.push({code:'1',data:{access_token:'new',refresh_token:'r2'}},{code:'1',data:{device_list:[]}});
  await api.cameras();assert.match(calls[0].url,/refresh_token$/);assert.equal(calls[1].headers.access_token,'new');
});
test('stream request signs exact bytes; signed websocket URL stays unchanged',async()=>{
  const {api,replies,calls}=setup();api.tokens={access_token:'token',refresh_token:'r',obtained:Date.now()};
  const url='wss://kvs.us-west-2.amazonaws.com/?X-Amz-Signature=a%2Fb';
  replies.push({code:'1',data:[{params:{signaling_url:url,ice_servers:[{url:'turn:example',username:'u',credential:'c'}]}}]});
  const p=await api.stream({mac:'m',model:'GW_GC1'});
  const expected=crypto.createHmac('md5',md5('token'+'gbJojEBViLklgwyyDikx5ztSvKBXI5oU')).update(calls[0].raw).digest('hex');
  assert.equal(calls[0].headers.signature2,expected);assert.equal(p.url,url);assert.equal(p.iceServers[0].urls,'turn:example');
});
test('errors do not expose raw tokens or account details',async()=>{
  const {api,replies}=setup();replies.push({code:'2001',msg:'secret-token-123 test@example.com'});
  await assert.rejects(api.login('e','p','i','k'),e=>!e.message.includes('secret-token')&&!e.message.includes('@'));
});
test('TOTP challenge uses returned verification id and clears secrets afterwards',async()=>{
  const {api,replies,calls}=setup();
  replies.push({mfa_options:['TotpVerificationCode'],mfa_details:{totp_apps:[{app_id:'app1'}]}},{access_token:'a',refresh_token:'r'});
  assert.ok((await api.login('e','p','i','k')).mfa);await api.verify('123456');
  assert.equal(calls[1].body.verification_id,'app1');assert.equal(calls[1].body.verification_code,'123456');assert.equal(api.pending,null);
});
test('refresh discovers a new same-model camera and selects its advertised transport',async()=>{
  const {api,replies,calls}=setup();api.tokens={access_token:'t',refresh_token:'r',obtained:Date.now()};
  const camera=(id,providers)=>({device_id:id,device_model:'GW_GC1',nickname:id,property:{'iot-device::iot-state':1},device_param:{p2p:{providers}}});
  replies.push({code:1,data:{device_list:[camera('original',['mars','webrtc'])]}},{code:1,data:{device_list:[camera('original',['mars','webrtc']),camera('new',['mars','lake'])]}});
  assert.equal((await api.cameras()).length,1);const next=await api.cameras();assert.equal(next.length,2);
  let selected=null;api.lakeStream=async c=>{selected=c.mac;return {provider:'lake'};};
  assert.equal((await api.stream(next[1])).provider,'lake');assert.equal(selected,'new');assert.equal(calls.length,2);
  assert.deepEqual(Array.from(next[0].providers),['mars','webrtc']);
});
test('capability discovery can fall back to legacy listing during an endpoint outage',async()=>{
  const {api,replies}=setup();api.tokens={access_token:'t',refresh_token:'r',obtained:Date.now()};
  replies.push({status:503,body:{}},{code:1,data:{device_list:[{product_type:'Camera',product_model:'GW_GC1',mac:'older',conn_state:1}]}});
  assert.equal((await api.cameras())[0].mac,'older');
});
test('lake media keys are unwrapped only in memory and renewal uses the issued viewer identity',async()=>{
  const {api,replies,calls}=setup();api.tokens={access_token:'0123456789abcdef',refresh_token:'r',user_id:'demo-account',obtained:Date.now()};
  replies.push({code:1,data:[{params:{channel:'demo-channel',encryption_mode:7,encryption_key:'0Sc5WQ7srMKNP2j/44yfqHHjqeUrqNGV',encryption_salt:'odILciSgwC/gAzubCSl1vBRU9CV6MWS80OvGNf2WLEpBg3840YQ+bfyuT4Grsb8C'}}]},{code:1,data:{app_id:'demo-app',uid:12345,device_uid:2,rtc_token:'demo-rtc-token'}},{code:1,data:{rtc_token:'renewed-demo-token'}});
  const p=await api.stream({mac:'new',model:'GW_GC1',providers:['lake'],capabilitiesKnown:true});
  assert.equal(calls[0].body.device_list[0].provider,'lake');assert.equal(p.key,'example-media-key');assert.equal(p.encryptionMode,'aes-128-gcm2');assert.deepEqual(Array.from(p.salt),Array.from({length:32},(_,i)=>i));
  assert.equal(await p.renew(),'renewed-demo-token');assert.equal(calls[2].body.uid,12345);
  assert.ok(!calls[1].raw.includes('example-media-key'),'media keys never sent to connection endpoint');
});
test('unknown transport and malformed encryption fail clearly without opening another stream',async()=>{
  const {api,replies,calls}=setup();api.tokens={access_token:'t',refresh_token:'r',user_id:'demo-account',obtained:Date.now()};
  await assert.rejects(api.stream({mac:'x',model:'new-model',providers:['unknown'],capabilitiesKnown:true}),/supported live-view/);assert.equal(calls.length,0);
  replies.push({code:1,data:[{params:{channel:'demo',encryption_mode:0,encryption_key:'sensitive-invalid',encryption_salt:'bad'}}]});
  await assert.rejects(api.stream({mac:'x',model:'GW_GC1',providers:['lake']}),e=>!e.message.includes('sensitive-invalid')&&/unsupported encrypted/.test(e.message));assert.equal(calls.length,1);
});

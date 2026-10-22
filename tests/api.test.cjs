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
  const ctx=vm.createContext({XMLHttpRequest:XHR,Promise,Date,Math});
  for(const f of ['vendor/crypto-js.js','api.js'])vm.runInContext(fs.readFileSync(__dirname+'/../app/'+f,'utf8'),ctx);
  return {api:new ctx.WyzeAPI(),calls,replies};
}
const md5=s=>crypto.createHash('md5').update(s).digest('hex');
test('developer login hashes password and drops transient secrets on success',async()=>{
  const {api,calls,replies}=setup();replies.push({access_token:'access',refresh_token:'refresh'});
  await api.login(' test@example.com ','test password','id','key');
  assert.equal(calls[0].body.password,md5(md5(md5('test password'))));
  assert.equal(calls[0].body.email,'test@example.com');assert.equal(calls[0].headers.Apikey,'key');
  assert.equal(api.pending,null);assert.equal(api.tokens.access_token,'access');
});
test('OG cameras remain in discovery; camera names are data',async()=>{
  const {api,replies}=setup();api.tokens={access_token:'a',refresh_token:'r',obtained:Date.now()};
  replies.push({code:'1',data:{device_list:[{product_type:'Camera',product_model:'GW_GC1',mac:'cam1',nickname:'<camera>',conn_state:1},{product_type:'Plug'}]}});
  const cams=await api.cameras();assert.equal(cams.length,1);assert.equal(cams[0].model,'GW_GC1');assert.equal(cams[0].name,'<camera>');
});
test('expired session refreshes without repeating password login',async()=>{
  const {api,replies,calls}=setup();api.tokens={access_token:'old',refresh_token:'r',obtained:0};
  replies.push({code:'1',data:{access_token:'new',refresh_token:'r2'}},{code:'1',data:{device_list:[]}});
  await api.cameras();assert.match(calls[0].url,/refresh_token$/);assert.equal(calls[1].body.access_token,'new');
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

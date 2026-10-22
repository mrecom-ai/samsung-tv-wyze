const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),http=require('node:http'),net=require('node:net'),{spawn}=require('node:child_process');
const nacl=require('../app/vendor/nacl-fast.min.js');
const b64=a=>Buffer.from(a).toString('base64');
test('setup enforces local form/CSRF checks and delivers authenticated ciphertext only',async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'camera-handoff-test-'));
  const reservation=net.createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));
  const pair=nacl.box.keyPair(),sender=nacl.box.keyPair(),session={publicKey:b64(pair.publicKey),senderPublicKey:b64(sender.publicKey),senderSecretKey:b64(sender.secretKey),token:'fakehandofftoken',formToken:'fakeformtoken',expires:Date.now()+60000,host:'127.0.0.1',tv:'127.0.0.1',port};
  const file=path.join(temp,'session.json');fs.writeFileSync(file,JSON.stringify(session));
  const child=spawn(process.execPath,[path.join(__dirname,'../scripts/setup.cjs')],{env:{...process.env,CAMERA_SETUP_SESSION_FILE:file},stdio:['ignore','pipe','pipe']});
  try{
    await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',()=>reject(Error('server exited')));});
    function request(method,url,body,headers={}) {return new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port,path:url,method,headers},res=>{let text='';res.on('data',d=>text+=d);res.on('end',()=>resolve({status:res.statusCode,text}));});req.on('error',reject);req.end(body);});}
    assert.equal((await request('GET','/',null,{Host:'attacker.invalid'})).status,403);
    assert.equal((await request('POST','/setup','{}',{'Content-Type':'application/json',Origin:`http://127.0.0.1:${port}`})).status,403);
    const data={keyid:'FAKE-API-ID',apikey:'FAKE-API-SECRET',email:'fake@example.invalid',password:'FAKE-PASSWORD'};
    const headers={'Content-Type':'application/json',Origin:`http://127.0.0.1:${port}`,'X-Setup-Token':session.formToken};
    assert.equal((await request('POST','/setup',JSON.stringify(data),headers)).status,200);
    const r=await request('GET','/handoff/'+session.token);assert.equal(r.status,200);assert.ok(!r.text.includes('FAKE-'));
    const context=vm.createContext({nacl,Uint8Array,atob:s=>Buffer.from(s,'base64').toString('binary')});
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../app/provisioning.js'),'utf8'),context);
    const envelope=JSON.parse(r.text),config={secretKey:b64(pair.secretKey),senderPublicKey:session.senderPublicKey};
    const decrypted=context.CameraProvisioner.unpack(envelope,config);assert.equal(decrypted.apikey,data.apikey);assert.equal(decrypted.password,data.password);
    const corrupt={...envelope,box:b64(nacl.randomBytes(50))};assert.throws(()=>context.CameraProvisioner.unpack(corrupt,config));
    assert.throws(()=>context.CameraProvisioner.unpack({...envelope,publicKey:b64(nacl.randomBytes(32))},config),'reject an untrusted sender');
    assert.equal((await request('POST','/setup',JSON.stringify(data),headers)).status,403,'no overwrite after submission');
    await request('GET','/handoff/'+session.token+'/received');assert.equal(JSON.parse((await request('GET','/status')).text).received,true);
    assert.equal((await request('GET','/handoff/'+session.token)).status,204,'payload is purged after acknowledgement');
  }finally{child.kill();await new Promise(r=>child.once('exit',r));fs.rmSync(temp,{recursive:true,force:true});}
});

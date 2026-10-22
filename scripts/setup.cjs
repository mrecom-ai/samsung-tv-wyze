// Ephemeral, memory-only credential handoff. Run prepare before packaging,
// then serve. Browser form/POST are loopback-only; TV endpoint is ciphertext.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),net=require('node:net');
const nacl=require('../app/vendor/nacl-fast.min.js');
const root=path.resolve(__dirname,'..'), file=process.env.CAMERA_SETUP_SESSION_FILE||path.join(root,'.local/setup-session.json');
const b64=x=>Buffer.from(x).toString('base64');
function option(name,fallback){const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];}
if(process.argv[2]==='prepare'){
  const host=option('--host'),tv=option('--tv'),port=Number(option('--port','4798'));
  if(!net.isIPv4(host||'')||!net.isIPv4(tv||'')||host.startsWith('127.')||host==='0.0.0.0'||!Number.isInteger(port)||port<1024||port>65535){console.error('Usage: node scripts/setup.cjs prepare --host COMPUTER_LAN_IP --tv TV_LAN_IP [--port 4798]');process.exit(1);}
  const pair=nacl.box.keyPair(), sender=nacl.box.keyPair(), token=crypto.randomBytes(32).toString('hex');
  const s={publicKey:b64(pair.publicKey),senderPublicKey:b64(sender.publicKey),senderSecretKey:b64(sender.secretKey),token,formToken:crypto.randomBytes(32).toString('hex'),expires:Date.now()+30*60*1000,host,tv,port};
  fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(s),{mode:0o600});
  fs.writeFileSync(path.join(root,'.local/runtime-config.js'),'window.CameraProvisioning='+JSON.stringify({url:`http://${s.host}:${s.port}/handoff/${token}`,secretKey:b64(pair.secretKey),senderPublicKey:s.senderPublicKey,expires:s.expires})+';\n',{mode:0o600});pair.secretKey.fill(0);sender.secretKey.fill(0);
  console.log('Prepared a 30-minute encrypted setup session.');process.exit(0);
}
const session=JSON.parse(fs.readFileSync(file)), recipient=Buffer.from(session.publicKey,'base64');
let envelope=null,received=false,submitting=false;
function local(req){return ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);}
function reply(res,status,body='',type='application/json'){res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'"});res.end(body);}
const server=http.createServer((req,res)=>{
  if(Date.now()>session.expires)return reply(res,410,'{}');
  const handoff='/handoff/'+session.token;
  if(req.method==='GET'&&req.url===handoff&&req.socket.remoteAddress===session.tv){res.setHeader('Access-Control-Allow-Origin','*');return reply(res,envelope?200:204,envelope?JSON.stringify(envelope):'');}
  if(req.method==='GET'&&req.url===handoff+'/received'&&req.socket.remoteAddress===session.tv){received=true;envelope=null;res.setHeader('Access-Control-Allow-Origin','*');reply(res,200,'{}');setTimeout(()=>server.close(),60000).unref();return;}
  if(!local(req)||req.headers.host!==`127.0.0.1:${session.port}`)return reply(res,403,'{}');
  if(req.method==='GET'&&req.url==='/')return reply(res,200,fs.readFileSync(path.join(__dirname,'setup.html'),'utf8').replace('FORM_TOKEN',session.formToken),'text/html; charset=utf-8');
  if(req.method==='GET'&&req.url==='/setup.js')return reply(res,200,fs.readFileSync(path.join(__dirname,'setup-client.js')),'application/javascript');
  if(req.method==='GET'&&req.url==='/setup.css')return reply(res,200,fs.readFileSync(path.join(__dirname,'setup.css')),'text/css');
  if(req.method==='GET'&&req.url==='/status')return reply(res,200,JSON.stringify({received}));
  if(req.method==='POST'&&req.url==='/setup'){
    if(req.headers.origin!==`http://127.0.0.1:${session.port}`||req.headers['x-setup-token']!==session.formToken||submitting||envelope||received)return reply(res,403,'{}');
    submitting=true;let body='',size=0;
    req.on('data',chunk=>{size+=chunk.length;if(size>16384){body='';req.destroy();submitting=false;}else body+=chunk;});
    req.on('error',()=>{body='';submitting=false;});
    req.on('end',()=>{
      try{
        const data=JSON.parse(body);body='';
        if(typeof data.keyid!=='string'||typeof data.apikey!=='string'||!data.keyid.trim()||!data.apikey.trim())throw Error();
        const plain=Buffer.from(JSON.stringify({keyid:data.keyid.trim(),apikey:data.apikey.trim(),email:typeof data.email==='string'?data.email.trim():'',password:typeof data.password==='string'?data.password:''}));
        const sender={publicKey:Buffer.from(session.senderPublicKey,'base64'),secretKey:Buffer.from(session.senderSecretKey,'base64')}, nonce=nacl.randomBytes(nacl.box.nonceLength), box=nacl.box(plain,nonce,recipient,sender.secretKey);
        envelope={version:1,box:b64(box),nonce:b64(nonce),publicKey:b64(sender.publicKey)};plain.fill(0);sender.secretKey.fill(0);Object.keys(data).forEach(k=>data[k]='');
        reply(res,200,'{"ok":true}');
      }catch(_){reply(res,400,'{}');}finally{submitting=false;}
    });return;
  }
  reply(res,404,'{}');
});
server.headersTimeout=10000;server.requestTimeout=15000;
server.listen(session.port,'0.0.0.0',()=>console.log('Local setup page ready at http://127.0.0.1:'+session.port));
const expiry=setTimeout(()=>{envelope=null;server.close();},Math.max(1,session.expires-Date.now()));expiry.unref();
server.on('close',()=>{envelope=null;try{fs.unlinkSync(file);}catch(_){}console.log('Setup session closed.');});

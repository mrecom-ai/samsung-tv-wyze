const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
test('public build defaults contain no setup key; private setup is overlaid only into an opted-in widget',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'camera-public-build-')),root=path.resolve(__dirname,'..');
 try{
  for(const name of ['app','scripts','LICENSE','THIRD_PARTY_NOTICES.md'])fs.cpSync(path.join(root,name),path.join(tmp,name),{recursive:true});
  function run(exe,args){const r=spawnSync(exe,args,{cwd:tmp,encoding:'utf8'});assert.equal(r.status,0,r.stderr||r.stdout);return r.stdout;}
  function readWidget(){return JSON.parse(run('python3',['-c',"import json,zipfile;z=zipfile.ZipFile('dist/CameraView-unsigned.wgt');print(json.dumps({'config':z.read('config.xml').decode(),'runtime':z.read('runtime-config.js').decode(),'files':z.namelist()}))"]));}
  run('python3',['scripts/package.py','--unsigned']);const plain=readWidget();assert.ok(!plain.runtime.includes('secretKey'));assert.ok(!plain.config.includes('192.0.2.1'));
  run(process.execPath,['scripts/setup.cjs','prepare','--host','192.0.2.1','--tv','198.51.100.2']);
  run('python3',['scripts/package.py','--unsigned','--setup']);const setup=readWidget();assert.ok(setup.runtime.includes('secretKey'));assert.ok(setup.config.includes('http://192.0.2.1:4798'));assert.ok(setup.files.every(n=>!n.startsWith('.local/')&&!n.endsWith('.p12')));
  assert.ok(!fs.readFileSync(path.join(tmp,'app/runtime-config.js'),'utf8').includes('secretKey'),'tracked runtime defaults remain untouched');
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});

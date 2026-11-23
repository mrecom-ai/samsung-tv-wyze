const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(storage){const ctx=vm.createContext({});vm.runInContext(fs.readFileSync(__dirname+'/../app/credentials.js','utf8'),ctx);return new ctx.CameraKeyStore(storage);}
test('remembered API pair survives session sign-out and reload without saving account secrets',()=>{
 const map=new Map(),storage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)},store=setup(storage);
 assert.equal(store.save({keyid:' demo-id ',apikey:' demo-key ',password:'private-password',email:'test@example.com',access_token:'private-session',code:'123456'}),true);
 storage.setItem('camera-view-session-v1','private-session');storage.removeItem('camera-view-session-v1');
 const reloaded=setup(storage);assert.equal(reloaded.read().keyid,'demo-id');assert.equal(reloaded.read().apikey,'demo-key');
 assert.deepEqual(Object.keys(JSON.parse(map.get('camera-view-api-keys-v1'))).sort(),['apikey','keyid']);assert.ok(!JSON.stringify([...map]).includes('private-'));
 assert.equal(reloaded.forget(),true);assert.equal(setup(storage).read(),null);
});
test('invalid saved data and unavailable TV storage do not crash sign-in',()=>{
 for(const raw of ['broken JSON','null','{"keyid":"a"}','{"keyid":{},"apikey":"b"}'])assert.equal(setup({getItem:()=>raw}).read(),null);
 const store=setup({getItem(){throw Error();},setItem(){throw Error();},removeItem(){throw Error();}});assert.equal(store.read(),null);assert.equal(store.save({keyid:'demo',apikey:'demo'}),false);assert.equal(store.forget(),false);assert.equal(store.save({keyid:'',apikey:'demo'}),false);
});

const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const tick=()=>new Promise(r=>setImmediate(r));
function setup(api){
 class Element{constructor(tag){this.tag=tag;this.children=[];this.style={};this.classList={toggle(){},add(){},remove(){}};}appendChild(x){this.children.push(x);}removeChild(x){this.children=this.children.filter(c=>c!==x);}setAttribute(){}set textContent(s){this.text=s;this.children=[];}get textContent(){return this.text;}play(){return Promise.resolve();}}
 const streams=[],timers=[];
 class Stream{constructor(video,status){this.video=video;this.status=status;streams.push(this);}stop(){this.stopped=true;}start(p){this.started=p;}}
 const ctx=vm.createContext({document:{createElement:t=>new Element(t)},CameraStream:Stream,Promise,setTimeout:f=>{timers.push(f);return timers.length;},clearTimeout(){}});
 vm.runInContext(fs.readFileSync(__dirname+'/../app/wall.js','utf8'),ctx);const container=new Element('div');
 return {wall:new ctx.CameraWall(container,api,()=>{}),container,streams,timers};
}
test('leaving a wall closes every feed and cancels late connection results',async()=>{
 let resolve;const s=setup({stream:()=>new Promise(r=>resolve=r)});s.wall.start([{name:'A'},{name:'B'}]);
 assert.equal(s.wall.items.length,2);s.wall.stop();resolve({url:'late'});await tick();
 assert.equal(s.container.children.length,0);assert.ok(s.streams.every(x=>x.stopped&&!x.started));
});
test('all cameras get separate sessions; sound is limited to one feed',async()=>{
 const calls=[],s=setup({stream:c=>{calls.push(c.name);return Promise.resolve({url:c.name});}});
 s.wall.start([{name:'A'},{name:'B'},{name:'C'}]);await tick();s.timers.shift()();await tick();s.timers.shift()();await tick();
 assert.deepEqual(calls,['A','B','C']);assert.ok(s.streams.every(x=>x.started));
 s.wall.items[0].sound.onclick();assert.equal(s.wall.items[0].video.muted,false);
 s.wall.items[1].sound.onclick();assert.equal(s.wall.items[0].video.muted,true);assert.equal(s.wall.items[1].video.muted,false);assert.equal(s.wall.items[2].video.muted,true);s.wall.stop();
});
test('named audio selection mutes previous feeds before enabling another, and Off silences all',async()=>{
 const s=setup({stream:()=>Promise.resolve({url:'test'})});s.wall.start([{name:'A'},{name:'B'}]);await tick();
 const changes=[];s.wall.items.forEach((item,index)=>{let value=true;Object.defineProperty(item.video,'muted',{get(){return value;},set(v){changes.push([index,v]);value=v;}});});
 s.wall.setAudio(0);changes.length=0;s.wall.setAudio(1);assert.deepEqual(changes,[[0,true],[1,true],[1,false]]);assert.equal(s.wall.audioIndex,1);
 s.wall.setAudio(99);assert.equal(s.wall.audioIndex,1,'ignore nonexistent sources');s.wall.setAudio(null);assert.ok(s.wall.items.every(i=>i.video.muted));assert.equal(s.wall.audioIndex,null);s.wall.stop();
});
test('All cameras excludes offline devices before requesting any streams',async()=>{
 const calls=[],s=setup({stream:c=>{calls.push(c.name);return Promise.resolve({url:c.name});}});
 s.wall.start([{name:'Down',online:false},{name:'Up',online:true}],{hideUnavailable:true});await tick();
 assert.equal(s.wall.items.length,1);assert.equal(s.container.children.length,1);assert.deepEqual(calls,['Up']);assert.equal(s.container.style.gridTemplateColumns,'repeat(1,1fr)');s.wall.stop();
});
test('failed All-camera feeds are removed without skipping queued cameras or moving sound to another source',async()=>{
 const calls=[],s=setup({stream:c=>{calls.push(c.name);return c.name==='Failed'?Promise.reject(Error('unreachable')):Promise.resolve({url:c.name});}});
 s.wall.start([{name:'Failed',online:true},{name:'Good',online:true},{name:'Later',online:true}],{hideUnavailable:true});await tick();
 assert.deepEqual(Array.from(s.wall.items,i=>i.camera.name),['Good','Later']);s.timers.shift()();await tick();s.timers.shift()();await tick();assert.deepEqual(calls,['Failed','Good','Later']);
 s.wall.setAudio(0);s.wall.items[0].stream.status('lost',true);assert.equal(s.wall.items.length,1);assert.equal(s.wall.items[0].camera.name,'Later');assert.equal(s.wall.audioIndex,null);assert.equal(s.wall.items[0].video.muted,true);assert.equal(s.container.style.gridTemplateColumns,'repeat(1,1fr)');s.wall.stop();
});
test('an All-camera wall reports zero available feeds and closes stale callbacks safely',async()=>{
 const s=setup({stream:()=>Promise.resolve({url:'demo'})}),counts=[];s.wall.changed=c=>counts.push(c.length);
 s.wall.start([{name:'One',online:true}],{hideUnavailable:true});await tick();const stream=s.wall.items[0].stream;stream.status('timeout',true);assert.equal(s.container.children.length,0);assert.deepEqual(counts,[1,0]);stream.status('late failure',true);assert.equal(s.container.children.length,0);s.wall.stop();
});

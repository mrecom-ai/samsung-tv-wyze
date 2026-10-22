const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const c=vm.createContext({});vm.runInContext(fs.readFileSync(__dirname+'/../app/sdp.js','utf8'),c);
const offer=['v=0','a=group:BUNDLE 0 1','m=audio 9 UDP/TLS/RTP/SAVPF 0','a=mid:0','a=recvonly','a=ice-pwd:FAKE-PASSWORD','m=video 9 UDP/TLS/RTP/SAVPF 96 100 101 114 45','a=mid:1','a=recvonly','a=rtpmap:96 VP8/90000','a=rtpmap:100 H264/90000','a=fmtp:100 profile-level-id=42002a;packetization-mode=1','a=rtpmap:101 rtx/90000','a=fmtp:101 apt=100','a=rtpmap:114 H264/90000','a=fmtp:114 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e02a','a=rtpmap:45 H264/90000','a=fmtp:45 packetization-mode=1;profile-level-id=f4001f','a=rtcp-fb:45 nack','a=rtcp-fb:114 nack pli','a=fingerprint:sha-256 FAKE-FINGERPRINT',''].join('\r\n');
test('fallback offer excludes unsupported profiles even if codec preferences fail',()=>{
 const s=c.CameraSDP.baselineOffer(offer);assert.match(s,/m=video 9 UDP\/TLS\/RTP\/SAVPF 114\r\n/);assert.doesNotMatch(s,/f4001f|a=rtpmap:96|a=fmtp:101|a=rtcp-fb:45/);assert.match(s,/a=rtcp-fb:114 nack pli/);assert.match(s,/a=ice-pwd:FAKE-PASSWORD/);assert.match(s,/a=fingerprint:sha-256 FAKE-FINGERPRINT/);
});
test('invalid remote receive direction is constrained without changing ICE or codec data',()=>{
 const answer=offer.replace(/a=recvonly/g,'a=sendrecv');const r=c.CameraSDP.receiveOnlyAnswer(offer,answer);assert.equal(r.changed,true);assert.doesNotMatch(r.sdp,/a=sendrecv/);assert.match(r.sdp,/a=sendonly/);assert.match(r.sdp,/a=ice-pwd:FAKE-PASSWORD/);assert.match(r.sdp,/profile-level-id=f4001f/);
});
test('valid receive-only answers are preserved',()=>{
 const answer=offer.replace(/a=recvonly/g,'a=sendonly');const r=c.CameraSDP.receiveOnlyAnswer(offer,answer);assert.equal(r.changed,false);assert.equal(r.sdp,answer);
});

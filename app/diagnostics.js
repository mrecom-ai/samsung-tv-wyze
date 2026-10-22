(function (root) {
  'use strict';
  function classify(e) {
    var s=String(e && e.message || '').toLowerCase();
    if(s.indexOf('incompatible send direction')>=0)return 'direction';
    if(s.indexOf('order')>=0 && s.indexOf('m-line')>=0)return 'media-order';
    if(s.indexOf('codec')>=0)return 'codec';
    if(s.indexOf('parse')>=0 || s.indexOf('sdp syntax')>=0)return 'sdp-parse';
    if(s.indexOf('fingerprint')>=0)return 'fingerprint';
    if(s.indexOf('send parameters')>=0)return 'send-parameters';
    if(s.indexOf('receive parameters')>=0)return 'receive-parameters';
    if(s.indexOf('bundle')>=0)return 'bundle';
    if(s.indexOf('mid')>=0)return 'media-id';
    if(s.indexOf('state')>=0)return 'state';
    if(s.indexOf('rtcp-mux')>=0)return 'rtcp-mux';
    if(s.indexOf('dtls')>=0)return 'dtls';
    return 'other';
  }
  function reason(e){
    var s=String(e&&e.message||'').split(/[\r\n]/)[0].slice(0,500);
    if(/ice-|fingerprint|candidate:|authorization|token|a=/i.test(s))return 'SDP detail omitted';
    return s.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g,'address').replace(/\b[a-f0-9]{32,}\b/gi,'identifier');
  }
  function summary(sdp) {
    return String(sdp||'').split(/\r?\nm=/).slice(1).map(function(s){
      var m=s.match(/^(audio|video|application) /),d=s.match(/(?:^|\r?\n)a=(sendrecv|sendonly|recvonly|inactive)(?:\r?\n|$)/), codecs=[];
      s.replace(/a=rtpmap:(\d+) ([A-Za-z0-9-]+)\/(\d+)/g,function(_,pt,name,rate){codecs.push({pt:Number(pt),name:name,rate:Number(rate)});return _;});
      var profiles=[];s.replace(/a=fmtp:(\d+) [^\r\n]*profile-level-id=([0-9a-f]{6})/gi,function(_,pt,p){profiles.push({pt:Number(pt),profile:p});return _;});
      var mid=s.match(/(?:^|\r?\n)a=mid:([a-zA-Z0-9_-]{1,32})(?:\r?\n|$)/);
      return {kind:m?m[1]:'unknown',direction:d?d[1]:'sendrecv',mid:mid?mid[1]:'missing',codecs:codecs,profiles:profiles,imageattr:/a=imageattr:/.test(s)};
    });
  }
  function report() {} // No remote diagnostics or telemetry in public builds.
  root.CameraDiagnostics={report:report,classify:classify,summary:summary,reason:reason};
}(typeof window === 'undefined' ? globalThis : window));

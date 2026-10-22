(function(root){
  'use strict';
  function parts(sdp){return String(sdp).replace(/\r?\n/g,'\r\n').split('\r\nm=');}
  function baselineOffer(sdp){
    var p=parts(sdp);
    for(var i=1;i<p.length;i++){
      var lines=p[i].split('\r\n'),m=lines[0].split(' ');if(m[0]!=='video')continue;
      var codecs={},fmtp={};
      lines.forEach(function(l){var r=l.match(/^a=rtpmap:(\d+) H264\//i);if(r)codecs[r[1]]=true;var f=l.match(/^a=fmtp:(\d+) (.*)$/);if(f)fmtp[f[1]]=f[2];});
      var allowed=m.slice(3).filter(function(pt){return codecs[pt]&&/profile-level-id=42[0-9a-f]{4}/i.test(fmtp[pt]||'')&&/packetization-mode=1(?:;|$)/.test(fmtp[pt]||'');});
      if(!allowed.length)continue;
      allowed.sort(function(a,b){return (/profile-level-id=42e0/i.test(fmtp[a])?0:1)-(/profile-level-id=42e0/i.test(fmtp[b])?0:1);});
      var selected=allowed[0];lines[0]=m.slice(0,3).concat([selected]).join(' ');
      p[i]=lines.filter(function(l,index){if(!index)return true;var r=l.match(/^a=(?:rtpmap|fmtp|rtcp-fb):(\d+)\b/);return !r||r[1]===selected;}).join('\r\n');
    }
    return p.join('\r\nm=');
  }
  function receiveOnlyAnswer(offer,answer){
    var offers=parts(offer),answers=parts(answer),changed=false;
    for(var i=1;i<answers.length&&i<offers.length;i++){
      var o=offers[i],a=answers[i];
      if(o.split(' ')[0]!==a.split(' ')[0]||!/(?:^|\r\n)a=recvonly(?:\r\n|$)/.test(o))continue;
      // A receive-only offer cannot negotiate a remote receive path. Some Wyze
      // answers say sendrecv; constraining that path does not add/send tracks.
      if(/(?:^|\r\n)a=sendrecv(?:\r\n|$)/.test(a)){answers[i]=a.replace(/(^|\r\n)a=sendrecv(?=\r\n|$)/g,'$1a=sendonly');changed=true;}
      else if(!/(?:^|\r\n)a=(sendonly|recvonly|inactive)(?:\r\n|$)/.test(a)){answers[i]=a.replace(/\r\n$/,'')+'\r\na=sendonly\r\n';changed=true;}
    }
    return {sdp:answers.join('\r\nm='),changed:changed};
  }
  root.CameraSDP={baselineOffer:baselineOffer,receiveOnlyAnswer:receiveOnlyAnswer};
}(typeof window==='undefined'?globalThis:window));

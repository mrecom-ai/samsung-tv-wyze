(function (root) {
  'use strict';
  function bytes(s) { var a = atob(s), b = new Uint8Array(a.length), i; for (i=0;i<a.length;i++) b[i]=a.charCodeAt(i); return b; }
  function unpack(envelope, config) {
    if (!envelope || envelope.version !== 1 || envelope.publicKey !== config.senderPublicKey) throw new Error('Invalid setup message.');
    var plain = root.nacl.box.open(bytes(envelope.box), bytes(envelope.nonce), bytes(envelope.publicKey), bytes(config.secretKey));
    if (!plain) throw new Error('The setup message could not be verified.');
    var s = '', i; for (i=0;i<plain.length;i++) s+=String.fromCharCode(plain[i]);
    var data = JSON.parse(decodeURIComponent(escape(s))); plain.fill(0);
    if (typeof data.keyid !== 'string' || typeof data.apikey !== 'string' || !data.keyid || !data.apikey) throw new Error('The API ID and API key are required.');
    return {keyid:data.keyid, apikey:data.apikey, email:typeof data.email === 'string' ? data.email : '', password:typeof data.password === 'string' ? data.password : ''};
  }
  function CameraProvisioner(status, received, finished) { this.status=status; this.received=received; this.finished=finished; this.running=false; }
  CameraProvisioner.prototype.stop = function () { this.running=false; clearTimeout(this.timer); if (this.request) { this.request.onload=null; this.request.onerror=null; this.request.ontimeout=null; this.request.abort(); } this.request=null; };
  CameraProvisioner.prototype.start = function () {
    var self=this, c=root.CameraProvisioning;
    if (!c || Date.now()>c.expires) { self.status('Mac setup has expired. Ask to start a new setup session.',true); self.finished(); return; }
    self.running=true; self.status('Waiting for details from the Mac setup page…');
    function poll() {
      if (!self.running) return;
      if (Date.now()>c.expires) { self.stop(); self.status('Mac setup expired. Start a new setup session.',true); self.finished(); return; }
      var x=new XMLHttpRequest(); self.request=x; x.open('GET',c.url,true); x.timeout=4000;
      function retry() { if(self.running) self.timer=setTimeout(poll,2000); }
      x.onerror=retry; x.ontimeout=retry;
      x.onload=function () {
        if (!self.running) return;
        if (x.status===204) { retry(); return; }
        if (x.status!==200) { self.stop(); self.status('Mac setup is unavailable. Start a new setup session.',true); self.finished(); return; }
        try {
          var data=unpack(JSON.parse(x.responseText),c);
          self.stop(); self.received(data);
          var ack=new XMLHttpRequest(); ack.open('GET',c.url+'/received',true); ack.timeout=4000; ack.send();
          c.secretKey=''; root.CameraProvisioning=null;
        } catch (_) { self.stop(); self.status('Could not verify the setup message. Nothing was entered.',true); self.finished(); }
      }; x.send();
    }
    poll();
  };
  root.CameraProvisioner=CameraProvisioner;
  root.CameraProvisioner.unpack=unpack;
}(typeof window === 'undefined' ? globalThis : window));

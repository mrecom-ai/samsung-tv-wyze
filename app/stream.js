/* KVS message envelope based on wyze-api's MIT browser viewer. */
(function (root) {
  'use strict';
  function encode(p) { return btoa(unescape(encodeURIComponent(JSON.stringify(p)))); }
  function decode(s) { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return JSON.parse(decodeURIComponent(escape(atob(s)))); }
  function CameraStream(video, status) { this.video = video; this.status = status; this.generation = 0; }
  CameraStream.prototype.stop = function () {
    this.generation += 1; clearTimeout(this.timer);
    if (this.ws) { this.ws.onclose = null; this.ws.onerror = null; this.ws.onmessage = null; this.ws.close(); this.ws = null; }
    if (this.pc) { this.pc.ontrack = null; this.pc.onicecandidate = null; this.pc.onconnectionstatechange = null; this.pc.close(); this.pc = null; }
    this.video.pause(); this.video.srcObject = null;
  };
  CameraStream.prototype.start = function (params) {
    this.stop();
    var self = this, gen = self.generation, pending = [], answering = false;
    if (!root.RTCPeerConnection) throw new Error('This TV does not expose WebRTC playback to apps.');
    var pc = new root.RTCPeerConnection({iceServers:params.iceServers}); self.pc = pc;
    if (!pc.addTransceiver) { self.stop(); throw new Error('This TV is missing a required video capability.'); }
    pc.addTransceiver('audio', {direction:'recvonly'});
    var videoTransceiver=pc.addTransceiver('video', {direction:'recvonly'});
    if(videoTransceiver && videoTransceiver.setCodecPreferences && root.RTCRtpReceiver && root.RTCRtpReceiver.getCapabilities){
      var caps=root.RTCRtpReceiver.getCapabilities('video');
      var baseline=caps && caps.codecs.filter(function(c){return c.mimeType.toLowerCase()==='video/h264' && /profile-level-id=42[0-9a-f]{4}/i.test(c.sdpFmtpLine||'') && /packetization-mode=1/.test(c.sdpFmtpLine||'');});
      if(baseline && baseline.length){
        try{videoTransceiver.setCodecPreferences(baseline);if(root.CameraDiagnostics)root.CameraDiagnostics.report('offer-mode',{mode:'h264-baseline'});}
        catch(_){if(root.CameraDiagnostics)root.CameraDiagnostics.report('offer-mode',{mode:'default-codecs'});}
      }
    }
    var ws = new root.WebSocket(params.url); self.ws = ws;
    function current() { return gen === self.generation; }
    function fail(message) { if (current()) { self.stop(); self.status(message, true); } }
    function send(action, payload) { if (current() && ws.readyState === 1) ws.send(JSON.stringify({action:action, messagePayload:encode(payload), recipientClientId:'MASTER'})); }
    pc.onicecandidate = function (e) { if (e.candidate) send('ICE_CANDIDATE', e.candidate); };
    pc.ontrack = function (e) {
      if (!current()) return;
      if (e.streams && e.streams[0]) self.video.srcObject = e.streams[0];
      else { if (!self.video.srcObject) self.video.srcObject = new root.MediaStream(); self.video.srcObject.addTrack(e.track); }
      var play = self.video.play();
      if (play && play.catch) play.catch(function () { if (current()) self.status('Press Sound off or OK to start playback.'); });
      self.status('Connected. Waiting for video…');
    };
    pc.onconnectionstatechange = function () { if (pc.connectionState === 'failed') fail('Video connection failed. Choose Reconnect to try again.'); };
    ws.onopen = function () {
      if (!current()) return;
      self.status('Connecting camera…');
      pc.createOffer().then(function (offer) {
        if (!current()) return;
        var local={type:offer.type,sdp:root.CameraSDP?root.CameraSDP.baselineOffer(offer.sdp):offer.sdp};
        return pc.setLocalDescription(local).then(function () { send('SDP_OFFER', {type:local.type, sdp:pc.localDescription.sdp}); });
      }).catch(function (e) { if(root.CameraDiagnostics)root.CameraDiagnostics.report('failure',{stage:'local-description',code:root.CameraDiagnostics.classify(e),reason:root.CameraDiagnostics.reason(e)});fail('The TV could not create a video connection.'); });
    };
    ws.onmessage = function (e) {
      if (!current()) return;
      try {
        var env = JSON.parse(e.data), type = env.messageType || env.action;
        if (type === 'STATUS_RESPONSE') { fail('Wyze could not establish this camera session.'); return; }
        if (!env.messagePayload) return;
        var payload = decode(env.messagePayload);
        if (type === 'SDP_ANSWER' && !answering && !pc.remoteDescription && pc.signalingState === 'have-local-offer') {
          answering = true;
          if(root.CameraDiagnostics)root.CameraDiagnostics.report('answer',{offer:root.CameraDiagnostics.summary(pc.localDescription && pc.localDescription.sdp),answer:root.CameraDiagnostics.summary(payload.sdp)});
          if(root.CameraSDP){var normalized=root.CameraSDP.receiveOnlyAnswer(pc.localDescription.sdp,payload.sdp);if(normalized.changed){payload={type:payload.type,sdp:normalized.sdp};if(root.CameraDiagnostics)root.CameraDiagnostics.report('answer-mode',{mode:'receive-only'});}}
          pc.setRemoteDescription(payload).catch(function(e){
            var code=root.CameraDiagnostics?root.CameraDiagnostics.classify(e):'other';
            if(root.CameraDiagnostics)root.CameraDiagnostics.report('failure',{stage:'remote-description',code:code,name:e.name,reason:root.CameraDiagnostics.reason(e)});
            throw new Error('Connection setup failed ('+code+').');
          }).then(function () {
            if (!current()) return;
            return pending.reduce(function (p, c) { return p.then(function () { if (current()) return pc.addIceCandidate(c); }); }, Promise.resolve());
          }).then(function () { pending = []; }).catch(function (e) { fail(e.message.indexOf('Connection setup failed')===0?e.message:'Network negotiation failed.'); });
        } else if (type === 'ICE_CANDIDATE') {
          if (!pc.remoteDescription) pending.push(payload);
          else pc.addIceCandidate(payload).catch(function () { fail('Could not negotiate the camera connection.'); });
        }
      } catch (_) { fail('Wyze returned an unreadable connection message.'); }
    };
    ws.onerror = function () { fail('Could not connect to Wyze’s video service.'); };
    ws.onclose = function () { if (current() && !pc.remoteDescription) fail('Wyze closed the video connection.'); };
    self.timer = setTimeout(function () { fail('No video received. Choose Reconnect to try again.'); }, 35000);
  };
  root.CameraStream = CameraStream;
}(typeof window === 'undefined' ? globalThis : window));

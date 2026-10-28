(function () {
  'use strict';
  var api = new WyzeAPI(), screen = 'login', selected = null, busy = false, cameraRequest=0, allRequest=0;
  var sessionKey = 'camera-view-session-v1';
  function fitScreen() {
    var scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    document.body.style.width = '1920px'; document.body.style.height = '1080px';
    document.body.style.transformOrigin = '0 0'; document.body.style.transform = 'scale(' + scale + ')';
  }
  fitScreen(); window.addEventListener('resize', fitScreen);
  function el(id) { return document.getElementById(id); }
  function status(message, error) { el('status').textContent = message; el('status').className = error ? 'error' : ''; }
  var stream = new CameraStream(el('video'), status);
  var wall = new CameraWall(el('wallGrid'), api, openCamera,function(index,camera){el('wallSound').textContent='Sound: '+(camera?camera.name:'Off');},function(cameras){if(screen!=='wall'||!wall.hideUnavailable)return;if(audioOpen)closeAudioPicker();if(!cameras.length){backToCameras();status('No cameras are available right now. Try Refresh.');}else el('wallTitle').textContent='All cameras · '+cameras.length;}), cameraList = [], choosingTwo = false, chosen = [], audioOpen=false;
  function closeAudioPicker(){audioOpen=false;el('audioPicker').hidden=true;if(screen==='wall')el('wallSound').focus();}
  el('audioClose').onclick=closeAudioPicker;
  el('wallSound').onclick=function(){
    var choices=el('audioChoices');choices.textContent='';
    function add(label,index){var button=document.createElement('button');button.textContent=label;button.setAttribute('role','radio');button.setAttribute('aria-checked',String(wall.audioIndex===index));button.onclick=function(){wall.setAudio(index);closeAudioPicker();};choices.appendChild(button);}
    add('Off',null);wall.items.forEach(function(item,index){add(item.camera.name,index);});
    audioOpen=true;el('audioPicker').hidden=false;(choices.querySelector('[aria-checked="true"]')||choices.querySelector('button')).focus();
  };
  var provisioning = null;
  el('receive').onclick = function () {
    if (provisioning) return;
    el('receive').disabled = true;
    provisioning = new CameraProvisioner(function (message, error) { status(message, error); }, function (data) {
      ['email','password','keyid','apikey'].forEach(function (id) { if (data[id]) el(id).value = data[id]; });
      data = null; provisioning = null; el('receive').disabled = false;
      status('Details received securely. Select Sign in.'); el('submit').focus();
    }, function () { provisioning = null; el('receive').disabled = false; });
    provisioning.start();
  };
  function show(name) {
    screen = name;
    ['login','mfa','cameras','player','wall'].forEach(function (id) { el(id).hidden = id !== name; });
    el('signout').hidden = name === 'login' || name === 'mfa';
    document.body.classList.toggle('playing', name === 'player');document.body.classList.toggle('wallPlaying',name==='wall');
  }
  function save() {
    try { if (el('remember').checked && api.tokens) localStorage.setItem(sessionKey, JSON.stringify(api.tokens)); else localStorage.removeItem(sessionKey); }
    catch (_) { status('Signed in for this session. The TV could not save your session.'); }
  }
  function clearFields() { ['password','keyid','apikey','code'].forEach(function (id) { el(id).value = ''; }); }
  function loadCameras() {
    var request=++cameraRequest;status('Loading cameras…'); el('refresh').disabled = true;
    return api.cameras().then(function (cameras) {
      if(request!==cameraRequest||document.hidden)return null;
      save(); show('cameras');cameraList=cameras;choosingTwo=false;chosen=[];updateSelection();
      var grid = el('grid'); grid.textContent = '';
      cameras.forEach(function (camera) {
        var b = document.createElement('button'), title = document.createElement('strong'), detail = document.createElement('span');
        b.className = 'camera'; title.textContent = camera.name; detail.textContent = camera.online ? 'Open live view' : 'Check live view · reported offline';
        b.appendChild(title); b.appendChild(detail); b.onclick = function () {
          if(!choosingTwo){openCamera(camera);return;}
          var index=chosen.indexOf(camera);if(index>=0)chosen.splice(index,1);else if(chosen.length<2)chosen.push(camera);
          b.classList.toggle('selected',chosen.indexOf(camera)>=0);b.setAttribute('aria-pressed',String(chosen.indexOf(camera)>=0));updateSelection();
        }; grid.appendChild(b);
      });
      status(cameras.length ? 'Choose a camera.' : 'No cameras were returned for this account.');
      (grid.querySelector('button') || el('refresh')).focus();return cameras;
    }).catch(function (e) { if(request===cameraRequest)status(e.message, true);return null; }).then(function (cameras) { el('refresh').disabled = false;return cameras; });
  }
  function updateSelection(){
    el('two').hidden=choosingTwo;el('all').hidden=choosingTwo;el('refresh').hidden=choosingTwo;
    el('two').disabled=cameraList.length<2;el('all').disabled=cameraList.length<1;
    el('watchSelected').hidden=!choosingTwo;el('cancelSelection').hidden=!choosingTwo;el('watchSelected').disabled=chosen.length!==2;
    if(choosingTwo)status('Choose two cameras ('+chosen.length+'/2), then Watch selected.');
  }
  el('two').onclick=function(){choosingTwo=true;chosen=[];updateSelection();var b=el('grid').querySelector('button');if(b)b.focus();};
  function resetSelection(){choosingTwo=false;chosen=[];Array.prototype.forEach.call(el('grid').querySelectorAll('button'),function(b){b.classList.remove('selected');b.removeAttribute('aria-pressed');});updateSelection();}
  el('cancelSelection').onclick=function(){resetSelection();status('Choose a camera.');el('two').focus();};
  function openWall(cameras,options){stream.stop();selected=null;resetSelection();show('wall');el('wallTitle').textContent=cameras.length===2?'Two cameras':'All cameras · '+cameras.length;status('');wall.start(cameras,options);el('wallBack').focus();}
  el('all').onclick=function(){var request=++allRequest;el('all').disabled=true;loadCameras().then(function(cameras){if(request!==allRequest||document.hidden||screen!=='cameras')return;if(!cameras)return;var available=cameras.filter(function(c){return c.online===true;});if(!available.length){status('No cameras are available right now. Try Refresh.');return;}openWall(available,{hideUnavailable:true});}).then(function(){if(request===allRequest)updateSelection();});};el('watchSelected').onclick=function(){if(chosen.length===2)openWall(chosen.slice());};el('wallBack').onclick=backToCameras;
  function authResult(result) {
    if (result.complete) { clearFields(); busy = false; el('submit').disabled = false; return loadCameras(); }
    if (result.mfa) { show('mfa'); status('Verification required.'); el('mfahelp').textContent = result.mfa; el('code').value = ''; el('code').focus(); }
  }
  el('authform').onsubmit = function (e) {
    e.preventDefault(); if (busy) return;
    if (!el('email').value || !el('password').value || !el('keyid').value.trim() || !el('apikey').value.trim()) { status('Enter your email, password, API ID and API key.', true); return; }
    busy = true; el('submit').disabled = true; status('Signing in…');
    api.login(el('email').value, el('password').value, el('keyid').value, el('apikey').value).then(authResult).catch(function (err) { status(err.message, true); }).then(function () { busy = false; el('submit').disabled = false; });
  };
  el('mfaform').onsubmit = function (e) {
    e.preventDefault(); if (busy) return; busy = true; status('Verifying…');
    api.verify(el('code').value).then(authResult).catch(function (err) { status(err.message, true); }).then(function () { busy = false; });
  };
  function cancelMFA() { api.clear(); clearFields(); show('login'); status('Sign-in cancelled.'); el('email').focus(); }
  el('cancelmfa').onclick = cancelMFA;
  function openCamera(camera) {
    if (busy) return; busy = true;closeAudioPicker(); wall.stop();selected = camera; stream.stop();
    show('player'); el('cameraTitle').textContent = camera.name; el('video').muted = true; el('audio').textContent = 'Sound off'; el('back').focus(); status('Requesting live view…');
    api.stream(camera).then(function (params) { save(); if (screen === 'player' && selected === camera) stream.start(params); }).catch(function (e) { if (screen === 'player') status(e.message, true); }).then(function () { busy = false; });
  }
  function backToCameras() { allRequest++;closeAudioPicker();stream.stop();wall.stop(); selected = null; show('cameras');updateSelection(); if(!choosingTwo)status('Choose a camera.'); (el('grid').querySelector('button') || el('refresh')).focus(); }
  el('back').onclick = backToCameras;
  el('retry').onclick = function () { if (selected) openCamera(selected); };
  el('refresh').onclick = loadCameras;
  el('audio').onclick = function () { var v = el('video'); v.muted = !v.muted; el('audio').textContent = v.muted ? 'Sound off' : 'Sound on'; var p = v.play(); if (p && p.catch) p.catch(function () { status('The TV could not play this stream.', true); }); };
  el('video').onplaying = function () { clearTimeout(stream.timer); if (screen === 'player'&&el('video').videoWidth>0) status('Live'); };
  el('video').onerror = function () { if (screen === 'player') { stream.stop(); status('The TV could not decode this camera’s video.', true); } };
  el('signout').onclick = function () { stream.stop();wall.stop(); api.clear(); clearFields(); try { localStorage.removeItem(sessionKey); } catch (_) {} show('login'); status('Signed out.'); el('email').focus(); };
  document.addEventListener('visibilitychange', function () { if(document.hidden){cameraRequest++;allRequest++;if(screen==='player'||screen==='wall')backToCameras();}else if(screen==='cameras')loadCameras(); });
  window.addEventListener('pagehide', function () { stream.stop();wall.stop(); if (provisioning) provisioning.stop(); api.pending = null; clearFields(); });
  // Spatial navigation keeps D-pad movement predictable; native TV IME owns
  // left/right while editing and Enter is left to the input/IME or form.
  document.addEventListener('keydown', function (e) {
    var code = e.keyCode, active = document.activeElement;
    if (code === 10009 || code === 27) {
      if(audioOpen){e.preventDefault();closeAudioPicker();}
      else if (screen === 'player'||screen==='wall') { e.preventDefault(); backToCameras(); }
      else if(screen==='cameras'&&choosingTwo){e.preventDefault();el('cancelSelection').click();}
      else if (screen === 'mfa') { e.preventDefault(); cancelMFA(); }
      else if (window.tizen) { e.preventDefault(); tizen.application.getCurrentApplication().exit(); }
      return;
    }
    if ([37,38,39,40].indexOf(code) < 0) return;
    if (active && active.tagName === 'INPUT' && active.type !== 'checkbox' && (code === 37 || code === 39)) return;
    var scope = audioOpen ? el('audioPicker') : screen === 'wall' || screen === 'player' ? el(screen) : document;
    var nodes = Array.prototype.filter.call(scope.querySelectorAll('button,input'), function (n) { return !n.disabled && n.getClientRects().length > 0; });
    var r = active && active.getBoundingClientRect(), best = null, score = Infinity;
    if (!r) { if (nodes[0]) nodes[0].focus(); return; }
    nodes.forEach(function (n) {
      if (n === active) return;
      var a = n.getBoundingClientRect(), dx = (a.left+a.right-r.left-r.right)/2, dy = (a.top+a.bottom-r.top-r.bottom)/2;
      var forward = code === 37 ? -dx : code === 39 ? dx : code === 38 ? -dy : dy;
      var side = code === 37 || code === 39 ? Math.abs(dy) : Math.abs(dx);
      var s = forward + side * 3;
      if (forward > 8 && s < score) { best = n; score = s; }
    });
    if (best) { e.preventDefault(); best.focus(); best.scrollIntoView({block:'nearest'}); }
  });
  show('login'); el('email').focus();
  if (!window.RTCPeerConnection) status('This TV is missing WebRTC. Live camera playback may not be available.', true);
  try {
    var saved = JSON.parse(localStorage.getItem(sessionKey) || 'null');
    if (saved && typeof saved.access_token === 'string' && typeof saved.refresh_token === 'string') { api.tokens = saved; loadCameras(); }
  } catch (_) { localStorage.removeItem(sessionKey); }
}());

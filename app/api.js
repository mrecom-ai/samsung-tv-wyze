/* API shapes/signing adapted from jfarmer08/wyze-api (MIT), see vendor notices.
 * Login and refresh follow Wyze's published developer API. No credential logging.
 */
(function (root) {
  'use strict';
  var AUTH = 'https://auth-prod.api.wyze.com', API = 'https://api.wyzecam.com';
  function post(url, payload, headers) {
    return new Promise(function (resolve, reject) {
      var x = new XMLHttpRequest();
      x.open('POST', url, true); x.timeout = 25000;
      x.setRequestHeader('Content-Type', 'application/json');
      Object.keys(headers || {}).forEach(function (k) { x.setRequestHeader(k, headers[k]); });
      x.onerror = function () { reject(new Error('Cannot reach Wyze. Check the TV connection or app network permissions.')); };
      x.ontimeout = function () { reject(new Error('Wyze took too long to respond. Please try again.')); };
      x.onload = function () {
        if (x.status === 429) { reject(new Error('Wyze request limit reached. Wait ten minutes before trying again.')); return; }
        if (x.status < 200 || x.status >= 300) { reject(new Error('Wyze request failed (HTTP ' + x.status + ').')); return; }
        var d;
        try { d = JSON.parse(x.responseText); } catch (_) { reject(new Error('Wyze returned an unreadable response.')); return; }
        if (d.errorCode || (d.code !== undefined && ['0', '1'].indexOf(String(d.code)) < 0)) {
          // Only show numeric codes; raw responses can contain account/session data.
          var code = String(d.errorCode || d.code);
          reject(new Error('Wyze rejected the request (code ' + code.replace(/[^0-9-]/g, '') + '). Check sign-in details or camera availability.')); return;
        }
        resolve(d);
      };
      x.send(typeof payload === 'string' ? payload : JSON.stringify(payload));
    });
  }
  function md5(s) { return root.CryptoJS.MD5(s).toString(); }
  function base() { return {app_ver:'wyze_developer_api', app_version:'wyze_developer_api', phone_id:'wyze_developer_api', sc:'wyze_developer_api', sv:'wyze_developer_api', ts:Date.now()}; }
  function WyzeAPI() { this.tokens = null; this.pending = null; }
  WyzeAPI.prototype.login = function (email, password, keyid, apikey) {
    this.pending = {email:email.trim(), password:md5(md5(md5(password))), keyid:keyid.trim(), apikey:apikey.trim()};
    return this._login();
  };
  WyzeAPI.prototype._login = function (extra) {
    var self = this, p = this.pending;
    if (!p) return Promise.reject(new Error('Please sign in again.'));
    var body = {email:p.email, password:p.password};
    Object.keys(extra || {}).forEach(function (k) { body[k] = extra[k]; });
    return post(AUTH + '/api/user/login', body, {Keyid:p.keyid, Apikey:p.apikey}).then(function (d) {
      if (d.access_token && d.refresh_token) {
        self.tokens = {access_token:d.access_token, refresh_token:d.refresh_token, obtained:Date.now()}; self.pending = null;
        return {complete:true};
      }
      if (d.mfa_options && d.mfa_options.indexOf('TotpVerificationCode') >= 0) {
        var apps = d.mfa_details && d.mfa_details.totp_apps;
        if (!apps || !apps[0]) throw new Error('Wyze did not return the verification method.');
        p.mfa_type = 'TotpVerificationCode'; p.verification_id = apps[0].app_id;
        return {mfa:'Enter the code from your authenticator app.'};
      }
      if (d.sms_session_id && d.user_id) {
        var query = '?mfaPhoneType=Primary&sessionId=' + encodeURIComponent(d.sms_session_id) + '&userId=' + encodeURIComponent(d.user_id);
        return post(AUTH + '/user/login/sendSmsCode' + query, {}, {Keyid:p.keyid, Apikey:p.apikey}).then(function (r) {
          if (!r.session_id) throw new Error('Wyze could not send a verification code.');
          p.mfa_type = 'PrimaryPhone'; p.verification_id = r.session_id;
          return {mfa:'Enter the code Wyze sent to your phone.'};
        });
      }
      throw new Error('Wyze requires a verification method this preview does not support.');
    });
  };
  WyzeAPI.prototype.verify = function (code) {
    var p = this.pending;
    if (!p || !p.verification_id) return Promise.reject(new Error('Please start sign-in again.'));
    return this._login({mfa_type:p.mfa_type, verification_id:p.verification_id, verification_code:code.trim()});
  };
  WyzeAPI.prototype.refresh = function () {
    var self = this, p = base();
    if (!self.tokens) return Promise.reject(new Error('Please sign in first.'));
    p.refresh_token = self.tokens.refresh_token;
    return post(API + '/app/user/refresh_token', p).then(function (d) {
      if (!d.data || !d.data.access_token || !d.data.refresh_token) throw new Error('Your session expired. Please sign out and sign in again.');
      self.tokens = {access_token:d.data.access_token, refresh_token:d.data.refresh_token, obtained:Date.now()};
      return self.tokens;
    });
  };
  WyzeAPI.prototype.ready = function () {
    if (!this.tokens) return Promise.reject(new Error('Please sign in first.'));
    return Date.now() - this.tokens.obtained > 86400000 ? this.refresh() : Promise.resolve(this.tokens);
  };
  WyzeAPI.prototype.cameras = function () {
    return this.ready().then(function (tokens) {
      var p = base(); p.access_token = tokens.access_token;
      return post(API + '/app/v2/home_page/get_object_list', p);
    }).then(function (d) {
      if (!d.data || !Array.isArray(d.data.device_list)) throw new Error('Wyze did not return a camera list.');
      return d.data.device_list.filter(function (c) { return c.product_type === 'Camera'; }).map(function (c) {
        return {mac:c.mac, model:c.product_model, name:c.nickname || 'Camera', online:Number(c.conn_state) === 1};
      });
    });
  };
  WyzeAPI.prototype.stream = function (camera) {
    return this.ready().then(function (tokens) {
      var body = JSON.stringify({device_list:[{device_id:camera.mac, device_model:camera.model, provider:'webrtc', parameters:{use_trickle:true}}], nonce:String(Date.now())});
      var secret = md5(tokens.access_token + 'gbJojEBViLklgwyyDikx5ztSvKBXI5oU');
      var signature = root.CryptoJS.HmacMD5(body, secret).toString();
      return post('https://app.wyzecam.com/app/v4/camera/get-streams', body, {
        appId:'strv_e7f78e9e7738dc50', appInfo:'wyze_web_2.3.1', access_token:tokens.access_token,
        Authorization:tokens.access_token, signature2:signature, requestid:String(Date.now() % 100000)
      });
    }).then(function (d) {
      var entry = d.data && d.data[0], p = entry && entry.params;
      if (!p || !p.signaling_url) throw new Error('This camera did not provide a live stream. Check its subscription and online status.');
      var url = p.signaling_url;
      if (url.indexOf('%25') >= 0) url = decodeURIComponent(url);
      // Do not modify AWS-signed query parameters.
      if (!/^wss:\/\/[^/]+\.(amazonaws\.com|wyzecam\.com)(\/|\?)/i.test(url)) throw new Error('Wyze returned an unexpected stream server.');
      return {url:url, iceServers:(p.ice_servers || []).filter(function (s) { return s.urls || s.url; }).map(function (s) {
        var r = {urls:s.urls || s.url}; if (s.username) r.username = s.username; if (s.credential) r.credential = s.credential; return r;
      })};
    });
  };
  WyzeAPI.prototype.clear = function () { this.tokens = null; this.pending = null; };
  root.WyzeAPI = WyzeAPI;
}(typeof window === 'undefined' ? globalThis : window));

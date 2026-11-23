/* Optional TV-local API keys. Kept separate from the signed-in session so
 * signing out removes session tokens without discarding the user's API pair.
 * Account passwords and verification codes are never written by this store.
 */
(function(root){
  'use strict';
  var key='camera-view-api-keys-v1';
  function valid(data){return data&&typeof data.keyid==='string'&&typeof data.apikey==='string'&&data.keyid.trim()&&data.apikey.trim()&&data.keyid.length<=256&&data.apikey.length<=4096;}
  function CameraKeyStore(storage){this.storage=storage;}
  CameraKeyStore.prototype.read=function(){
    try{var data=JSON.parse((this.storage||root.localStorage).getItem(key)||'null');return valid(data)?{keyid:data.keyid.trim(),apikey:data.apikey.trim()}:null;}catch(_){return null;}
  };
  CameraKeyStore.prototype.save=function(data){
    if(!valid(data))return false;
    try{(this.storage||root.localStorage).setItem(key,JSON.stringify({keyid:data.keyid.trim(),apikey:data.apikey.trim()}));return true;}catch(_){return false;}
  };
  CameraKeyStore.prototype.forget=function(){try{(this.storage||root.localStorage).removeItem(key);return true;}catch(_){return false;}};
  root.CameraKeyStore=CameraKeyStore;
}(typeof window==='undefined'?globalThis:window));

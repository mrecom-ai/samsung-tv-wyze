'use strict';
document.getElementById('setup').onsubmit=async function(e){
  e.preventDefault();const form=this,button=document.getElementById('send'),status=document.getElementById('status');button.disabled=true;
  const data={};['keyid','apikey','email','password'].forEach(k=>data[k]=document.getElementById(k).value);
  try{
    const r=await fetch('/setup',{method:'POST',headers:{'Content-Type':'application/json','X-Setup-Token':document.getElementById('formToken').value},body:JSON.stringify(data)});
    if(!r.ok)throw Error();
    ['keyid','apikey','email','password'].forEach(k=>document.getElementById(k).value='');Object.keys(data).forEach(k=>data[k]='');form.hidden=true;
    status.textContent='Encrypted details are ready. Select Receive from Mac on the TV.';
    const timer=setInterval(async()=>{try{const s=await(await fetch('/status')).json();if(s.received){clearInterval(timer);status.textContent='Received by the TV. Select Sign in there. You can close this page.';}}catch(_){clearInterval(timer);}},1500);
  }catch(_){status.textContent='Could not send. The setup session may have expired; ask to restart it.';button.disabled=false;}
};

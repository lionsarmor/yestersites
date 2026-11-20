(() => {
  'use strict';
  const bar=document.querySelector('[data-member-nav]');
  if(!bar)return;
  const home='https://yestersites.com',editor='https://retropage.yestersites.com';
  const service='https://yestersites-webring.jamesmweeksjr.chatgpt.site';
  const signin=bar.querySelector('[data-signin]'),join=bar.querySelector('[data-join]'),account=bar.querySelector('[data-account]');
  const canonical=new URL(location.href);canonical.hash='';
  const connect='/api/member-badge/connect?to='+encodeURIComponent(canonical.href);
  const onProduct=[home,editor].includes(location.origin);
  if(onProduct){
    signin.href=service+'/signin/?returnTo='+encodeURIComponent(connect);
    join.href=service+'/signup/?returnTo='+encodeURIComponent(connect);
  }
  function render(handle){
    account.hidden=!handle;signin.hidden=join.hidden=!!handle;
    if(handle){account.querySelector('[data-handle]').textContent=handle;account.querySelector('summary').setAttribute('aria-label',handle+' account menu');}
    else account.open=false;
  }
  document.addEventListener('click',e=>{if(!account.contains(e.target))account.open=false;});
  document.addEventListener('keydown',e=>{if(e.key==='Escape' && account.open){account.open=false;account.querySelector('summary').focus();}});
  if(location.origin===service){
    const check=()=>fetch('/api/member-badge/me',{cache:'no-store'}).then(r=>r.json()).then(v=>render(v.handle)).catch(()=>{});
    check();window.addEventListener('pageshow',check);window.addEventListener('focus',check);return;
  }
  if(!onProduct)return;
  const frame=document.createElement('iframe');frame.hidden=true;frame.style.display='none';frame.title='Member status';frame.src=home+'/account/bridge.html';
  const check=()=>frame.contentWindow?.postMessage('ys-member-check',home);
  let canRestoreSession=window===top && !location.hash && navigator.onLine;
  // Never interrupt someone who has already started using the editor or the browser.
  for(const type of ['pointerdown','keydown'])document.addEventListener(type,()=>{canRestoreSession=false;},{once:true,capture:true});
  const initial=performance.now();
  window.addEventListener('message',e=>{
    if(e.origin!==home||e.source!==frame.contentWindow||e.data?.type!=='ys-member-state')return;
    if(e.data.unavailable)return;
    render(e.data.handle);
    if(e.data.known || !canRestoreSession || performance.now()-initial>4000)return;
    canRestoreSession=false;
    try{
      if(sessionStorage.getItem('ys-member-checked'))return;
      sessionStorage.setItem('ys-member-checked','1');
    }catch{return;}
    // Ring Surfer may have selected its first page while the bridge was opening.
    const current=new URL(location.href);current.hash='';
    location.replace(service+'/api/member-badge/connect?to='+encodeURIComponent(current.href));
  });
  frame.onload=check;document.body.append(frame);
  window.addEventListener('pageshow',check);window.addEventListener('focus',check);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)check();});
})();

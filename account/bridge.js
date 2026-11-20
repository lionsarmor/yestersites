(() => {
  'use strict';
  const home='https://yestersites.com', editor='https://retropage.yestersites.com';
  const service='https://yestersites-webring.jamesmweeksjr.chatgpt.site';
  const key='yestersites.member-badge.v1';
  const targetPath=/^\/(?:(?:browse|crawler|retropage|desktop(?:\/(?:8bit|windows31))?)\/)?(?:index\.html)?$|^\/text\.html$/;
  if(location.pathname==='/account/connected/'){
    const params=new URLSearchParams(location.hash.slice(1));
    history.replaceState(null,'',location.pathname);
    if(window!==top || document.referrer!==service+'/')return;
    const badge=params.get('badge');
    if(badge!=='' && !/^[a-f0-9]{64}$/.test(badge||''))return;
    try{localStorage.setItem(key,JSON.stringify({badge,checked:Date.now()}));}catch{}
    let url;
    try{url=new URL(params.get('next'));}catch{return;}
    if(url.username||url.password||url.hash)return;
    if(url.origin===home && targetPath.test(url.pathname) ||
       url.origin===editor && /^\/(?:index\.html)?$/.test(url.pathname) ||
       url.origin===service && /^\/(?:account|signin|studio|desktop\/publish)\//.test(url.pathname)) location.replace(url.href);
    return;
  }
  if(window===parent)return;
  let receiver, sequence=0;
  async function report(){
    const seq=++sequence;
    let entry,handle=null,known=true,unavailable=false;
    try{
      entry=JSON.parse(localStorage.getItem(key));
      if(entry?.badge){
        const res=await fetch(service+'/api/member-badge/status',{method:'POST',credentials:'omit',body:entry.badge,cache:'no-store'});
        if(!res.ok)throw Error();
        handle=(await res.json()).handle;
        if(!handle && JSON.parse(localStorage.getItem(key))?.badge===entry.badge)localStorage.setItem(key,JSON.stringify({badge:'',checked:Date.now()}));
      }else known=!!entry && Date.now()-entry.checked<86400000;
    }catch{unavailable=true;}
    if(seq===sequence && receiver)parent.postMessage({type:'ys-member-state',handle,known,unavailable},receiver);
  }
  window.addEventListener('message',e=>{
    if(e.source!==parent || ![home,editor].includes(e.origin) || e.data!=='ys-member-check')return;
    receiver=e.origin;report();
  });
  window.addEventListener('storage',e=>{if(receiver && (e.key===key||e.key===null))report();});
})();

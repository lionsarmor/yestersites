(() => {
  const domain=/^([a-z0-9-]{1,40})\.yestersites\.com$/.exec(location.hostname);
  if(location.hostname!=='yestersites.com' && !domain)return;
  const slug=domain?domain[1]:location.pathname.split('/')[2];
  if(!slug)return;
  const origin='https://yestersites-webring.jamesmweeksjr.chatgpt.site';
  const today=new Date().toISOString().slice(0,10),key='ys.visit.'+slug;
  let count=false;
  try{count=sessionStorage.getItem(key)!==today;}catch{}
  fetch(origin+'/api/originals/'+slug,{method:count?'POST':'GET',credentials:'omit'}).then(async res=>{
    if(!res.ok)return;
    const state=await res.json();
    if(state.original===false){location.replace(domain?location.href:origin+location.pathname+location.search+location.hash);return;}
    if(!domain && state.subdomains){location.replace('https://'+slug+'.yestersites.com/'+location.pathname.split('/').slice(3).join('/')+location.search+location.hash);return;}
    if(count)try{sessionStorage.setItem(key,today);}catch{}
  }).catch(()=>{});
})();

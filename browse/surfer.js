(() => {
  'use strict';
  const $=id=>document.getElementById(id), host='https://yestersites-webring.jamesmweeksjr.chatgpt.site';
  const catalog=new Map(), localRows=window.GrubMembers;
  const tracks={nightshift:'station-id.wav',modem:'art/hold-music.wav',orbit:'horn.wav'};
  for (const row of localRows) {
    const base=new URL('../'+row.slug+'/',location.href).href;
    catalog.set(base,{base,title:row.title,sound:tracks[row.slug]?base+tracks[row.slug]:''});
  }
  let visits=[],index=-1,bag=[],frame=null,loading=false,stopped=false,currentSound='',soundEnabled=false;
  const msg=t=>{$('status').textContent=t;};
  function read(key,otherwise){try{return JSON.parse(localStorage.getItem(key))??otherwise;}catch{return otherwise;}}
  function store(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}}
  let saved=read('ring-surfer.bookmarks',[]);
  if(!Array.isArray(saved))saved=[];
  const current=()=>visits[index];
  function clean(raw){
    try {
      const u=new URL(raw,location.origin);u.searchParams.delete('surfer');
      if(u.username || u.password || !['https:','http:'].includes(u.protocol))return null;
      if (![...catalog.keys()].some(base=>u.href.startsWith(base)) && !(u.origin===host && /^\/members\/[a-z0-9-]+\//.test(u.pathname)))return null;
      return u.href;
    }catch{return null;}
  }
  function site(url){return [...catalog.values()].find(r=>url?.startsWith(r.base));}
  function setBar(show){$('bar').hidden=!show;$('restore').hidden=show;$('hide').setAttribute('aria-expanded',String(show));$('hide').textContent=show?'Hide bar':'Show bar';}
  function update(){
    const url=current(), row=site(url),marked=saved.some(b=>b.url===url);
    $('address').value=url||'';$('caption').textContent=row?.title||'Member site';$('prev').disabled=index<1;
    $('mark').textContent=marked?'★ Saved':'☆ Bookmark';$('mark').setAttribute('aria-pressed',String(marked));
    $('stop').textContent=loading?'Stop':'Reload';
    $('sound').textContent=soundEnabled?'Mute':'Sound on';$('sound').setAttribute('aria-pressed',String(soundEnabled));
    history.replaceState(null,'',location.pathname+'?url='+encodeURIComponent(url));
  }
  const radio=$('radio');
  function silence(){radio.pause();radio.removeAttribute('src');radio.load();}
  function play(){
    if(!soundEnabled || !currentSound) return;
    if(radio.getAttribute('src')!==currentSound)radio.src=currentSound;
    const requested=currentSound;
    radio.play().catch(error=>{
      if(requested!==currentSound || !soundEnabled || error.name==='AbortError')return;
      if(error.name==='NotAllowedError'){soundEnabled=false;update();msg('Tap Sound on to play this soundtrack.');}
      else msg('This soundtrack is unavailable.');
    });
  }
  function track(value){
    if(value===currentSound)return;
    silence();currentSound=value;play();
  }
  function swipe(doc){
    let start;
    doc.addEventListener('touchstart',e=>{
      start=!e.target.closest?.('input,textarea,select,audio,video,[contenteditable=true]') && e.touches.length===1?[e.touches[0].clientX,e.touches[0].clientY]:null;
    },{passive:true});
    doc.addEventListener('touchcancel',()=>{start=null;});
    doc.addEventListener('touchend',e=>{
      if(!start)return;
      const dx=e.changedTouches[0].clientX-start[0], dy=e.changedTouches[0].clientY-start[1];start=null;
      if(Math.abs(dx)>70 && Math.abs(dx)>Math.abs(dy)*2)dx<0?forward():back();
    },{passive:true});
  }
  function push(url){if(current()===url)return;visits=visits.slice(0,index+1);visits.push(url);index++;}
  function navigate(raw){
    const url=clean(raw);
    if(!url)return false;
    push(url);load();return true;
  }
  function frameSound(){
    if(!frame)return;
    if(current()?.startsWith(host+'/')){
      frame.contentWindow?.postMessage({surfer:'sound',enabled:soundEnabled},host);
      return;
    }
    const doc=frame.contentDocument;
    if(!doc)return;
    for(const player of doc.querySelectorAll('audio,video')){
      player.muted=!soundEnabled;
      if(soundEnabled && player.autoplay)player.play().catch(()=>{});
    }
    if(!soundEnabled)for(const embed of doc.querySelectorAll('.retro-player iframe')){
      if(embed.dataset.played==='yes')embed.src=embed.src;
      embed.dataset.played='';
    }
  }
  function load(){
    const url=current();
    track('');stopped=false;loading=true;
    const next=document.createElement('iframe'),u=new URL(url);
    next.title=site(url)?.title||'Member site';
    next.setAttribute('sandbox','allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox');
    next.setAttribute('allow','autoplay; fullscreen; picture-in-picture');
    const hosted=u.origin===host;
    if(hosted)u.searchParams.set('surfer','1');
    frame=next;update();msg('Opening '+next.title+'…');
    next.onload=()=>{
      if(next!==frame || stopped)return;
      loading=false;update();msg('Ready');
      if(hosted)return;
      try {
        const doc=next.contentDocument, real=clean(next.contentWindow.location.href);
        if(!doc || !real)return;
        push(real);update();swipe(doc);frameSound();
        next.contentWindow.addEventListener('blur',()=>{const el=doc.activeElement;if(el?.matches('.retro-player iframe'))el.dataset.played='yes';});
        const row=site(real);
        track(row?.sound||'');
        doc.addEventListener('click',e=>{
          const a=e.target.closest?.('a[href]');
          if(!a || e.button!==0 || e.metaKey || e.ctrlKey || a.hasAttribute('download'))return;
          const target=new URL(a.href);
          if(!['http:','https:'].includes(target.protocol))return;
          if(/\.(wav|mp3|ogg)$/i.test(target.pathname)){
            e.preventDefault();soundEnabled=true;track(target.href);play();update();return;
          }
          if(clean(target.href) && /(?:\/|\.html?)$/i.test(target.pathname)){
            e.preventDefault();navigate(target.href);
          }else {a.target='_blank';a.rel='noopener';}
        });
        let anchorY=0;
        doc.addEventListener('scroll',()=>{const y=next.contentWindow.scrollY;if(innerWidth<640 && y>anchorY+70){setBar(false);anchorY=y;}else if(y<anchorY-50){setBar(true);anchorY=y;}},{passive:true});
      } catch {msg('Use Next to continue browsing.');}
    };
    next.src=u.href;$('view').replaceChildren(next);
    if(!hosted)track(site(url)?.sound||'');
  }
  function another(){
    const row=site(current());
    if(!bag.length) {
      bag=[...catalog.keys()].filter(url=>url!==row?.base);
      for(let i=bag.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]];}
    }
    return bag.pop();
  }
  function forward(){if(index<visits.length-1){index++;load();}else navigate(another());}
  function back(){if(index>0){index--;load();}}
  window.addEventListener('message',e=>{
    if(e.origin!==host || e.source!==frame?.contentWindow || !e.data || !current()?.startsWith(host+'/'))return;
    const d=e.data;
    if(d.surfer==='swipe'){d.forward?forward():back();return;}
    const url=clean(d.url);
    if(!url || !url.startsWith(host+'/members/'))return;
    if(d.surfer==='link')navigate(url);
    if(d.surfer==='ready'){push(url);frameSound();track(typeof d.sound==='string' && /^https:\/\//.test(d.sound)?d.sound:'');update();}
  });
  $('next').onclick=forward;$('prev').onclick=back;
  $('stop').onclick=()=>{
    if(!loading)return load();
    stopped=true;frame=null;$('view').replaceChildren(Object.assign(document.createElement('p'),{textContent:'Loading stopped.'}));
    track('');loading=false;update();msg('Stopped. Select Reload to try again.');
  };
  $('hide').onclick=()=>setBar($('bar').hidden);$('restore').onclick=()=>setBar(true);
  $('address-form').onsubmit=e=>{
    e.preventDefault();const v=$('address').value.trim(), row=[...catalog.values()].find(x=>x.title.toLowerCase()===v.toLowerCase()||new URL(x.base).pathname.split('/').filter(Boolean).at(-1)===v);
    if(row || !v.includes(':') && !v.startsWith('/')) {
      if(row)return navigate(row.base);
    }
    const candidate=/^[\w.-]+\.[a-z]{2,}(?:\/|$)/i.test(v)?'https://'+v:v;
    if(!navigate(candidate)){msg('Enter a YesterSites URL or a listed site name.');$('address').select();}
  };
  $('sound').onclick=()=>{
    soundEnabled=!soundEnabled;update();frameSound();
    if(!soundEnabled){radio.pause();msg('Sound muted.');}
    else{play();msg(currentSound?'Sound on.':'Sound enabled. This site is silent.');}
  };
  const shelf=$('shelf');
  function showSaved(){
    $('saved-list').replaceChildren();$('empty').hidden=!!saved.length;
    for(const entry of saved){
      const li=document.createElement('li'),go=document.createElement('button'),remove=document.createElement('button');
      go.textContent=entry.title;go.onclick=()=>{shelf.close();navigate(entry.url);};
      remove.textContent='Remove';remove.onclick=()=>{saved=saved.filter(b=>b!==entry);store('ring-surfer.bookmarks',saved);showSaved();update();};
      li.append(go,remove);$('saved-list').append(li);
    }
  }
  $('mark').onclick=()=>{
    const url=current();
    if(saved.some(b=>b.url===url))saved=saved.filter(b=>b.url!==url);
    else saved.push({url,title:(site(url)?.title || 'Member site')+' · '+new URL(url).pathname.split('/').filter(Boolean).at(-1)});
    if(!store('ring-surfer.bookmarks',saved))msg('Bookmarks only available during this visit.');
    update();
  };
  $('bookmarks').onclick=()=>{showSaved();shelf.showModal();};
  $('share').onclick=async()=>{
    const url=location.href;
    try{if(navigator.share)return await navigator.share({url,title:site(current())?.title||'Ring Surfer'});
      await navigator.clipboard.writeText(url);msg('Page link copied.');}
    catch(error){if(error.name==='AbortError')return;$('share-url').value=url;$('share-box').showModal();$('share-url').select();}
  };
  swipe($('bar'));window.addEventListener('pagehide',()=>radio.pause());
  window.addEventListener('keydown',e=>{if(e.target.matches('input,textarea')||document.querySelector('dialog[open]'))return;
    if(e.key==='ArrowRight')forward();else if(e.key==='ArrowLeft')back();});
  navigate(clean(new URLSearchParams(location.search).get('url')||'')||another());
  (async()=>{
    let cursor;
    do {
      const u=new URL('/api/directory',host);if(cursor)u.searchParams.set('cursor',cursor);
      const response=await fetch(u,{credentials:'omit'});if(!response.ok)return;
      const data=await response.json();
      for(const m of data.sites){if(!/^[a-z0-9-]{1,40}$/.test(m.slug))continue;
        const base=host+'/members/'+m.slug+'/';catalog.set(base,{base,title:m.title,sound:''});}
      cursor=data.nextCursor;
    }while(cursor);
    update();
  })().catch(()=>{});
})();

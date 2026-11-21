(() => {
  'use strict';
  const $=id=>document.getElementById(id), host='https://yestersites-webring.jamesmweeksjr.chatgpt.site';
  const catalog=new Map(), localRows=window.GrubMembers;
  const tracks={nightshift:'station-id.wav',modem:'art/hold-music.wav',orbit:'horn.wav'};
  for (const row of localRows) {
    const base=host+'/members/'+row.slug+'/';
    catalog.set(base,{base,title:row.title,sound:tracks[row.slug]?base+tracks[row.slug]:''});
  }
  const playableMode=new URLSearchParams(location.search).get('mode')==='playable';
  const pool = document.getElementById('discover-pool');
  pool.value = playableMode ? 'playable' : 'all';
  pool.addEventListener('change', () => {
    location.assign(pool.value === 'playable' ? '?mode=playable' : location.pathname);
  });
  const playableSites=new Set();
  const prefs=window.YesterPreferences;
  let manualMute=prefs.quiet;
  let visits=[],index=-1,bag=[],frame=null,loading=false,stopped=false,currentSound='',soundEnabled=false;
  const read=window.readYesterSetting;
  let recent=read('yester.travel-log',[]);
  recent=Array.isArray(recent)?recent.filter(entry=>entry && typeof entry.title==='string' && clean(entry.url)).slice(0,40):[];
  const msg=t=>{$('status').textContent=t;};
  function store(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}}
  let saved=read('yester.bookmarks',[]);
  if(!Array.isArray(saved))saved=[];
  saved=saved.filter(entry=>entry && typeof entry.title==='string' && clean(entry.url));
  const current=()=>visits[index];
  function clean(raw){
    try {
      const u=new URL(raw,location.origin);
      const sub=/^([a-z0-9-]{1,40})\.yestersites\.com$/.exec(u.hostname);
      if(sub && u.protocol==='https:' && !u.username && !u.password && !u.port && !['www','android','retropage','mail','smtp','pop','imap','ftp','api','admin','accounts','studio','assets','ns1','ns2'].includes(sub[1])){
        return clean('/members/'+sub[1]+u.pathname+u.search+u.hash);
      }
      u.searchParams.delete('surfer');
      if(u.origin===location.origin && localRows.some(r=>u.pathname.startsWith('/'+r.slug+'/')))u.pathname='/members'+u.pathname;
      if(u.origin===location.origin && /^\/members\/[a-z0-9-]+\//.test(u.pathname))return new URL(u.pathname+u.search+u.hash,host).href;
      if(u.username || u.password || !['https:','http:'].includes(u.protocol))return null;
      if (![...catalog.keys()].some(base=>u.href.startsWith(base)) && !(u.origin===host && /^\/members\/[a-z0-9-]+\//.test(u.pathname)))return null;
      return u.href;
    }catch{return null;}
  }
  function publicLink(url){
    if(!url)return '';
    const u=new URL(url),match=/^\/members\/([a-z0-9-]+)\/(.*)$/.exec(u.pathname);
    return match?'https://'+match[1]+'.yestersites.com/'+match[2]+u.search+u.hash:url;
  }
  function site(url){return [...catalog.values()].find(r=>url?.startsWith(r.base));}
  function tool(id,icon,label,title){
    const el=$(id);
    el.querySelector('.glyph').className='glyph g-'+icon;
    el.querySelector('span').textContent=label;
    el.title=title;el.setAttribute('aria-label',title);
  }
  function setBar(show){$('bar').hidden=!show;$('restore').hidden=show;$('hide').setAttribute('aria-expanded',String(show));if(!show && $('bar').contains(document.activeElement))$('restore').focus();}
  let idleTimer, idleHidden=false;
  function activity(event){
    clearTimeout(idleTimer);
    if(event?.target?.closest?.("#page-grip"))return;
    if(idleHidden){idleHidden=false;setBar(true);}
    if(!prefs.idle)return;
    idleTimer=setTimeout(()=>{
      if(drag || $('bar').hidden || document.querySelector('dialog[open]') || $('address')===document.activeElement || $('bar').querySelector(':focus-visible'))return;
      setBar(false);idleHidden=true;
    },6000);
  }
  for(const event of ['pointermove','pointerdown','keydown','focusout'])document.addEventListener(event,activity,{passive:true});
  document.addEventListener('close',activity,true);
  window.addEventListener('ring-preference',activity);
  window.addEventListener('message',e=>{if(e.source===frame?.contentWindow && e.data?.surfer==='activity')activity();});
  activity();
  function update(){
    const url=current(), row=site(url),marked=saved.some(b=>clean(b.url)===url);
    for(const id of ['stop','mark','share'])$(id).disabled=!url;
    if(document.activeElement!==$('address'))$('address').value=publicLink(url);
    $('caption').textContent=row?.title||'Member site';$('prev').disabled=index<1;
    tool('mark',marked?'saved':'flag',marked?'Saved':'Save',marked?'Remove bookmark':'Bookmark this page');$('mark').setAttribute('aria-pressed',String(marked));
    tool('stop',loading?'stop':'reload',loading?'Stop':'Reload',loading?'Stop loading':'Reload this page');
    tool('sound',soundEnabled?'sound':'mute','Sound',soundEnabled?'Mute site sound':'Turn site sound on');$('sound').setAttribute('aria-pressed',String(soundEnabled));
    if(url){
      const next=location.pathname+'?'+(playableMode?'mode=playable&':'')+'url='+encodeURIComponent(publicLink(url));
      if(location.pathname+location.search!==next)history.replaceState(null,'',next);
    }
  }
  window.addEventListener('member-domains-ready',update);
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
      start=!e.target.closest?.('a,button,input,textarea,select,audio,video,iframe,.cartridge-stage,.retro-player,.ref-deck,[role=button],[contenteditable=true]') && e.touches.length===1?[e.touches[0].clientX,e.touches[0].clientY]:null;
    },{passive:true});
    doc.addEventListener('touchcancel',()=>{start=null;});
    doc.addEventListener('touchend',e=>{
      if(!start || !prefs.gestures){start=null;return;}
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
      frame.contentWindow?.postMessage({surfer:'sound',enabled:soundEnabled,muted:manualMute},host);
      return;
    }
    const doc=frame.contentDocument;
    if(!doc)return;
    for(const player of doc.querySelectorAll('audio,video')){
      player.muted=manualMute || (player.autoplay && !soundEnabled);
      if(soundEnabled && player.autoplay)player.play().catch(()=>{});
    }
    if(!soundEnabled)for(const embed of doc.querySelectorAll('.retro-player iframe')){
      if(embed.dataset.played==='yes')embed.src=embed.src;
      embed.dataset.played='';
    }
  }
  function load(){
    cancelTurn();
    queued=null;
    const url=current();
    track('');stopped=false;loading=true;
    const next=document.createElement('iframe'),u=new URL(url);
    next.title=site(url)?.title||'Member site';
    next.setAttribute('sandbox','allow-same-origin allow-scripts allow-forms allow-downloads allow-popups allow-popups-to-escape-sandbox');
    next.setAttribute('allow','autoplay; fullscreen *; gamepad *; picture-in-picture');
    const hosted=u.origin===host;
    if(hosted)u.searchParams.set('surfer','1');
    frame=next;update();msg('Opening '+next.title+'…');
    next.onload=()=>{
      if(next!==frame || stopped)return;
      loading=false;update();msg('Ready');
      if(hosted){remember(current());return;}
      try {
        const doc=next.contentDocument, real=clean(next.contentWindow.location.href);
        if(!doc || !real)return;
        push(real);remember(real);update();swipe(doc);frameSound();
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
  function another(consume=true){
    const row=site(current());
    bag=bag.filter(url=>url!==row?.base);
    if(!bag.length){
      bag=[...(playableMode?playableSites:catalog.keys())].filter(url=>url!==row?.base);
    }
    // Sample without replacement. Newly listed sites can join the current round.
    const picked=Math.floor(Math.random()*bag.length);
    const base=(consume ? bag.splice(picked,1)[0] : bag[picked])||(!playableMode || playableSites.has(row?.base)?row?.base:null);
    return base && (!playableMode && prefs.edition==='text'?base+'text.html':base);
  }
  function forward(){
    if(index<visits.length-1){index++;load();return;}
    if(!queued){navigate(another());return;}
    const base=site(queued)?.base;
    bag=bag.filter(url=>url!==base);
    navigate(queued);
  }
  function back(){if(index>0){index--;load();}}
  window.addEventListener('message',e=>{
    if(e.origin!==host || e.source!==frame?.contentWindow || !e.data || !current()?.startsWith(host+'/'))return;
    const d=e.data;
    if(d.surfer==='swipe'){if(prefs.gestures)d.forward?forward():back();return;}
    const url=clean(d.url);
    if(!url || !url.startsWith(host+'/members/'))return;
    if(d.surfer==='link')navigate(url);
    if(d.surfer==='ready'){push(url);remember(url);frameSound();track(typeof d.sound==='string' && /^https:\/\//.test(d.sound)?d.sound:site(url)?.sound||'');update();}
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
      if(row){$('address').blur();return navigate(row.base);}
    }
    const candidate=/^[\w.-]+\.[a-z]{2,}(?:\/|$)/i.test(v)?'https://'+v:v;
    if(clean(candidate)){$('address').blur();navigate(candidate);}
    else{msg('Enter a YesterSites URL or a listed site name.');$('address').select();}
  };
  $('sound').onclick=()=>{
    soundEnabled=!soundEnabled;manualMute=!soundEnabled;update();frameSound();
    if(!soundEnabled){radio.pause();msg('Sound muted.');}
    else{play();msg(currentSound?'Sound on.':'Site media sound enabled.');}
  };
  const shelf=$('shelf');
  let librarySection='saved';
  function pageName(url){
    const row=site(url);
    return row?.title||new URL(publicLink(url)).hostname.split('.')[0];
  }
  function remember(url){
    if(!url)return;
    const display=publicLink(url);
    if(prefs.launch==='resume')store('yester.last-page',display);
    if(!prefs.log)return;
    const title=pageName(url);
    if(recent[0]?.url===display && recent[0].title===title)return;
    recent=[{url:display,title},...recent.filter(entry=>entry.url!==display)].slice(0,40);
    store('yester.travel-log',recent);
  }
  function showLibrary(section){
    librarySection=section;
    const travel=section==='recent',rows=travel?recent:saved;
    $('show-saved').setAttribute('aria-pressed',String(!travel));
    $('show-recent').setAttribute('aria-pressed',String(travel));
    $('clear-recent').hidden=!travel || !rows.length;
    $('saved-list').replaceChildren();
    $('empty').hidden=!!rows.length;
    $('empty').textContent=travel?(prefs.log?'No pages in the travel log yet.':'The travel log is switched off in Settings.'):'No bookmarks yet.';
    for(const entry of rows){
      const li=document.createElement('li'),go=document.createElement('button');
      const title=document.createElement('span'),path=document.createElement('span');
      title.className='visit-label';title.textContent=entry.title;
      path.className='visit-path';path.textContent=publicLink(clean(entry.url)).slice(8);
      go.append(title,path);
      go.onclick=()=>{shelf.close();navigate(entry.url);};
      li.append(go);
      if(!travel){
        const remove=document.createElement('button');remove.textContent='Remove';
        remove.setAttribute('aria-label','Remove bookmark for '+entry.title);
        remove.onclick=()=>{
          saved=saved.filter(b=>b!==entry);store('yester.bookmarks',saved);
          showLibrary('saved');update();
          ($('saved-list').querySelector('button')||$('show-saved')).focus();
        };
        li.append(remove);
      }
      $('saved-list').append(li);
    }
  }
  $('show-saved').onclick=()=>showLibrary('saved');
  $('show-recent').onclick=()=>showLibrary('recent');
  $('clear-recent').onclick=()=>{recent=[];store('yester.travel-log',recent);showLibrary('recent');$('show-recent').focus();};
  $('mark').onclick=()=>{
    const url=current();
    if(saved.some(b=>clean(b.url)===url))saved=saved.filter(b=>clean(b.url)!==url);
    else saved.push({url:publicLink(url),title:pageName(url)});
    if(!store('yester.bookmarks',saved))msg('Bookmarks only available during this visit.');
    update();
  };
  $('bookmarks').onclick=()=>{showLibrary(librarySection);shelf.showModal();};
  $('share').onclick=async()=>{
    const url=publicLink(current());
    try{if(navigator.share)return await navigator.share({url,title:site(current())?.title||'YESTER'});
      await navigator.clipboard.writeText(url);msg('Page link copied.');}
    catch(error){if(error.name==='AbortError')return;$('share-url').value=url;$('share-box').showModal();$('share-url').select();}
  };
  const grip=$('page-grip'), viewport=$('view'), label=$('turn-label');
  let drag=null, peek=null, queued=null;
  function hidePeek(){
    peek?.remove();
    peek=null;
    if(frame)frame.style.transform='';
    grip.style.removeProperty('--travel');
    label.textContent='← Swipe to peek';
  }
  function cancelTurn(){
    const id=drag?.id;
    drag=null;
    if(id!=null && grip.hasPointerCapture(id))grip.releasePointerCapture(id);
    hidePeek();
  }
  function dragTo(e,release){
    if(!drag || drag.id!==e.pointerId)return;
    const dx=e.clientX-drag.x, dy=e.clientY-drag.y, distance=Math.abs(dx);
    const elapsed=performance.now()-drag.start;
    if(distance<10 || distance<=Math.abs(dy)*1.5){hidePeek();return;}
    if(!drag.moved){drag.held=elapsed>=350;drag.moved=true;}
    const next=dx<0;
    const target=next ? (visits[index+1] || (queued ||= another(false))) : visits[index-1];
    if(!target){hidePeek();return;}
    const width=viewport.clientWidth, threshold=Math.min(176,Math.max(80,width*.38));
    if(!peek || peek.dataset.target!==target){
      hidePeek();
      peek=document.createElement('aside');
      peek.className='page-peek';peek.inert=true;peek.dataset.target=target;
      const address=publicLink(target), u=new URL(address);
      const title=document.createElement('b');title.textContent=(next?'Next':'Back')+' · '+(site(target)?.title || u.hostname);
      const path=document.createElement('small');path.textContent=u.hostname+u.pathname;
      peek.append(title,path);
      if(site(target) && !u.search && /(?:\/|\.html?)$/i.test(u.pathname)){
        const preview=document.createElement('iframe');
        preview.title='Page preview';preview.setAttribute('sandbox','');
        preview.allow="autoplay 'none'";preview.tabIndex=-1;preview.referrerPolicy='no-referrer';
        preview.src=address;peek.append(preview);
      }
      viewport.append(peek);
    }
    const shift=Math.max(-width,Math.min(width,dx));
    frame.style.transform='translateX('+shift+'px)';
    peek.style.transform='translateX('+((next?width:-width)+shift)+'px)';
    grip.style.setProperty('--travel',Math.max(-36,Math.min(36,36*dx/threshold))+'px');
    label.textContent=distance>=threshold?'Release to open':'Drag farther to open';
    const flick=!drag.held && distance>=38 && distance/Math.max(elapsed,1)>=.58;
    if((drag.held && distance>=threshold) || (release && (distance>=threshold || flick))){
      cancelTurn();
      if(next)forward();else back();
    }
  }
  grip.hidden=!prefs.gestures;
  grip.addEventListener('pointerdown',e=>{
    if(!e.isPrimary){cancelTurn();return;}
    if(e.button!==0 || !frame || !prefs.gestures)return;
    clearTimeout(idleTimer);
    drag={id:e.pointerId,x:e.clientX,y:e.clientY,start:performance.now(),moved:false,held:false};
    grip.setPointerCapture(e.pointerId);
  });
  grip.addEventListener('pointermove',e=>dragTo(e,false));
  grip.addEventListener('pointerup',e=>{
    if(drag?.id!==e.pointerId)return;
    const tap=!drag.moved && Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<10;
    dragTo(e,true);cancelTurn();
    if(idleHidden && !tap)return;
    if(tap){idleHidden=false;setBar($('bar').hidden);}
    activity();
  });
  grip.addEventListener('click',e=>{if(e.detail===0)setBar($('bar').hidden);});
  grip.addEventListener('pointercancel',cancelTurn);
  grip.addEventListener('lostpointercapture',e=>{if(drag?.id===e.pointerId)cancelTurn();});
  window.addEventListener('resize',cancelTurn);
  window.addEventListener('blur',cancelTurn);
  window.addEventListener('ring-preference',()=>{grip.hidden=!prefs.gestures;if(grip.hidden)cancelTurn();});
  swipe($('bar'));window.addEventListener('pagehide',()=>radio.pause());
  $('address').addEventListener('keydown',e=>{
    if(e.key==='Escape'){$('address').value=publicLink(current());$('address').blur();}
  });
  window.addEventListener('keydown',e=>{
    if(e.altKey && e.key.toLowerCase()==='l' && !document.querySelector('dialog[open]')){
      e.preventDefault();setBar(true);$('address').focus();$('address').select();return;
    }
    if(e.ctrlKey || e.altKey || e.metaKey || e.shiftKey)return;
    if(e.target.closest('input,textarea,select,button,summary,a,details,[contenteditable]')||document.querySelector('dialog[open]'))return;
    if(e.key==='ArrowRight')forward();else if(e.key==='ArrowLeft')back();});
  window.addEventListener('ring-preference',e=>{
    if(e.detail==='quiet'){
      manualMute=prefs.quiet;
      if(manualMute){soundEnabled=false;radio.pause();}
      frameSound();update();
    }
    if(e.detail==='launch' && prefs.launch==='resume' && current())store('yester.last-page',publicLink(current()));
    if(e.detail==='fold' && matchMedia('(max-width: 640px)').matches)setBar(!prefs.fold);
  });
  const explicit=clean(new URLSearchParams(location.search).get('url')||'');
  const previous=prefs.launch==='resume' && clean(read('yester.last-page',''));
  let releaseFirstPage,directoryFailed=false;
  const firstPage=new Promise(resolve=>{releaseFirstPage=resolve;});
  (async()=>{
    let cursor;
    do {
      const u=new URL('/api/directory',host);if(playableMode)u.searchParams.set('cap','playable');if(cursor)u.searchParams.set('cursor',cursor);
      const data=await window.fetchGrubDirectoryPage(u.href);
      for(const m of data.sites){
        if(!/^[a-z0-9-]{1,40}$/.test(m.slug))continue;
        const base=host+'/members/'+m.slug+'/';
        if((m.capabilities||[]).includes('playable'))playableSites.add(base);
        if(catalog.has(base))continue;
        catalog.set(base,{base,title:m.title,sound:''});
        if(bag.length && (!playableMode || playableSites.has(base)) && site(current())?.base!==base)bag.push(base);
      }
      if(!playableMode || (explicit?playableSites.has(site(explicit)?.base):playableSites.size))releaseFirstPage();
      cursor=data.nextCursor;
    }while(cursor);
    update();
  })().catch(()=>{directoryFailed=true;}).finally(releaseFirstPage);
  if(playableMode){
    document.title='Sites with games · YESTER';
    msg('Finding playable member sites…');
    firstPage.then(()=>{
      const start=explicit && playableSites.has(site(explicit)?.base)?explicit:another();
      if(start)navigate(start);
      else{
        msg(directoryFailed?'Could not reach Grub.':'There are no listed playable sites yet.');
        $('next').disabled=true;
        const retry=document.createElement('button');retry.textContent='Reload directory';retry.onclick=()=>location.reload();
        $('view').replaceChildren(retry);
      }
    });
  }else if(explicit || previous)navigate(explicit || previous);
  else{
    msg('Finding a member site…');update();
    // New visitors get the live directory on their first shuffle. A slow/offline
    // directory still leaves the bundled neighborhood available immediately after.
    Promise.race([firstPage,new Promise(resolve=>setTimeout(resolve,1000))]).then(()=>{
      if(!current())navigate(another());
    });
  }
  if(prefs.fold && matchMedia('(max-width: 640px)').matches)setBar(false);
})();

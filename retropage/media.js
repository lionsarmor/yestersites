/* Shared by the editor, HTML exporter and member host. Media is linked, never uploaded. */
const RetroMedia = (() => {
  const isPlayer=o=>['audio-player','video-player'].includes(o?.widget);
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function source(value,widget) {
    let u;
    try {u=new URL(value);} catch {}
    if(!u || u.protocol!=='https:' || u.username || u.password || value.length>2048 || /[\s\\]/.test(value))
      throw Error('Enter a complete HTTPS link to the clip or stream.');
    if (['rumble.com','www.rumble.com'].includes(u.hostname)) {
      if(widget!=='video-player')throw Error('Choose a Video player for Rumble.');
      const match=u.pathname.match(/^\/embed\/(v[a-z0-9]+)\/?$/i);
      if(!match)throw Error('Choose a Rumble video or copy its Share / Embed URL.');
      return {url:u.href,provider:'Rumble',embed:'https://rumble.com/embed/'+match[1]+'/'};
    }
    if (['archive.org','www.archive.org'].includes(u.hostname) && !u.pathname.startsWith('/download/')) {
      const item=u.pathname.match(/^\/(?:details|embed)\/([a-zA-Z0-9._-]+)\/?$/);
      if (!item || widget!=='video-player')throw Error('Use an Archive movie item URL or a direct media download.');
      return {url:u.href,provider:'Internet Archive',embed:'https://archive.org/embed/'+item[1]};
    }
    if(!['youtu.be','www.youtube.com','youtube.com','m.youtube.com','www.youtube-nocookie.com'].includes(u.hostname))
      return {url:u.href};
    const id=u.hostname==='youtu.be'?u.pathname.slice(1):u.pathname==='/watch'?u.searchParams.get('v'):
      u.pathname.match(/^\/(?:shorts|live|embed)\/([^/]+)\/?$/)?.[1];
    if(widget!=='video-player' || !/^[a-zA-Z0-9_-]{11}$/.test(id||''))throw Error('Use a YouTube video link in a Video player.');
    const t=u.searchParams.get('t')||u.searchParams.get('start')||'0';
    const time=t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
    const start=time?Math.min(604800,Number(time[1]||0)*3600+Number(time[2]||0)*60+Number(time[3]||0)):0;
    return {url:u.href,id,start};
  }
  const frameKinds=['inline-frame','split-frame'];
  const borderStyles={'border-raised':'outset','border-inset':'inset','border-ridge':'ridge'};
  const isFrame=o=>frameKinds.includes(o?.widget);
  const isBorder=o=>Object.hasOwn(borderStyles,o?.widget || '');
  const isPanel=o=>isFrame(o)||isBorder(o);
  const skins={win31:'Windows 3.1',real:'RealPlayer style',deck:'Original deck'};
  const voices={clip:'Sound recorder',music:'Music deck',radio:'Radio tuner'};
  function frameURL(value){
    if(/^page:(?:home|[0-9a-f]{32})$/.test(value))return value;
    let url;try{url=new URL(value);}catch{}
    if(!url || url.protocol!=='https:' || !/^[a-z0-9.-]+$/i.test(url.hostname) || url.username || url.password || value.length>2048)throw Error('Choose a project page or enter an HTTPS page address.');
    return url.href;
  }
  function checkFrames(pages){
    const done=new Set(),active=new Set(),index=new Map(pages);
    function visit(key){
      if(active.has(key))throw Error('A frame cannot contain its own page, even through another frame.');
      if(done.has(key))return;
      if(!index.has(key))throw Error('A frame links to a missing page.');
      active.add(key);
      for(const o of index.get(key).items.filter(isFrame)){
        for(const value of [o.href,...(o.widget==='split-frame'?[o.otherHref]:[])])
          if(frameURL(value).startsWith('page:'))visit(value.slice(5));
      }
      active.delete(key);done.add(key);
    }
    for(const key of index.keys())visit(key);
  }
  function panel(o,layout,destination){
    const old=layout==='classic'||layout==='text';
    if(isBorder(o))return old?'':'<span aria-hidden="true" class="page-bevel" style="border:6px '+borderStyles[o.widget]+' '+escape(o.color)+'"></span>';
    const items=[[o.text||'Contents',frameURL(o.href)]];
    if(o.widget==='split-frame')items.push([o.otherLabel||'More',frameURL(o.otherHref)]);
    const targets=items.map(([label,url])=>[escape(label),escape(url.startsWith('page:')?destination(url.slice(5)):url)]);
    const links=targets.map(([label,url])=>'<a href="'+url+'">'+label+'</a>').join(' / ');
    if(old)return links;
    const name='pane-'+String(o.id).replace(/[^a-zA-Z0-9_-]/g,'');
    const nav=targets.length===1?'':'<span class="pane-menu"><strong>INDEX</strong>'+targets.map(([label,url])=>'<a href="'+url+'" target="'+name+'">'+label+'</a>').join('')+'</span>';
    return '<span class="page-pane">'+nav+'<span class="pane-body"><iframe sandbox="" referrerpolicy="no-referrer" name="'+name+'" title="'+targets[0][0]+'" src="'+targets[0][1]+'"></iframe><small>Open page · '+links+'</small></span></span>';
  }
  const panelCss='.page-bevel,.page-pane{box-sizing:border-box;display:flex;width:100%;height:100%}.page-pane{pointer-events:auto;background:silver;color:black;border:3px ridge #ccc;font:12px Arial,sans-serif;text-align:left}.pane-menu{display:flex;flex:0 0 min(100px,30%);flex-direction:column;gap:8px;padding:4px;border-right:4px ridge #ccc;background:#ccc}.pane-menu strong{height:55px;display:grid;place-items:center;border-bottom:3px ridge #ccc;font:bold 15px Georgia,serif}.pane-body{flex:1;min-width:0;display:flex;flex-direction:column}.pane-body iframe{flex:1;width:100%;min-height:0;border:0;background:white}.pane-body small{padding:3px}.object .page-pane a,.phone .page-pane a{display:inline;width:auto;height:auto;min-height:0;color:navy;font:inherit}.phone .page-pane{height:220px}.phone .page-bevel{height:12px}@media(max-width:600px){.board .page-pane{min-height:220px}}';
  function render(o,layout) {
    const {url,id,start,provider,embed}=source(o.href,o.widget),href=escape(url),title=escape(o.text||'Media player');
    if(layout==='classic'||layout==='text')return '<a href="'+href+'">'+title+'</a>';
    const tag=o.widget==='audio-player'?'audio':'video',skin=Object.hasOwn(skins,o.playerSkin)?o.playerSkin:'deck',voice=Object.hasOwn(voices,o.audioMode)?o.audioMode:'clip',brand=tag==='audio'?(skin==='deck' && !o.audioMode?'Wave Deck':voices[voice]):skin==='real'?'Cinema player':skin==='win31'?'Media Player':'Vision Deck';
    let player;
    if(id) {
      const params=new URLSearchParams({playsinline:'1'});
      if(start)params.set('start',start);
      if(o.autoplay)params.set('autoplay','1');
      if(o.loop){params.set('loop','1');params.set('playlist',id);}
      player='<iframe title="'+title+'" src="https://www.youtube-nocookie.com/embed/'+id+'?'+escape(params.toString())+'" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>';
    } else if (embed) {
      player='<iframe title="'+title+'" src="'+escape(embed)+'" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="fullscreen; picture-in-picture" allowfullscreen></iframe>';
    } else player='<'+tag+' controls playsinline preload="metadata" aria-label="'+title+'"'+(o.autoplay?' autoplay':'')+(o.loop?' loop':'')+'><source src="'+href+'">'+(o.alternateSrc?'<source src="'+escape(source(o.alternateSrc,o.widget).url)+'">':'')+'</'+tag+'>';
    return '<span class="retro-player '+tag+' skin-'+skin+' voice-'+voice+'"><b>'+brand+' · '+title+'</b>'+player+'<a href="'+href+'" target="_blank" rel="noopener">'+(id?'Watch on YouTube':provider?'Open on '+provider:'Open media file')+'</a></span>';
  }
  const css='.retro-player{pointer-events:auto;box-sizing:border-box;display:flex;flex-direction:column;max-width:100%;height:100%;padding:3px;color:#20232a;background:#c8c7c0;border:2px outset #eeeae0;font:12px/1.2 Arial,sans-serif;text-align:left}.retro-player b{display:block;color:#fff6df;background:#22364b;padding:3px 6px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.retro-player :is(video,audio,iframe){min-height:0;width:100%;max-width:100%;border:0;flex:1;background:#181b20}.retro-player.audio audio{min-height:32px}.retro-player.video{min-height:0}.object .retro-player a,.phone .retro-player a{display:block;width:auto;height:auto;min-height:0;padding:2px 5px;color:#173459;font:11px Arial,sans-serif}.phone .retro-player{width:100%;max-width:30em}.phone .retro-player.video :is(video,iframe){min-height:200px}';
  function installAudioPanels(){
    for(const deck of document.querySelectorAll('.retro-player.audio:not(.skin-deck)')){
      const audio=deck.querySelector('audio');
      if(!audio)continue;
      const controls=document.createElement('span');controls.className='transport';
      const button=(label,action)=>{
        const el=document.createElement('button');el.type='button';el.textContent=label;el.onclick=action;
        controls.append(el);return el;
      };
      const state=document.createElement('output');state.className='deck-clock';
      const play=button('▶ Play',()=>audio.paused?audio.play().catch(()=>{state.textContent='Cannot play — open file below';}):audio.pause());
      const stop=button('■ Stop',()=>{audio.pause();if(Number.isFinite(audio.duration))audio.currentTime=0;else audio.load();});
      const seek=document.createElement('input');seek.type='range';seek.min=0;seek.max=1000;seek.value=0;seek.disabled=true;
      seek.setAttribute('aria-label','Playback position');
      seek.oninput=()=>{if(Number.isFinite(audio.duration))audio.currentTime=audio.duration*Number(seek.value)/1000;};
      controls.append(seek);
      const mute=button('Mute',()=>{audio.muted=!audio.muted;});
      function clock(t){return Math.floor(t/60)+':'+String(Math.floor(t%60)).padStart(2,'0');}
      function sync(){
        const finite=Number.isFinite(audio.duration) && audio.duration>0;
        seek.disabled=!finite;
        if(finite)seek.value=String(Math.round(1000*audio.currentTime/audio.duration));
        const status=audio.error?'Source unavailable':audio.ended?'End':audio.paused?'Ready':deck.classList.contains('voice-radio')?'On air':'Playing';
        state.textContent=status+' · '+clock(audio.currentTime||0)+(finite?' / '+clock(audio.duration):'');
        deck.dataset.playing=String(!audio.paused && !audio.ended);
        play.textContent=audio.paused?'▶ Play':'Ⅱ Pause';mute.textContent=audio.muted?'Unmute':'Mute';
        mute.setAttribute('aria-pressed',String(audio.muted));stop.disabled=audio.paused && !audio.currentTime;
      }
      for(const event of ['loadedmetadata','durationchange','timeupdate','play','pause','ended','volumechange','error','emptied'])audio.addEventListener(event,sync);
      audio.after(state,controls);audio.controls=false;audio.hidden=true;sync();
    }
  }
  const script='('+installAudioPanels.toString()+')()';
  const transportCss='.retro-player .deck-clock{display:block;box-sizing:border-box;background:#152124;color:#c1eea6;border:2px inset #9aa;margin:2px 1px;padding:2px 6px;font:12px/1.2 monospace;letter-spacing:1px;white-space:nowrap}.voice-radio .deck-clock{background:repeating-linear-gradient(90deg,transparent 0 8px,#be9656 9px 10px) bottom left/100% 3px no-repeat,#27201a;color:#f4c76d}.voice-music .deck-clock:after{content:"◉ ━ ◉";float:right;color:#c3d4ba}.transport{display:flex;align-items:center;gap:3px;padding:1px}.transport button{cursor:pointer;border:2px outset #eee;background:silver;color:#13151d;font:12px/1.15 Arial;min-height:22px;white-space:nowrap}.transport button:active{border-style:inset}.transport input{min-width:15px;flex:1;accent-color:#526d80}.skin-real .transport button{border-radius:3px;background:#cad8df}.retro-player.audio audio[hidden]{display:none}';
  const faceCss='.retro-player.skin-win31{background:#c0c0c0;border:3px ridge #eee;color:#111}.skin-win31 b{background:#000080;color:white;text-align:center;font:bold 13px Arial;padding:2px}.retro-player.skin-real{background:linear-gradient(#526d83,#24384b 48%,#182937);border:3px ridge #a9bec9;border-radius:7px;color:white;padding:5px}.skin-real b{color:#ffca62;background:#19252d;letter-spacing:.04em}.object .skin-real a,.phone .skin-real a{color:#fff}.retro-player.audio:not(.skin-deck){justify-content:space-between}.retro-player.audio:not(.skin-deck) b:before{content:"REC";display:inline-block;font:bold 10px monospace;color:#fff;background:#9a2429;margin-right:7px;padding:2px 4px}.retro-player.voice-music:not(.skin-deck) b:before{content:"♫  STEREO";background:#284c3b}.retro-player.voice-radio:not(.skin-deck) b:before{content:"FM";background:#673a1d}.retro-player.audio audio{width:100%;background:transparent;flex:1 1 36px}.retro-player video{object-fit:contain}';
  return {isPlayer,source,render,script,css:css+faceCss+transportCss,isFrame,isBorder,isPanel,panel,panelCss,checkFrames,borderStyles,frameURL,skins,voices};
})();

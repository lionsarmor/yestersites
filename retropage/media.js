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
  function render(o,layout) {
    const {url,id,start,provider,embed}=source(o.href,o.widget),href=escape(url),title=escape(o.text||'Media player');
    if(layout==='classic'||layout==='text')return '<a href="'+href+'">'+title+'</a>';
    const tag=o.widget==='audio-player'?'audio':'video',brand=tag==='audio'?'Wave Deck':'Vision Deck';
    let player;
    if(id) {
      const params=new URLSearchParams({playsinline:'1'});
      if(start)params.set('start',start);
      if(o.autoplay)params.set('autoplay','1');
      if(o.loop){params.set('loop','1');params.set('playlist',id);}
      player='<iframe title="'+title+'" src="https://www.youtube-nocookie.com/embed/'+id+'?'+escape(params.toString())+'" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>';
    } else if (embed) {
      player='<iframe title="'+title+'" src="'+escape(embed)+'" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="fullscreen; picture-in-picture" allowfullscreen></iframe>';
    } else player='<'+tag+' controls playsinline preload="none" aria-label="'+title+'" src="'+href+'"'+(o.autoplay?' autoplay':'')+(o.loop?' loop':'')+'></'+tag+'>';
    return '<span class="retro-player '+tag+'"><b>'+brand+' · '+title+'</b>'+player+'<a href="'+href+'" target="_blank" rel="noopener">'+(id?'Watch on YouTube':provider?'Open on '+provider:'Open media file')+'</a></span>';
  }
  const css='.retro-player{pointer-events:auto;box-sizing:border-box;display:flex;flex-direction:column;max-width:100%;height:100%;padding:3px;color:#20232a;background:#c8c7c0;border:2px outset #eeeae0;font:12px/1.2 Arial,sans-serif;text-align:left}.retro-player b{display:block;color:#fff6df;background:#22364b;padding:3px 6px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.retro-player :is(video,audio,iframe){min-height:0;width:100%;max-width:100%;border:0;flex:1;background:#181b20}.retro-player.audio audio{min-height:32px}.retro-player.video{min-height:0}.object .retro-player a,.phone .retro-player a{display:block;width:auto;height:auto;min-height:0;padding:2px 5px;color:#173459;font:11px Arial,sans-serif}.phone .retro-player{width:100%;max-width:30em}.phone .retro-player.video :is(video,iframe){min-height:200px}';
  return {isPlayer,source,render,css};
})();

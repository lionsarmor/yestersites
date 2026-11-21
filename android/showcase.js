'use strict';
(() => {
  const byId = id => document.getElementById(id);
  const frames = window.YESTER_FRAMES;
  const phone = document.querySelector('.phone');
  const page = byId('page');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const sites = {
    arcade: {domain: 'quarter-moon-arcade.yestersites.com', url: 'https://quarter-moon-arcade.yestersites.com/'},
    room: {domain: 'quarter-moon-arcade.yestersites.com', url: 'https://quarter-moon-arcade.yestersites.com/page-fb9fd18c43584ea4e062791df976439e.html'},
    outside: {domain: 'roddy.world', url: 'https://roddy.world/'},
    pets: {domain: 'pocket-bog.yestersites.com', url: 'https://pocket-bog.yestersites.com/'},
    radio: {domain: 'late-night-signal.yestersites.com', url: 'https://late-night-signal.yestersites.com/'}
  };
  const memberOrder = ['arcade', 'pets', 'radio'];
  let history = ['arcade'], index = 0, anchor = 'arcade', loading = false, loadTimer, gestureY;
  let selected = frames[0];
  const image = (frame, name) => 'art/frames/' + frame.id + '/' + name + '.png';
  const cssURL = (frame, name) => 'url("' + image(frame, name) + '")';

  function skin(target, frame) {
    const properties = {face: frame.surface, ink: frame.ink, shade: frame.edge, light: frame.light,
      field: frame.display, displayInk: frame.displayInk, keyInk: frame.keyInk, radius: frame.radius + 'px',
      housing: cssURL(frame, 'housing'), key: cssURL(frame, 'key'), fieldArt: cssURL(frame, 'address'), gripArt: cssURL(frame, 'grip')};
    for (const [key, value] of Object.entries(properties)) target.style.setProperty('--' + key, value);
  }
  function setIcon(id, name, label) {
    const button = byId(id);
    button.querySelector('img').src = image(selected, name);
    button.querySelector('span').textContent = label;
    button.setAttribute('aria-label', label);
  }
  function controls() {
    byId('back').disabled = index === 0;
    byId('address-icon').src = image(selected,'address-icon');
    setIcon('back', 'back', 'Back');
    setIcon('next', index + 1 < history.length ? 'forward' : 'next', index + 1 < history.length ? 'Forward' : 'Next');
    setIcon('reload', loading ? 'stop' : 'reload', loading ? 'Stop' : 'Reload');
    setIcon('tools', 'tools', 'Tools');
    [...document.querySelectorAll('.keys button')].forEach((btn, i) => {
      btn.style.setProperty('--key', cssURL(selected, 'key' + i));
      btn.style.setProperty('--keyInk', selected.keyInks?.[i] || selected.keyInk);
    });
  }
  function choose(frame, scroll = false) {
    selected = frame;
    skin(phone, frame);
    byId('frame-name').textContent = frame.name;
    document.querySelectorAll('.specimen').forEach(b => b.setAttribute('aria-pressed', b.dataset.frame === frame.id));
    controls();
    if (scroll) {
      byId('preview').scrollIntoView({behavior: reduced.matches ? 'auto' : 'smooth', block:'center'});
      byId('grip').focus({preventScroll:true});
    }
  }
  frames.forEach(frame => {
    const b = document.createElement('button');
    b.className = 'specimen'; b.dataset.frame = frame.id;
    b.innerHTML = '<span class="sample" aria-hidden="true"><i class="mini-url"></i><span class="mini-keys"><i></i><i></i><i></i><i></i></span></span><span></span>';
    b.lastElementChild.textContent = frame.name;
    b.setAttribute('aria-label', 'Preview ' + frame.name);
    skin(b, frame);
    b.querySelectorAll('.mini-keys i').forEach((key, i) => key.style.setProperty('--key', cssURL(frame,'key'+i)));
    b.onclick = () => choose(frame, true);
    byId('frames').append(b);
  });
  const homeHTML = page.innerHTML;
  const pages = {
    arcade: homeHTML,
    room: '<div class="site room"><small>TOKEN ALLEY / GAME ROOM</small><h2>Pond Post</h2><img class="illustration" src="art/pond-post.png" alt="The Pond Post game cartridge screen"><p>Carry three letters across the lily pond.</p><p><a href="'+sites.room.url+'" target="_blank" rel="noopener">Play the live cabinet ↗</a></p><button class="web-link" data-go="outside">Visit RODDY on the wider web →</button></div>',
    outside: '<div class="site outside"><small>OUTSIDE LINK / PREVIEW</small><h2>RODDY</h2><img src="art/roddy.svg" alt="RODDY"><p>You followed a link out of the arcade. Press Back on the dock to return to the game room.</p><a href="https://roddy.world/" target="_blank" rel="noopener">Open the live site ↗</a></div>',
    pets: '<div class="site pets"><small>THE MARSH / PET CLUB</small><h2>Pocket Bog</h2><img class="site-hero" src="art/pocket-bog.jpg" alt="Pocket Bog clubhouse banner"><p>A little marsh for little creatures.</p><a href="'+sites.pets.url+'" target="_blank" rel="noopener" class="web-link">Enter the live clubhouse ↗</a></div>',
    radio: '<div class="site radio"><small>THE SHACK / AFTER DARK</small><h2>Late Night Signal</h2><img class="illustration" src="art/radio.gif" alt="Radio tower at night"><p>Logs, links and notes from the shack.</p><a href="'+sites.radio.url+'" class="web-link" rel="noopener" target="_blank">Tune into the live site ↗</a></div>'
  };
  function toolbox(show) { byId('toolbox').hidden = !show; byId('tools').setAttribute('aria-expanded',String(show)); }
  function render() {
    clearTimeout(loadTimer); loading = false; toolbox(false);
    const id = history[index];
    page.innerHTML = pages[id]; page.scrollTop = 0;
    byId('domain').textContent = sites[id].domain;
    byId('visit').href = sites[id].url;
    if (memberOrder.includes(id)) anchor=id;
    if (id==='room') anchor='arcade';
    controls();
  }
  function visit(id) { if (!sites[id]) return; history.splice(index+1, Infinity, id); index++; render(); }
  function discover() { visit(memberOrder[(memberOrder.indexOf(anchor)+1)%memberOrder.length]); }
  page.addEventListener('click', e => {const btn = e.target.closest('[data-go]'); if (btn) visit(btn.dataset.go);});
  byId('back').onclick = () => { if(index>0){index--; render();}};
  byId('next').onclick = () => {if(index+1<history.length){index++;render();}else discover();};
  byId('reload').onclick = () => {
    clearTimeout(loadTimer);
    if (loading) { loading=false; controls(); return; }
    loading=true; controls();
    loadTimer=setTimeout(render,350);
  };
  byId('tools').onclick = () => toolbox(byId('toolbox').hidden);
  byId('close-tools').onclick = () => {toolbox(false);byId('tools').focus();};
  byId('toolbox').querySelector('a').onclick = () => toolbox(false);
  byId('restart').onclick = () => {history=['arcade'];index=0;render();};
  const grip = byId('grip');
  let gestured = false;
  grip.onpointerdown = e => {gestureY=e.clientY;gestured=false;grip.setPointerCapture(e.pointerId);};
  grip.onpointerup = e => {if (gestureY !== undefined && gestureY-e.clientY>25){gestured=true;discover();}gestureY=undefined;};
  grip.onpointercancel = () => {gestureY=undefined;};
  grip.onclick = () => {if(!gestured)discover();gestured=false;};
  const tourStates = [
    [['arcade','room'],1], [['arcade','room','outside'],2],
    [['arcade','room','outside'],1], [['arcade','room','pets'],2]
  ];
  byId('tour').addEventListener('click',e=>{
    const b=e.target.closest('button'); if(!b)return;
    const [entries,at]=tourStates[Number(b.dataset.tour)];history=[...entries];index=at;anchor='arcade';render();
    byId('preview').scrollIntoView({behavior:reduced.matches?'auto':'smooth',block:'center'});
    byId('tour').querySelectorAll('button').forEach(t=>t.removeAttribute('aria-current'));b.setAttribute('aria-current','step');
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!byId('toolbox').hidden){toolbox(false);byId('tools').focus();}});
  choose(frames.find(f=>f.name==='DeskSet 3.2')||frames[0]);
})();

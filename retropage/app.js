/* Retro Page's free-placement desktop, backed by the portable .yst document. */
(() => {
  'use strict';
  const M = window.RetroModel,
    presets = window.retroPresets,
    $ = (id) => document.getElementById(id);
  const storageKey = 'roddy.retro-page.project.v1';
  const glyphIndex = { page: 0, eye: 1, image: 2, text: 3, closed: 4, link: 5, box: 6, rule: 7 };
  const phosphors = { Green: '#76f04c', Amber: '#ffc05b', White: '#f3f1e7' };
  const esc = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  const node = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  function button(text, action, cls = '') {
    const b = node('button', cls, text);
    b.type = 'button';
    b.dataset.action = action;
    return b;
  }
  function glyph(kind) {
    const i = node('i', 'glyph');
    i.style.setProperty('--g', glyphIndex[kind]);
    i.setAttribute('aria-hidden', 'true');
    return i;
  }
  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob),
      a = node('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  function status(s) {
    $('status').textContent = s;
  }
  const cleanName = (s) =>
    (s || 'Homepage')
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
      .trim()
      .slice(0, 80) || 'Homepage';
  const requestedDrawer = new URLSearchParams(location.search).get('drawer');
  let doc = {...M.copy(presets.sample),listed:true},
    active = 'home',
    selected = null,
    drawer = requestedDrawer === 'videos' ? 'Video Vault' : requestedDrawer === 'gifs' ? 'GIFs' : 'Objects',
    armed = null,
    gesture = null,
    editing = null,
    clip = null;
  let scale = 1,
    zoom = 'fit',
    grid = false,
    snap = false,
    filter = '',
    hist = [],
    at = 0,
    clipboardOffset = 12;
  let hidden = new Set(),
    pageBbs = 'home',
    bbsBack = [],
    bbsHelp = false,
    bbsWidth = 32,
    bbsColor = 'Green',
    stickyError = '';
  let firstVisit=true;
  try {
    const recovery = localStorage.getItem(storageKey);
    if (recovery) {
      const state = JSON.parse(recovery);
      doc = M.normalize(state.doc);firstVisit=false;
      if (M.page(doc, state.active)) active = state.active;
    }
    const prefs = JSON.parse(localStorage.getItem(storageKey + '.terminal') || 'null');
    if (prefs) {
      bbsWidth = [32, 40, 80].includes(prefs.columns) ? prefs.columns : 32;
      bbsColor = Object.hasOwn(phosphors, prefs.color) ? prefs.color : 'Green';
    }
  } catch {
    stickyError = 'The previous browser draft could not be restored. The sample is open.';
  }
  selected = M.page(doc, active).items.at(-1)?.id || null;
  pageBbs = active;
  const page = () => M.page(doc, active),
    object = () => page().items.find((o) => o.id === selected);
  const layerKey = (id) => active + ':' + id;
  function saveDraft() {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ doc, active }));
    } catch {
      stickyError = 'Browser storage is full or unavailable. Use Save to keep this project.';
    }
  }
  function record(message) {
    const data = JSON.stringify(doc);
    if (!hist[at] || data !== hist[at].data) {
      hist = hist.slice(0, at + 1);
      hist.push({ data, active, selected });
      while (
        hist.length > 2 &&
        (hist.length > 50 || hist.reduce((n, s) => n + s.data.length, 0) > 20 * 1024 * 1024)
      )
        hist.shift();
      at = hist.length - 1;
    }
    saveDraft();
    if (message) status(stickyError || message);
    if(drawer==='GIFs')refreshShelf();
    render();
  }
  function undo(delta) {
    const pos = at + delta;
    if (pos < 0 || pos >= hist.length) return;
    at = pos;
    const snap = hist[at];
    doc = JSON.parse(snap.data);
    active = M.page(doc, snap.active) ? snap.active : 'home';
    selected = snap.selected;
    pageBbs = active;
    bbsBack = [];
    bbsHelp = false;
    record(delta < 0 ? 'Undid the last change.' : 'Redid the last change.');
  }
  function load(docNext, msg) {
    doc = M.normalize(docNext);
    active = 'home';
    selected = doc.items.at(-1)?.id || null;
    pageBbs = 'home';
    bbsBack = [];
    bbsHelp = false;
    hidden.clear();
    armed = null;
    hist = [];
    at = 0;
    setDrawer('Pages');
    record(msg);
  }
  const menus = {
    File: [
      ['New blank project', 'new', 'Ctrl+N'],
      ['New from template…', 'template'],
      ['Open project…', 'open', 'Ctrl+O'],
      ['Open sample', 'sample'],
      null,
      ['Save project…', 'save', 'Ctrl+S'],
      ['Export website ZIP…', 'export'],
      ['Publish to YesterSites…', 'publish'],
    ],
    Edit: [
      ['Undo', 'undo', 'Ctrl+Z'],
      ['Redo', 'redo', 'Ctrl+Y'],
      null,
      ['Copy object', 'copy', 'Ctrl+C'],
      ['Paste object', 'paste', 'Ctrl+V'],
      ['Duplicate object', 'duplicate', 'Ctrl+D'],
      ['Delete object', 'delete', 'Del'],
    ],
    Object: [
      ['Text', 'add-text'],
      ['Image…', 'add-image'],
      ['Link', 'add-link'],
      ['Box', 'add-box'],
      ['Horizontal rule', 'add-rule'],
      ['HTML & CSS block…','craft-html'],
      ['Flash movie…','craft-flash'],
      null,
      ['GIF stamps', 'stamps'],
      ['Properties…', 'properties'],
      ['Bring to front', 'front'],
      ['Send to back', 'back'],
    ],
    Page: [
      ['Add page…', 'add-page'],
      ['Rename page…', 'rename-page'],
      ['Duplicate page…', 'duplicate-page'],
      ['Delete page…', 'delete-page'],
      null,
      ['Page settings…', 'settings'],
    ],
    View: [
      ['View in browser', 'preview', 'F5'],
      ['HTML source & page CSS…', 'source'],
      ['Edit HTML & CSS block…','craft-html'],
      ['BBS preview', 'preview-bbs'],
      null,
      ['Zoom…', 'zoom'],
      ['Show grid', 'grid'],
      ['Snap to 8 px', 'snap'],
    ],
    Options: [
      ['HTML / CSS editor…', 'code-editor'],
      ['Page stylesheet & generated HTML…', 'source'],
    ],
    Help: [
      ['Using Retro Page', 'help'],
      ['Artwork credits', 'credits'],
      ['About Retro Page', 'about'],
    ],
  };
  for (const [name, items] of Object.entries(menus)) {
    const d = node('details'),
      s = node('summary', null, name),
      box = node('div', 'menu');
    d.append(s, box);
    for (const v of items) {
      if (!v) {
        box.append(node('hr'));
        continue;
      }
      const b = button(v[0], v[1]);
      if (v[2]) b.append(node('kbd', null, v[2]));
      box.append(b);
    }
    d.addEventListener('toggle', () => {
      if (d.open)
        for (const other of $('menus').querySelectorAll('details')) if (other !== d) other.open = false;
    });
    $('menus').append(d);
  }
  function closeMenus() {
    for (const d of $('menus').querySelectorAll('details')) d.open = false;
  }
  function closePanels() {
    $('drawer').classList.remove('open');
    $('inspector').classList.remove('open');
  }
  let dialogAccept = null;
  function dialog(title, fields, accept, submit = 'OK') {
    if ($('dialog').open) $('dialog').close();
    const root = $('dialog-fields');
    root.replaceChildren();
    $('dialog-title').textContent = title;
    dialogAccept = accept;
    $('dialog-error').textContent = '';
    $('dialog').classList.toggle('object-dialog', fields.some(field => field.name === 'font_family' || field.name === 'w'));
    const sections = new Map();
    for (const f of fields) {
      if (f.note) {
        root.append(node('p', null, f.note));
        continue;
      }
      if (f.url) {
        const a = node('a', null, f.label);
        a.href = f.url;
        a.target = '_blank';
        a.rel = 'noopener';
        root.append(a);
        continue;
      }
      const label = node('label');
      let c;
      if (f.type === 'select') {
        c = node('select');
        for (const v of f.options) {
          const [value, t] = Array.isArray(v) ? v : [v, v];
          c.add(new Option(t, value));
        }
      } else if (f.type === 'textarea') c = node('textarea');
      else {
        c = node('input');
        c.type = f.type || 'text';
      }
      c.name = f.name;
      c.setAttribute('aria-label', f.label);
      if (f.type === 'checkbox') {
        c.checked = !!f.value;
        label.className = 'check';
        label.append(c, document.createTextNode(f.label));
      } else {
        if (f.value !== undefined) c.value = f.value;
        label.append(document.createTextNode(f.label), c);
      }
      for (const k of ['min', 'max', 'maxLength', 'required', 'readOnly'])
        if (f[k] !== undefined) c[k] = f[k];
      if (f.name === 'href') {
        c.placeholder = 'example.com or /path';
        c.oninput = () => { if (c.value.trim()) root.querySelector('[name=target]').value = ''; };
      }
      if (f.name === 'target') c.onchange = () => {
        if (c.value) root.querySelector('[name=href]').value = '';
      };
      const section = f.section;
      if (section && !sections.has(section)) {
        const group = node('fieldset');
        group.append(node('legend', null, section));
        sections.set(section, group);
        root.append(group);
      }
      (sections.get(section) || root).append(label);
    }
    $('dialog-submit').textContent = submit;
    $('dialog').showModal();
    root.querySelector('input,textarea,select')?.focus();
  }
  $('dialog-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const values = {};
    for (const c of $('dialog-fields').querySelectorAll('[name]'))
      values[c.name] = c.type === 'checkbox' ? c.checked : c.value;
    const cb = dialogAccept;
    if ($('dialog-submit').disabled) return;
    $('dialog-submit').disabled=true;
    try {
      if (cb) await cb(values);
      if (dialogAccept === cb && $('dialog').open) $('dialog').close();
    } catch (e) {
      $('dialog-error').textContent = e.message;
      if (e.field) $('dialog-fields').querySelector('[name='+e.field+']')?.focus();
    } finally { $('dialog-submit').disabled=false; }
  });
  function setDrawer(value) {
    if (drawer === 'GIFs') artScroll = $('drawer-content').scrollTop;
    if (drawer === 'Video Vault' && value !== drawer) {
      vaultPanel.stopPreview();
      vaultScroll = $('drawer-content').scrollTop;
    }
    drawer = value;
    renderDrawer();
  }
  const stamps = [...presets.stamps];
  const shelf=RetroStudioDrawer.artShelf();
  const shelfGroups=['Favorites','Recently used','Used on this site'];
  let refreshShelf=()=>{}, vaultPanel, vaultScroll=0;
  function projectArtwork(){
    const result=new Map(),library=new Map(stamps.map(st=>[st.src,st]));
    for(const [pageId,p] of M.pages(doc))for(const o of p.items){
      if(o.kind!=='image'||!o.src)continue;
      const ref=o.artRef,st=ref?.group?stamps.find(a=>a.group===ref.group&&a.label===ref.label):library.get(o.src);
      const row=st || (ref?.archive?{archive:ref.archive,src:o.src,label:ref.label||o.text}:{used:pageId+'/'+o.id,src:o.src,label:o.text||'Page image'});
      const id=st||ref?.archive?shelf.token(row):o.src;
      if(!result.has(id))result.set(id,row);
    }
    return [...result.values()];
  }
  const animatedBuiltins = new Set();
  let artOrder = [...presets.stamps], artLoading, browsedLocalArt = false;
  const artGroups = ['All artwork','Animated GIFs',...shelfGroups, ...new Set(presets.stamps.map(st => st.group))];
  function loadArtwork() {
    if(artLoading)return artLoading;
    artLoading=new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src='./art-library.js';
      script.onerror=()=>{script.remove();reject(Error('The artwork library could not be loaded.'));};
      script.onload=()=>{
        stamps.push(...window.retroStampArt.stamps);
        for(const label of window.retroStampArt.animatedBuiltins)animatedBuiltins.add(label);
        const groups=new Map();
        for(const st of [...window.retroStampArt.stamps,...presets.stamps]){
          if(!groups.has(st.group))groups.set(st.group,[]);
          groups.get(st.group).push(st);
        }
        for (const group of groups.keys()) if (!artGroups.includes(group)) artGroups.push(group);
        artOrder=[];
        for(let i=0;i<Math.max(...Array.from(groups.values(),group=>group.length));i++){
          for(const group of groups.values())if(i<group.length)artOrder.push(group[i]);
        }
        if (browsedLocalArt) artOrder = [...presets.stamps, ...artOrder.filter(st => !presets.stamps.includes(st))];
        resolve();
      };
      document.head.append(script);
    }).catch(error=>{artLoading=null;throw error;});
    return artLoading;
  }
  let artGroup = artGroups[0], artPage = 0;
  let objectGroup = 'Basic shapes', artPanel, artScroll = 0;
  const palette = window.retroPalette;
  const studioMedia='https://yestersites.com/assets/screening/';
  const mediaLibrary={
    'audio-music':{label:'Cassette deck',icon:'music',voice:'music',title:'Parking Lot Waltz',url:studioMedia+'parking-lot-waltz.wav'},
    'audio-radio':{label:'Radio tuner',icon:'radio',voice:'radio',title:'Dead Air 730',url:studioMedia+'station-id.mp3'},
    'audio-clip':{label:'Sound clip',icon:'clip',voice:'clip',title:'Station ID',url:studioMedia+'station-id.mp3'},
    'video-player':{label:'Movie player',icon:'film',title:'Market Street, 1906',url:studioMedia+'market-street.mp4'},
    'media-youtube':{label:'YouTube video',icon:'youtube',title:'YouTube screening',url:'https://www.youtube.com/watch?v=M7lc1UVf-VE'},
    'media-rumble':{label:'Rumble video',icon:'rumble',title:'Rumble screening',url:'https://rumble.com/embed/v17zczn/'},
    'media-internet-archive':{label:'Archive movie',icon:'archive',title:'A Trip Down Market Street',url:'https://archive.org/details/TripDown1905'}
  };
  function mediaKey(o){
    if(o.widget==='audio-player')return 'audio-'+(Object.hasOwn(RetroMedia.voices,o.audioMode)?o.audioMode:'clip');
    const ref=RetroMedia.source(o.href,o.widget);
    return ref.id?'media-youtube':ref.provider==='Rumble'?'media-rumble':ref.provider==='Internet Archive'?'media-internet-archive':'video-player';
  }
  const mediaPresets=Object.fromEntries(Object.entries(mediaLibrary).map(([key,m])=>{
    const widget=m.voice?'audio-player':'video-player';
    const [w,h]=({radio:[444,132],clip:[436,140],music:[371,147],'video-player':[354,269]})[m.voice||key]||[368,274];
    const part={kind:'box',w,h,text:m.title,href:m.url,fill:'transparent',playerSkin:m.voice||key==='video-player'?'original':'hardware'};
    if(m.voice)part.audioMode=m.voice;
    if(m.voice==='music')Object.assign(part,{secondTitle:'Busy Signal',secondSrc:'https://yestersites.com/members/modem/art/hold-music.wav'});
    if(m.voice==='radio')Object.assign(part,{secondTitle:'Night Shift',secondSrc:'https://yestersites.com/members/nightshift/station-id.wav'});
    return [key,{label:m.label,saveAs:widget,parts:[part]}];
  }));
  const widgets={...window.retroObjects.presets,...mediaPresets,...palette.shapes,...palette.web,...palette.bbs};
  const cabinetStyle=document.createElement('style');cabinetStyle.textContent=RetroMedia.css;document.head.append(cabinetStyle);
  function renderDrawer() {
    if (!$('drawer-content')) return;
    $('drawer-title').textContent = drawer === 'GIFs' ? 'GIF Stamps' : drawer;
    $('drawer').querySelector('[data-action="add-page"]').hidden = drawer !== 'Pages';
    for (const b of document.querySelectorAll('[data-drawer]')) {
      const current = b.dataset.drawer === drawer;
      b.classList.toggle('active', current);
      b.setAttribute('aria-pressed', String(current));
    }
    const root = $('drawer-content');
    root.replaceChildren();
    root.scrollTop = 0;
    if (drawer === 'Pages') {
      for (const [id, p] of M.pages(doc)) {
        const b = node('button', 'drawer-row' + (id === active ? ' selected-row' : ''));
        b.append(glyph('page'), node('span', null, id === 'home' ? 'Home' : p.title || 'Untitled'));
        b.dataset.page = id;
        b.title = p.title;
        root.append(b);
      }
    } else if (drawer === 'Video Vault') {
      vaultPanel ||= RetroStudioDrawer.videoVault(item=>{
        const offset=18*(page().items.filter(RetroMedia.isPlayer).length%4);
        insertWidget('media-youtube',24+offset,48+offset,{href:item.url,text:item.title.slice(0,120)});
      },'https://yestersites-webring.jamesmweeksjr.chatgpt.site');
      root.append(vaultPanel);
      root.scrollTop = vaultScroll;
    } else if (drawer === 'Objects') {
      const groups = node('select', 'stamp-search');
      groups.setAttribute('aria-label', 'Object group');
      for (const name of ['Basic shapes', 'Web objects', 'Media players']) groups.add(new Option(name));
      groups.value = objectGroup;
      groups.onchange=()=>{objectGroup=groups.value;renderDrawer();};
      root.append(groups);
      if(objectGroup==='Media players'){
        const vault=node('button','media-shelf-link','Search Video Vault ▸');
        vault.type='button';vault.onclick=()=>setDrawer('Video Vault');root.append(vault);
      }
      const choices=node('div','object-grid');
      root.append(choices);
      if (objectGroup === 'Basic shapes') {
        for (const [kind, name] of Object.entries(M.kinds)) {
          const b = button('', 'add-' + kind, 'object-choice');
          b.append(glyph(kind), document.createTextNode(name));
          b.draggable = true;
          b.dataset.dragType = kind;
          choices.append(b);
        }
      }
      const builtin=Object.entries({...window.retroObjects.presets,...mediaPresets}).filter(([key])=>{
        if(objectGroup==='Media players')return Object.hasOwn(mediaLibrary,key)||key==='flash-movie';
        if(Object.hasOwn(mediaLibrary,key) || key==='audio-player')return false;
        if(RetroMedia.isPanel({widget:key}))return objectGroup==='Basic shapes';
        return objectGroup==='Web objects' && !key.startsWith('bbs-');
      });
      const extra=objectGroup==='Basic shapes'?palette.shapes:objectGroup==='Web objects'?palette.web:{};
      for (const [key,spec] of [...builtin, ...Object.entries(extra)]) {
        const b=node('button','object-choice');
        const part=spec.parts[0], src=mediaLibrary[key]?'assets/instruments/'+mediaLibrary[key].icon+(matchMedia('(prefers-reduced-motion: reduce)').matches?'-still':'')+'.gif':spec.preview || (key==='counter'?counterSource(part.text):part.src);
        let icon=glyph(part.kind);
        if(src){
          icon=node('img','object-art');
          icon.alt='';icon.src=src;icon.draggable=false;
        }
        b.append(icon,document.createTextNode(spec.label));
        b.draggable=true; b.dataset.widget=key; choices.append(b);
      }
      if(objectGroup==='Basic shapes'){
        const shelf=node('button','media-shelf-link');shelf.type='button';
        const icon=node('img');icon.src='assets/instruments/music-still.gif';icon.alt='';
        shelf.append(icon,document.createTextNode('Music, sound & video ▸'));
        shelf.onclick=()=>{objectGroup='Media players';renderDrawer();};root.append(shelf);
      }
    } else {
      if (artPanel) { root.append(artPanel);refreshShelf();root.scrollTop=artScroll;return; }
      artPanel = node('div', 'art-library');
      const collection = node('select', 'stamp-search');
      collection.setAttribute('aria-label', 'Artwork collection');
      for (const name of artGroups) collection.add(new Option(name));
      collection.value = artGroup;
      const s = node('input', 'stamp-search');
      s.type = 'search';
      s.placeholder = 'Find artwork';
      s.setAttribute('aria-label', 'Find a stamp');
      s.value = filter;
      const content = node('div');
      const archiveButton=node('button', 'gifcities-link', 'Search GifCities');
      archiveButton.type='button';
      const remote=node('div'), lookup=GifCities.panel(remote, item =>
        place({kind:'image', archive:item.id, label:item.name,width:item.width,height:item.height}),
        (tile,item)=>shelf.decorate(tile,{archive:item.id,label:item.name,width:item.width,height:item.height},()=>{}));
      function searchArchive(){
        content.hidden=true;
        remote.hidden=false;
        lookup.search(s.value);
      }
      function showLocal(){
        lookup.clear();remote.hidden=true;content.hidden=false;
      }
      archiveButton.onclick=searchArchive;
      s.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();searchArchive();}};
      artPanel.append(collection,s,archiveButton,remote,content);
      root.append(artPanel);
      function fill() {
        content.replaceChildren();
        const query = filter.trim().toLowerCase();
        const libraryFilter=shelfGroups.includes(artGroup);
        let available=artOrder;
        if(artGroup==='Used on this site')available=projectArtwork();
        else if(libraryFilter){
          const used=projectArtwork();
          available=shelf.items(artGroup).map(ref=>ref.archive?
            used.find(st=>st.archive===ref.archive)||ref:
            stamps.find(st=>st.group===ref.group&&st.label===ref.label)).filter(Boolean);
        }
        const matching = available.filter(st =>
          (libraryFilter || artGroup === artGroups[0] || st.group === artGroup ||
            (artGroup === 'Animated GIFs' && (st.animated || animatedBuiltins.has(st.label)))) &&
          (st.label+' '+(st.group||'')+' '+(st.alt || '')).toLowerCase().includes(query));
        const count = 24;
        const last = Math.max(0, Math.ceil(matching.length/count)-1);
        artPage = Math.min(artPage, last);
        if (!matching.length) content.append(node('p', null, 'No matching artwork.'));
        else {
          const grid = node('div','stamp-grid'), pager = node('div','art-pager');
          const back = node('button', null, '‹'), next = node('button', null, '›');
          back.type = next.type = 'button';
          back.setAttribute('aria-label','Previous artwork'); next.setAttribute('aria-label','Next artwork');
          back.disabled = artPage === 0; next.disabled = artPage === last;
          back.onclick = () => {artPage--;fill();}; next.onclick = () => {artPage++;fill();};
          pager.append(back,node('span',null,(artPage*count+1)+'–'+Math.min((artPage+1)*count,matching.length)+' of '+matching.length),next);
          content.append(pager,grid);
          for (const st of matching.slice(artPage*count,(artPage+1)*count)) {
            const b = node('button','stamp'), im = node('img');
            b.type='button';b.draggable = true;
            if(st.archive){b.dataset.archive=st.archive;b.onclick=()=>place({kind:'image',...st});}
            else if(st.used){b.dataset.used=st.used;b.onclick=()=>place({kind:'image',...st});}
            else b.dataset.stamp = stamps.indexOf(st);
            b.title = (st.wallpaper?'Apply as page wallpaper. ':'')+(st.alt || st.label);
            im.src = st.src || 'https://blob.gifcities.org/gifcities/'+st.archive+'.gif'; im.alt = ''; im.draggable = false;
            b.append(im,node('span',null,st.label));grid.append(shelf.decorate(b,st,()=>{if(artGroup==='Favorites')fill();}));
          }
        }
        content.append(button('Artwork credits','credits','stamp-credits'));
      }
      refreshShelf=()=>{if(content.hidden||!shelfGroups.includes(artGroup))return;const top=root.scrollTop;fill();root.scrollTop=top;};
      collection.onchange = () => {showLocal();artGroup=collection.value;artPage=0;fill();};
      s.oninput = () => {showLocal();filter=s.value;artPage=0;fill();};
      content.addEventListener('pointerdown', () => { browsedLocalArt = true; });
      const libraryStatus=node('div', 'library-status');
      libraryStatus.setAttribute('role','status');
      artPanel.append(libraryStatus);
      function expandLibrary() {
        libraryStatus.textContent='Loading more artwork…';
        loadArtwork().then(()=>{
          for (const name of artGroups) {
            if (![...collection.options].some(option => option.value === name)) collection.add(new Option(name));
          }
          libraryStatus.hidden=true;
          fill();
        }).catch(()=>{
          const retry=node('button',null,'Retry artwork download');
          retry.onclick=expandLibrary;
          libraryStatus.replaceChildren(retry);
        });
      }
      fill();
      expandLibrary();
    }
  }
  function select(id) {
    selected = id;
    drawSelection();
    renderLayers();
    renderProperties();
  }
  function switchPage(id) {
    if (!M.page(doc, id)) return;
    active = id;
    selected = null;
    armed = null;
    pageBbs = id;
    bbsBack = [];
    bbsHelp = false;
    saveDraft();
    render();
    closePanels();
  }
  function renderLayers() {
    const root = $('layers'),
      top = root.scrollTop;
    root.replaceChildren();
    for (const o of [...page().items].reverse()) {
      const row = node('div', 'layer-row' + (o.id === selected ? ' selected-row' : '')),
        eye = node('button', 'eye'),
        name = node('button', 'layer-name');
      const off = hidden.has(layerKey(o.id));
      eye.dataset.eye = o.id;
      eye.setAttribute('aria-label', (off ? 'Show ' : 'Hide ') + (o.text || o.kind));
      eye.title = off ? 'Show on canvas' : 'Hide on canvas';
      eye.append(glyph(off ? 'closed' : 'eye'));
      name.dataset.layer = o.id;
      const media=RetroMedia.isPlayer(o)?mediaLibrary[mediaKey(o)]:null;
      const src=RetroCraft.isCraft(o)?widgets[o.widget].preview:media?'assets/instruments/'+media.icon+'-still.gif':o.kind==='image'?o.src:'';
      if (src) {
        const thumb = node('img');
        thumb.src = src;
        thumb.alt = '';
        name.append(thumb);
      } else name.append(glyph(o.kind));
      const text = o.text.trim().replace(/\s+/g, ' ');
      name.append(node('span', null, (media?.label||(RetroCraft.isCraft(o)?widgets[o.widget].label:M.kinds[o.kind])) + (text ? ': ' + text : '')));
      row.append(eye, name);
      root.append(row);
    }
    root.scrollTop = top;
  }
  function renderProperties() {
    const o = object();
    const media=RetroMedia.isPlayer(o)?mediaLibrary[mediaKey(o)]:null;
    $('properties-title').textContent=o?(media?.label||(RetroCraft.isCraft(o)?widgets[o.widget].label:M.kinds[o.kind]))+' Properties':'Properties';
    $('properties').querySelector('[data-action=properties]').textContent=media?'Edit '+media.label.toLowerCase()+'…':'Edit object…';
    for (const k of ['x', 'y', 'w', 'h', 'text']) {
      const c = $('prop-' + k);
      c.value = o ? o[k] : '';
      c.disabled = !o || (k === 'text' && o.kind === 'rule');
    }
    $('properties').querySelector('[data-action=fallback]').hidden=!(RetroCraft.isCraft(o)||RetroMedia.isPlayer(o)||RetroMedia.isFrame(o));
    $('prop-caption').textContent = media?'Player title':o?.widget === 'counter' ? 'Counter digits' : o?.kind === 'image' ? 'Alt text' : 'Text';
    for (const c of $('properties').querySelectorAll('button')) c.disabled = !o;
  }
  function renderBbs() {
    if (!M.page(doc, pageBbs)) pageBbs = active;
    $('bbs-width').value = String(bbsWidth);
    $('terminal').style.setProperty('--phosphor', phosphors[bbsColor]);
    $('bbs-lines').innerHTML = bbsHelp
      ? 'TERMINAL HELP\n\n1…9  Follow a link\nH    Go Home\nB    Go back\n?    Help\n\nB returns to your page.'
      : RetroBbs.toHTML(M.terminal(doc,pageBbs,bbsWidth));
  }
  function geometry(el, o) {
    for (const k of ['x', 'y', 'w', 'h'])
      el.style[{ x: 'left', y: 'top', w: 'width', h: 'height' }[k]] = o[k] + 'px';
  }
  function drawObjects() {
    const paper = $('paper');
    paper.replaceChildren();
    if(page().pageStyles){
      const css=node('style');css.textContent=RetroCraft.pageCSS(page().pageStyles,'#paper');paper.append(css);
    }
    paper.style.width = page().width + 'px';
    paper.style.height = page().height + 'px';
    paper.style.backgroundColor = page().background;
    for (const [i, o] of page().items.entries()) {
      const el = node('div', 'canvas-object rp-'+o.kind);
      el.dataset.object = o.id;
      el.title = o.kind === 'image' ? o.text : '';
      el.hidden = hidden.has(layerKey(o.id));
      geometry(el, o);
      Object.assign(el.style, {
        zIndex: i + 1,
        background: o.kind === 'rule' ? o.color : o.fill || 'transparent',
        color: o.color,
        fontFamily: M.fonts[o.font_family],
        fontSize: o.font_size + 'px',
        fontWeight: o.bold ? 'bold' : 'normal',
        fontStyle: o.italic ? 'italic' : 'normal',
        textAlign: o.align,
        textDecoration: o.href || o.kind === 'link' ? 'underline' : 'none',
      });
      if (o.kind === 'box') el.style.boxShadow = 'inset 0 0 0 1px ' + o.color;
      const src = M.appearance(o);
      if(RetroCraft.isCraft(o)){
        const face=node('div','craft-face');face.inert=true;
        if(o.widget==='html-block')face.innerHTML=RetroCraft.render(o,'modern');
        else {const icon=node('img');icon.src='assets/instruments/flash-still.gif';icon.alt='';face.classList.add('flash-face');face.append(icon,node('strong',null,o.text),node('small',null,'Flash movie · Ruffle'));}
        el.append(face);
      }else if(RetroMedia.isBorder(o)){el.style.border='6px '+RetroMedia.borderStyles[o.widget]+' '+o.color;el.style.boxShadow='none';}
      else if(RetroMedia.isFrame(o)){
        const pane=node('div','editor-frame');
        if(o.widget==='split-frame'){const rail=node('div','editor-frame-menu');rail.append(node('strong',null,'INDEX'),node('span',null,o.text),node('span',null,o.otherLabel));pane.append(rail);}
        pane.append(node('span','editor-frame-content',o.text+'  ▧'));el.append(pane);
      } else if (RetroMedia.isPlayer(o)) {
        if(o.widget==='video-player' || o.playerSkin==='hardware' || o.playerSkin==='original'){
          const face=node('div','instrument-poster');face.inert=true;face.innerHTML=RetroMedia.poster(o);el.append(face);
        }else{
        const deck=node('div','player-face');
        deck.dataset.skin=o.playerSkin||'deck';deck.append(node('strong',null,(o.widget==='audio-player'?RetroMedia.voices[o.audioMode]||'Wave Deck':RetroMedia.skins[o.playerSkin]||'Vision Deck')+' · '+o.text),node('span',null,o.widget==='audio-player'?'▂ ▄ ▆ ▃ ▇ ▅ ▂':'▶'),node('small',null,'▶   ▪   ━━━━━━'));
        el.append(deck);
        }
      } else if (src) {
        const im = node('img');
        im.src = src;
        im.alt = o.text;
        el.append(im);
      } else if (o.kind !== 'rule') el.textContent = o.text || (o.kind === 'image' ? 'Image' : '');
      paper.append(el);
    }
    paper.classList.toggle('grid', grid);
    paper.classList.toggle('pick-target', !!armed);
    drawSelection();
    fit();
  }
  function drawSelection() {
    const paper = $('paper');
    paper.querySelector('.selection')?.remove();
    const o = object();
    if (!o || hidden.has(layerKey(o.id)) || editing) return;
    const rect = node('div', 'selection');
    geometry(rect, o);
    for (const [dir, x, y] of [
      ['nw', 0, 0],
      ['n', 50, 0],
      ['ne', 100, 0],
      ['w', 0, 50],
      ['e', 100, 50],
      ['sw', 0, 100],
      ['s', 50, 100],
      ['se', 100, 100],
    ]) {
      const h = node('i', 'handle');
      h.dataset.handle = dir;
      h.style.left = x + '%';
      h.style.top = y + '%';
      h.style.cursor = dir + '-resize';
      rect.append(h);
    }
    paper.append(rect);
  }
  function fit() {
    const v = $('viewport'),
      p = page(),
      margin = 14;
    if (!v.clientWidth || !p) return;
    scale =
      zoom === 'fit'
        ? M.clamp(
            Math.min((v.clientWidth - margin) / p.width, (v.clientHeight - margin) / p.height),
            0.18,
            1.5,
          )
        : Number(zoom);
    $('paper').style.transform = 'scale(' + scale + ')';
    $('paper-size').style.width = p.width * scale + 'px';
    $('paper-size').style.height = p.height * scale + 'px';
    $('zoom-status').textContent = Math.round(scale * 100) + '%';
    drawRulers();
  }
  function drawRulers() {
    const v = $('viewport');
    for (const [sel, horizontal, size] of [
      ['.top-ruler', true, page().width],
      ['.left-ruler', false, page().height],
    ]) {
      const root = document.querySelector(sel);
      root.replaceChildren();
      const offset = horizontal ? v.scrollLeft : v.scrollTop,
        limit = horizontal ? root.clientWidth : root.clientHeight;
      const tick = scale < 0.55 ? 16 : 8;
      for (let n = 0; n <= size; n += tick) {
        const pos = 7 + n * scale - offset;
        if (pos < -19 || pos > limit + 3) continue;
        const major = n % (tick * 8) === 0;
        const mark = node(major ? 'b' : 'i', null, major ? String(n) : '');
        mark.style[horizontal ? 'left' : 'top'] = pos + 'px';
        root.append(mark);
      }
    }
  }
  function render() {
    $('window-title').textContent = 'Retro Page — ' + (doc.title || 'Untitled homepage');
    document.title = 'Retro Page — ' + (doc.title || 'Untitled homepage');
    $('page-status').textContent = active === 'home' ? 'Home' : page().title;
    $('size-status').textContent = page().width + ' × ' + page().height;
    if (drawer === 'Pages' || !$('drawer-content').childElementCount) renderDrawer();
    drawObjects();
    renderLayers();
    renderProperties();
    renderBbs();
    bbsEditor.refresh();
    for (const b of document.querySelectorAll('[data-action="undo"]')) b.disabled = at === 0;
    for (const b of document.querySelectorAll('[data-action="redo"]'))
      b.disabled = at === hist.length - 1;
    for (const b of $('toolbar').querySelectorAll('[data-action^="add-"]'))
      b.setAttribute('aria-pressed', String(!!armed && b.dataset.action === 'add-' + armed.kind));
  }
  function point(ev) {
    const r = $('paper').getBoundingClientRect();
    return [Math.round((ev.clientX - r.left) / scale), Math.round((ev.clientY - r.top) / scale)];
  }
  function snapped(v) {
    return snap ? Math.round(v / 8) * 8 : Math.round(v);
  }
  function editInline() {
    const o = object();
    if (!o || !['text', 'link', 'box'].includes(o.kind) || hidden.has(layerKey(o.id))) return;
    finishInline(true);
    const el = node('textarea', 'inline-edit');
    editing = el;
    geometry(el, o);
    el.value = o.text;
    el.maxLength = 8000;
    el.style.background = o.fill || '#fffdf5';
    el.style.color = o.fill ? o.color : '#222';
    el.style.fontFamily = M.fonts[o.font_family];
    el.style.fontSize = Math.min(o.font_size, 28) + 'px';
    $('paper').append(el);
    drawSelection();
    el.focus();
    el.select();
    el.onkeydown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        finishInline(false);
      }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        finishInline(true);
      }
    };
    el.onblur = () => finishInline(true);
  }
  function finishInline(save) {
    if (!editing) return;
    const e = editing,
      o = object(),
      value = e.value;
    editing = null;
    e.onblur = null;
    e.remove();
    if (save && o && o.text !== value) {
      o.text = value;
      record('Updated text.');
    } else drawSelection();
  }
  function resize(o, b, dir, dx, dy) {
    let l = b.x,
      t = b.y,
      r = l + b.w,
      bottom = t + b.h;
    const minX = Math.min(6, b.w),
      minY = Math.min(4, b.h);
    if (dir.includes('w')) l = M.clamp(snapped(l + dx), 0, r - minX);
    if (dir.includes('e')) r = M.clamp(snapped(r + dx), l + minX, page().width);
    if (dir.includes('n')) t = M.clamp(snapped(t + dy), 0, bottom - minY);
    if (dir.includes('s')) bottom = M.clamp(snapped(bottom + dy), t + minY, page().height);
    Object.assign(o, { x: l, y: t, w: r - l, h: bottom - t });
  }
  const paper = $('paper');
  paper.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target === editing) return;
    if (armed) {
      e.preventDefault();
      const [x, y] = point(e);
      const data = armed;
      armed = null;
      paper.classList.remove('pick-target');
      insert(data, x, y).catch((er) => status(er.message));
      return;
    }
    finishInline(true);
    const handle = e.target.closest('[data-handle]'),
      el = e.target.closest('[data-object]');
    const id = handle ? selected : el?.dataset.object || null;
    select(id);
    if (!id) return;
    const o = object();
    gesture = {
      pid: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      before: { x: o.x, y: o.y, w: o.w, h: o.h },
      dir: handle?.dataset.handle || 'move',
    };
    paper.setPointerCapture(e.pointerId);
    $('viewport').focus({ preventScroll: true });
    e.preventDefault();
  });
  paper.addEventListener('pointermove', (e) => {
    if (!gesture || gesture.pid !== e.pointerId) return;
    const o = object(),
      g = gesture,
      b = g.before,
      dx = (e.clientX - g.startX) / scale,
      dy = (e.clientY - g.startY) / scale;
    if (g.dir === 'move') {
      o.x = M.clamp(snapped(b.x + dx), 0, page().width - o.w);
      o.y = M.clamp(snapped(b.y + dy), 0, page().height - o.h);
    } else resize(o, b, g.dir, dx, dy);
    const el = [...paper.querySelectorAll('[data-object]')].find((n) => n.dataset.object === o.id);
    if (el) geometry(el, o);
    drawSelection();
    renderProperties();
  });
  function gestureEnd(cancel) {
    if (!gesture) return;
    const o = object(),
      b = gesture.before,
      pid = gesture.pid;
    gesture = null;
    if (paper.hasPointerCapture(pid)) paper.releasePointerCapture(pid);
    if (cancel && o) Object.assign(o, b);
    if (cancel) drawObjects();
    else if (o && Object.keys(b).some((k) => o[k] !== b[k])) record('Updated object position and size.');
    else drawSelection();
  }
  paper.addEventListener('pointerup', () => gestureEnd(false));
  paper.addEventListener('pointercancel', () => gestureEnd(true));
  paper.addEventListener('dblclick', (e) => {
    const o = object();
    if (!o || !e.target.closest('[data-object]')) return;
    (RetroCraft.isCraft(o) || RetroMedia.isPanel(o) || RetroMedia.isPlayer(o) || ['image', 'rule', 'link'].includes(o.kind)) ? properties() : editInline();
  });
  function place(data) {
    armed = data;
    closePanels();
    drawObjects();
    status('Click the page to place ' + (data.label || M.kinds[data.kind]) + '. Esc cancels.');
    for (const b of $('toolbar').querySelectorAll('[data-action^="add-"]'))
      b.setAttribute('aria-pressed', String(b.dataset.action === 'add-' + data.kind));
  }
  function counterSource(digits) {
    if (!/^[0-9]{1,12}$/.test(digits)) throw Error('Enter 1–12 counter digits, including any leading zeroes.');
    const image=document.createElement('canvas');
    image.width=digits.length*12+4; image.height=20;
    const ctx=image.getContext('2d');
    const rect=(x,y,w,h,c)=>{ctx.fillStyle=c;ctx.fillRect(x,y,w,h);};
    rect(0,0,image.width,20,'#889298');rect(1,1,image.width-2,18,'#171d22');
    [...digits].forEach((ch,i)=>{
      const x=2+12*i;
      rect(x,2,11,16,'#283239');rect(x,10,11,1,'#161d22');
      [...window.retroObjects.digits[ch]].forEach((bit,j)=>{
        if (bit==='1') rect(x+2+2*(j%3),4+2*Math.floor(j/3),2,2,'#ffda86');
      });
    });
    return image.toDataURL('image/png');
  }
  async function mediaLink(value,widget) {
    let raw=value.trim(),u;
    if(raw.startsWith('<iframe')) {
      const match=raw.match(/^<iframe\s[^>]*?\bsrc=["'](https:\/\/rumble\.com\/embed\/v[a-z0-9]+\/?(?:\?[^"'<>]*)?)["']/i);
      if(!match)throw Error('Paste a video URL or a Rumble iframe embed.');
      raw=match[1].replace(/&amp;/g,'&');
    }
    try{u=new URL(raw);}catch{}
    if(widget==='video-player' && u?.protocol==='https:' && ['rumble.com','www.rumble.com'].includes(u.hostname) && /^\/v[a-z0-9]+(?:[-.][^/]*)?$/i.test(u.pathname)){
      try{
        const r=await fetch('https://yestersites-webring.jamesmweeksjr.chatgpt.site/api/media/rumble?'+new URLSearchParams({url:raw}),{credentials:'omit',signal:AbortSignal.timeout(15000)});
        if(!r.ok)throw Error();raw=(await r.json()).embed;
      }catch{throw Error('Rumble could not resolve this video. Paste the iframe URL from Rumble’s Share / Embed menu.');}
    }
    return RetroMedia.source(raw,widget).url;
  }
  function playerDialog(o) {
    const key=mediaKey(o),m=mediaLibrary[key],pageAtOpen=page();
    const options={
      'audio-music':['Cassette label','Side A · music file','Tape deck','Play on arrival','Repeat this side'],
      'audio-radio':['Station name','Station 1 · stream address','Receiver','Tune in on arrival'],
      'audio-clip':['Clip name','Sound file','Sound recorder','Play when the page opens','Loop sound effect'],
      'video-player':['Movie title','Movie file','Projection booth','Start movie on arrival','Loop movie'],
      'media-youtube':['Video title','YouTube watch or share URL','YouTube player','Start video on arrival','Loop video'],
      'media-rumble':['Video title','Rumble video or Share / Embed address','Rumble player'],
      'media-internet-archive':['Item title','Archive.org movie identifier or item URL','Archive projectionist']
    }[key];
    const [name,sourceLabel,section,arrival,loopLabel]=options;
    const fields=[
      {name:'text',label:name,value:o.text,required:true,maxLength:120,section},
      {name:'media',label:sourceLabel,value:o.href,required:true,maxLength:2048,section}
    ];
    if(key==='media-youtube')fields.push({name:'start',type:'number',label:'Start video at (seconds)',min:0,max:604800,value:RetroMedia.source(o.href,o.widget).start||0,section});
    if(key==='audio-music' || key==='audio-radio')fields.push({name:'secondSrc',label:key==='audio-music'?'Side B · second track (optional)':'Station 2 · second stream (optional)',value:o.secondSrc||'',maxLength:2048,section});
    if(key==='audio-music' || key==='audio-radio')fields.push({name:'secondTitle',label:key==='audio-music'?'Side B label':'Station 2 name',value:o.secondTitle||'',maxLength:120,section});
    if(key==='video-player' || m.voice)fields.push({name:'alternateSrc',label:key==='video-player'?'Alternate movie encoding (optional)':'Backup audio source (optional)',value:o.alternateSrc||'',maxLength:2048,section});
    if(arrival)fields.push({name:'autoplay',label:arrival,type:'checkbox',value:o.autoplay,section:'Playback'});
    if(loopLabel)fields.push({name:'loop',label:loopLabel,type:'checkbox',value:o.loop,section:'Playback'});
    fields.push({name:'playerSkin',label:'Window style',type:'select',options:Object.entries(o.widget==='video-player'?RetroMedia.movieStyles:RetroMedia.skins).filter(([style])=>style!=='original'||!key.startsWith('media-')),value:o.playerSkin||(o.widget==='video-player'?'hardware':'deck'),section:'Appearance'});
    const apply=async v=>{
      const entered=key==='media-internet-archive' && /^[a-zA-Z0-9._-]+$/.test(v.media.trim())?'https://archive.org/details/'+v.media.trim():v.media;
      let href=await mediaLink(entered,o.widget);
      if(key==='media-youtube'){
        const ref=RetroMedia.source(href,o.widget);if(!ref.id)throw Error('Enter a YouTube video address.');
        const seconds=Number(v.start);
        if(!Number.isInteger(seconds)||seconds<0||seconds>604800)throw Error('Enter a start time between 0 and 604800 seconds.');
        const typedFreshLink=href!==o.href && seconds===(RetroMedia.source(o.href,o.widget).start||0);
        const start=typedFreshLink?ref.start:seconds;
        href='https://www.youtube.com/watch?v='+ref.id+(start?'&t='+start:'');
      }
      if(!$('dialog').open || dialogAccept!==apply || pageAtOpen!==page())return;
      if(mediaKey({...o,href})!==key)throw Error('Use the '+m.label+' source shown above. Other players are in the Media players drawer.');
      applyObject(o,{text:v.text,href,playerSkin:v.playerSkin,alternateSrc:v.alternateSrc?RetroMedia.source(v.alternateSrc,o.widget).url:'',
        secondTitle:v.secondTitle||'',secondSrc:v.secondSrc?RetroMedia.source(v.secondSrc,'audio-player').url:'',autoplay:!!v.autoplay,loop:!!v.loop});
    };
    dialog(m.label+' properties',fields,apply,'Apply');
    const pane=node('div','instrument-preview'),form=$('dialog-fields');
    form.prepend(pane);
    function silence(){
      for(const media of pane.querySelectorAll('audio,video'))media.pause();
    }
    function audition(){
      silence();
      const draft={...o,href:form.querySelector('[name=media]').value,text:form.querySelector('[name=text]').value,playerSkin:form.querySelector('[name=playerSkin]').value,
        alternateSrc:form.querySelector('[name=alternateSrc]')?.value||'',secondTitle:form.querySelector('[name=secondTitle]')?.value||'',secondSrc:form.querySelector('[name=secondSrc]')?.value||'',autoplay:false,loop:!!form.querySelector('[name=loop]')?.checked};
      try{
        if(key==='media-internet-archive' && /^[a-zA-Z0-9._-]+$/.test(draft.href.trim()))draft.href='https://archive.org/details/'+draft.href.trim();
        if(key==='media-youtube'){
          const ref=RetroMedia.source(draft.href,o.widget);
          if(ref.id)draft.href='https://www.youtube.com/watch?v='+ref.id+'&t='+(Number(form.querySelector('[name=start]').value)||0);
        }
        pane.innerHTML=RetroMedia.render(draft,'modern');RetroMedia.mount(pane);
      }catch{pane.textContent='Enter a playable source to preview it here.';}
    }
    form.addEventListener('change',audition);audition();
    $('dialog').addEventListener('close',()=>{form.removeEventListener('change',audition);silence();pane.replaceChildren();},{once:true});
  }
  function craftDialog(o,insertOnApply=false){
    const isFlash=o.widget==='flash-movie',label=widgets[o.widget].label;
    const fields=[{name:'text',label:isFlash?'Movie title and classic-browser description':'Block title',value:o.text,required:true,maxLength:120}];
    if(isFlash)fields.push({note:'Import a self-contained SWF. Each page holds up to 768 KiB. Visitors choose when to play.'});
    else fields.push({name:'markup',label:'HTML fragment',type:'textarea',maxLength:8192,value:o.markup},
      {name:'styles',label:'CSS for this block',type:'textarea',maxLength:4096,value:o.styles});
    let swf=o.swf,reading=false,fileError='',sequence=0;
    dialog(isFlash ? label+' properties' : 'HTML / CSS editor',fields,v=>{
      if(reading)throw Error('Wait for the selected file to finish loading.');
      if(fileError)throw Error(fileError);
      const values=isFlash?{swf,text:v.text}:{text:v.text,markup:v.markup,styles:v.styles};
      RetroCraft.fields({...o,...values});
      if(insertOnApply){
        const p=page(), item={...o,...values};
        const candidate={...p,items:[...p.items,item]};
        M.normalize(p===doc?candidate:{...doc,pages:doc.pages.map(child=>child===p?candidate:child)});
        p.items.push(item);
        selected=item.id;
        record('Added HTML / CSS block.');
      }else applyObject(o,values);
    },insertOnApply?'Insert on page':'Apply');
    const root=$('dialog-fields'),preview=node('div','craft-preview'),feedback=node('small');
    feedback.setAttribute('role','status');
    const refresh=()=>{
      const v={...o,text:root.querySelector('[name=text]').value,swf};
      if(!isFlash){v.markup=root.querySelector('[name=markup]').value;v.styles=root.querySelector('[name=styles]').value;}
      try{preview.innerHTML=RetroCraft.render(v,'modern');feedback.textContent='';}catch(error){preview.replaceChildren();feedback.textContent=error.message;}
    };
    if(isFlash){
      const label=node('label',null,'SWF file'),input=node('input'),info=node('output');
      info.textContent=swf==='demo'?'Original sample: Comet flyby':'Imported movie · '+Math.ceil(RetroCraft.swfBytes(swf)/1024)+' KiB';
      input.type='file';input.accept='.swf,application/x-shockwave-flash';label.append(input,info);root.append(label);
      input.onchange=async()=>{
        const file=input.files[0],current=++sequence;if(!file){reading=false;return;}
        reading=true;
        try{
          if(file.size>RetroCraft.maxBytes)throw Error('Choose a SWF of 768 KiB or less.');
          const buf=new Uint8Array(await file.arrayBuffer());let raw='';
          for(let i=0;i<buf.length;i+=8192)raw+=String.fromCharCode(...buf.subarray(i,i+8192));
          const data=btoa(raw);RetroCraft.swfBytes(data);if(current!==sequence||!root.contains(input))return;
          fileError='';swf=data;info.textContent=file.name+' · '+Math.ceil(file.size/1024)+' KiB';refresh();
        }catch(error){input.value='';fileError=error.message;feedback.textContent=fileError;}finally{if(current===sequence)reading=false;}
      };
    }else{
      const help=node('details'),head=node('summary',null,'Supported HTML and CSS');
      help.append(head,node('p',null,'Use headings, paragraphs, spans, divs, lists, tables and text formatting. Use quoted class and style attributes. CSS supports element and class selectors, typography, colors, spacing, borders, shadows, flex and grid. Use literal values such as 2px, 90% or #ffd866.'));
      root.append(help);
      for(const field of root.querySelectorAll('textarea')){field.spellcheck=false;field.oninput=refresh;}
    }
    root.append(feedback,preview);refresh();
    $('dialog').addEventListener('close',()=>{preview.replaceChildren();},{once:true});
  }
  function frameDialog(o,isNew){
    const p=page(),split=o.widget==='split-frame';
    const fields=(prefix,label,href)=>[
      {name:prefix+'Label',label:'Link label',section:label,value:prefix==='first'?o.text:o.otherLabel||'More',required:true},
      ...linkFields(href||'').map(f=>({...f,section:label,name:prefix+f.name,options:f.options?.filter(([id])=>id!==active)}))];
    dialog(widgets[o.widget].label,[...fields('first','Opening page',o.href),...(split?fields('next','Second menu link',o.otherHref):[]),
      {note:'Some websites block embedding. Readers can always use Open page.'}],v=>{
      const url=prefix=>RetroMedia.frameURL(v[prefix+'target']?'page:'+v[prefix+'target']:M.webAddress(v[prefix+'href']));
      const values={text:v.firstLabel,href:url('first'),...(split?{otherLabel:v.nextLabel,otherHref:url('next')}:{})};
      if(!isNew)return applyObject(o,values);
      if(p.items.length>=64)throw Error('This page supports up to 64 objects.');
      const candidate={...o,...values};
      RetroMedia.checkFrames(M.pages(doc).map(([key,page])=>[key,page===p?{...p,items:[...p.items,candidate]}:page]));
      p.items.push(candidate);selected=o.id;record('Placed '+widgets[o.widget].label+'.');
    },isNew?'Insert':'Apply');
  }
  function insertWidget(key,x,y,values={}) {
    const p=page(), spec=widgets[key], parts=spec.parts;
    const gw=Math.max(...parts.map(part=>(part.dx||0)+part.w));
    const gh=Math.max(...parts.map(part=>(part.dy||0)+part.h));
    const scale=Math.min(1,p.width/gw,p.height/gh);
    x=M.clamp(x,0,p.width-Math.floor(gw*scale));
    y=M.clamp(y,0,p.height-Math.floor(gh*scale));
    const objects=parts.map(({dx=0,dy=0,...part})=>{
      const o={...M.item(part.kind,0,0,p),...part,...values,
        x:x+Math.floor(scale*dx),y:y+Math.floor(scale*dy),w:Math.max(1,Math.floor(scale*part.w)),h:Math.max(1,Math.floor(scale*part.h))};
      const storedWidget = Object.hasOwn(spec,'saveAs') ? spec.saveAs : key;
      if (storedWidget) o.widget = storedWidget;
      if (key==='counter') o.src=counterSource(o.text);
      if (key==='bbs-menu' || (storedWidget==='bbs-menu' && !o.href)) o.href='page:'+(M.pages(doc).find(([id])=>id!==active)?.[0]||'home');
      if (key==='wallpaper') Object.assign(o,{x:0,y:0,w:p.width,h:p.height});
      return o;
    });
    if(RetroMedia.isFrame(objects[0]))return frameDialog(objects[0],true);
    if(RetroMedia.isPlayer(objects[0]) || RetroCraft.isCraft(objects[0])){
      const candidate={...p,items:[...p.items,...objects]};
      M.normalize(p===doc?candidate:{...doc,pages:doc.pages.map(child=>child===p?candidate:child)});
      p.items.push(...objects);selected=objects[0].id;
      record('Placed '+spec.label+'. Double-click it to edit.');return;
    }
    const prior=p.items[0],replace=key==='wallpaper'&&prior?.kind==='image'&&!prior.text.trim()&&!prior.href&&prior.x===0&&prior.y===0&&prior.w===p.width&&prior.h===p.height;
    if (p.items.length + objects.length - Number(!!replace)>64) throw Error('This page supports up to 64 objects.');
    if (key==='wallpaper') p.items.splice(0,replace?1:0,...objects);
    else p.items.push(...objects);
    selected=objects[0].id;
    record('Placed '+spec.label+'. Double-click to edit.');
  }
  async function insert(data, x, y) {
    if (data.widget) return insertWidget(data.widget,x,y);
    if (page().items.length >= 64) throw Error('A page supports up to 64 objects.');
    const p = page(),
      id = active,
      o = M.item(data.kind, x, y, p);
    const rgb = p.background
      .slice(1)
      .match(/../g)
      .map((v) => parseInt(v, 16));
    if (rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114 < 100 && ['text', 'link'].includes(o.kind))
      o.color = o.kind === 'link' ? '#ffdf78' : '#fff2be';
    if (data.wallpaper) {
      const tile = new Image();tile.src=data.src;await tile.decode();
      if (active!==id || p!==page()) return;
      if (p.width*p.height>6000000 || p.height>4096) throw Error('Use a page of up to six megapixels and 4096 pixels high for tiled wallpaper.');
      const sheet=document.createElement('canvas');sheet.width=p.width;sheet.height=p.height;
      const ctx=sheet.getContext('2d');ctx.fillStyle=ctx.createPattern(tile,'repeat');ctx.fillRect(0,0,p.width,p.height);
      const src=sheet.toDataURL('image/png');M.imageType(src);
      Object.assign(o,{x:0,y:0,w:p.width,h:p.height,src,text:'',widget:'wallpaper'});
      const first=p.items[0];
      const replace=first && first.kind==='image' && !first.text.trim() && !first.href && !first.x && !first.y && first.w===p.width && first.h===p.height;
      if(data.group)o.artRef=shelf.describe(data);shelf.remember(data);
      p.items.splice(0,replace?1:0,o);selected=o.id;record('Applied '+data.label+' as page wallpaper.');return;
    }
    if (data.archive && !data.src) {
      status('Loading ' + data.label + ' from GifCities…');
      data = {...data, src:await GifCities.imageData(data.archive)};
    }
    if (data.src) {
      const [w, h] = await M.dimensions(data.src);
      if (active !== id || p !== page()) return;
      const scale = Math.min(1, p.width / w, p.height / h, (data.stamp_width || w) / w);
      o.w = Math.max(1, Math.round(w * scale));
      o.h = Math.max(1, Math.round(h * scale));
      o.x = M.clamp(x, 0, p.width - o.w);
      o.y = M.clamp(y, 0, p.height - o.h);
      o.src = data.src;
      o.text = data.alt || data.label || 'Image';
    }
    if (o.kind === 'link') {
      drawObjects();
      dialog('Insert link', [
        {name:'text', label:'Link text', value:o.text, required:true, maxLength:8000},
        ...linkFields(''),
      ], values => {
        const href = linkValue(values);
        if (!href) throw Object.assign(Error('Enter a web address or choose a page in this site.'), {field:'href'});
        if (p.items.length >= 64) throw Error('A page supports up to 64 objects.');
        Object.assign(o, {text:values.text, href});
        p.items.push(o);
        selected = o.id;
        record('Placed link.');
      }, 'Insert');
      return;
    }
    if (p.items.length >= 64) throw Error('A page supports up to 64 objects.');
    if(data.src && (data.group||data.archive)){o.artRef=shelf.describe(data);shelf.remember(data);}
    p.items.push(o);
    selected = o.id;
    record('Placed ' + M.kinds[o.kind] + '.');
    if (o.kind === 'text') editInline();
  }
  function linkFields(href) {
    const internal = href.startsWith('page:');
    return [
      {name:'href', label:'Web address', section:'Link destination', value:internal ? '' : href, maxLength:2048},
      {name:'target', label:'Or link to page', section:'Link destination', type:'select',
        options:[['', 'Choose a page…'], ...M.pages(doc).map(([id, p]) => [id, id === 'home' ? 'Home' : p.title])],
        value:internal ? href.slice(5) : ''},
    ];
  }
  function linkValue(values) {
    return values.target ? 'page:' + values.target : M.webAddress(values.href);
  }
  function properties() {
    const o = object();
    if (!o) return status('Select an object on the page.');
    if (RetroCraft.isCraft(o)) return craftDialog(o);
    if (RetroMedia.isFrame(o)) return frameDialog(o,false);
    if (RetroMedia.isPlayer(o)) return playerDialog(o);
    const fields =
      o.kind === 'rule'
        ? []
        : [
            {
              name: 'text',
              label: o.widget === 'counter' ? 'Counter digits' : o.kind === 'image' ? 'Alt text' : 'Text',
              type: 'textarea',
              value: o.text,
              maxLength: 8000,
            },
          ];
    for (const [name, label, max] of [
      ['x', 'X position', page().width - 1],
      ['y', 'Y position', page().height - 1],
      ['w', 'Width', page().width],
      ['h', 'Height', page().height],
    ])
      fields.push({
        name,
        label,
        type: 'number',
        value: o[name],
        min: 'xy'.includes(name) ? 0 : 1,
        max,
        required: true,
      });
    if (o.kind !== 'rule') fields.splice(1, 0, ...linkFields(o.href));
    if (['text', 'link', 'box'].includes(o.kind))
      fields.push(
        {
          name: 'font_family',
          label: 'Typeface',
          type: 'select',
          options: Object.keys(M.fonts),
          value: o.font_family,
        },
        {
          name: 'font_size',
          label: 'Type size (px)',
          type: 'number',
          min: 6,
          max: 160,
          value: o.font_size,
          required: true,
        },
        {
          name: 'align',
          label: 'Alignment',
          type: 'select',
          options: ['left', 'center', 'right'],
          value: o.align,
        },
        { name: 'bold', label: 'Bold', type: 'checkbox', value: o.bold },
        { name: 'italic', label: 'Italic', type: 'checkbox', value: o.italic },
      );
    fields.push(
      { name: 'color', label: 'Ink', type: 'color', value: o.color },
      { name: 'fill', label: 'Fill (hex or blank for transparent)', value: o.fill },
    );
    for (const f of fields) {
      if (['x','y','w','h'].includes(f.name)) f.section = 'Position and size';
      else if (['href','target'].includes(f.name)) f.section = 'Link destination';
      else if (f.name !== 'text') f.section = 'Appearance';
    }
    dialog(
      M.kinds[o.kind] + ' properties',
      fields,
      (v) => {
        if ('target' in v) {
          v.href = linkValue(v);
          delete v.target;
        }
        for (const k of ['x', 'y', 'w', 'h', 'font_size']) if (k in v) v[k] = Number(v[k]);
        applyObject(o, v);
      },
      'Apply',
    );
  }
  function applyObject(o, values) {
    if(o.widget==='counter' && 'text' in values) values={...values,src:counterSource(values.text)};
    const candidate = { ...o, ...values };
    const p = page();
    const test = {
      ...doc,
      pages: (doc.pages || []).map((child) =>
        child === p ? { ...child, items: child.items.map((i) => (i === o ? candidate : i)) } : child,
      ),
    };
    if (p === doc) test.items = doc.items.map((i) => (i === o ? candidate : i));
    M.normalize(test);
    Object.assign(o, values);
    record('Applied object properties.');
  }
  $('properties').onsubmit = (e) => {
    e.preventDefault();
    const o = object();
    if (!o) return;
    try {
      const v = {};
      for (const k of ['x', 'y', 'w', 'h']) v[k] = Number($('prop-' + k).value);
      if (o.kind !== 'rule') v.text = $('prop-text').value;
      applyObject(o, v);
    } catch (err) {
      status(err.message);
    }
  };
  function pageSettings() {
    const p = page();
    const fields = [
      { name: 'title', label: 'Page title', value: p.title, maxLength: 80, required: true },
      { name: 'byline', label: 'Webmaster', value: p.byline, maxLength: 48 },
      {
        name: 'width',
        label: 'Width (px)',
        type: 'number',
        min: 160,
        max: 2048,
        value: p.width,
        required: true,
      },
      {
        name: 'height',
        label: 'Height (px)',
        type: 'number',
        min: 120,
        max: 8192,
        value: p.height,
        required: true,
      },
      { name:'soundtrack', label:'Soundtrack or live stream (HTTPS audio URL)', value:p.soundtrack||'', maxLength:2048 },
      { name: 'background', label: 'Background color', type: 'color', value: p.background },
      {
        name: 'profile',
        label: 'Page format',
        type: 'select',
        options: [
          ['classic', '1990s graphical'],
          ['millennium', 'Early 2000s'],
          ['text', 'Text-first HTML'],
        ],
        value: p.profile,
      },
    ];
    if (active === 'home')
      fields.push(
        { name: 'slug', label: 'YesterSites address', value: p.slug, maxLength: 40 },
        {
          name: 'listed',
          label: 'List in the YesterSites directory',
          type: 'checkbox',
          value: p.listed,
        },
      );
    dialog(
      'Page settings',
      fields,
      (v) => {
        v.soundtrack=v.soundtrack.trim();
        v.width = Number(v.width);
        v.height = Number(v.height);
        const test =
          p === doc
            ? { ...doc, ...v }
            : { ...doc, pages: doc.pages.map((child) => (child === p ? { ...p, ...v } : child)) };
        M.normalize(test);
        Object.assign(p, v);
        record('Saved page settings.');
      },
      'Apply',
    );
  }
  function addPage() {
    if (M.pages(doc).length >= 24) return status('A site supports up to 24 pages.');
    dialog(
      'Add page',
      [{ name: 'title', label: 'Page title', value: '', maxLength: 80, required: true }],
      (v) => {
        const p = M.blank(v.title.trim());
        p.page_id = M.uid();
        p.background = page().background;
        (doc.pages || (doc.pages = [])).push(p);
        switchPage(p.page_id);
        setDrawer('Pages');
        record('Added a page.');
      },
      'Add',
    );
  }
  function duplicatePage() {
    if (M.pages(doc).length >= 24) return status('A site supports up to 24 pages.');
    const original = page(),
      p = M.copy({ ...original, pages: undefined });
    delete p.pages;
    p.page_id = M.uid();
    for (const block of p.bbsScreen || []) if (block.href === 'page:'+active) block.href='page:'+p.page_id;
    for (const o of p.items) {
      o.id = M.uid();
      if (o.href === 'page:' + active) o.href = 'page:' + p.page_id;
    }
    p.title = p.title.slice(0, 74) + ' copy';
    (doc.pages || (doc.pages = [])).push(p);
    switchPage(p.page_id);
    record('Duplicated page.');
  }
  function removePage() {
    if (active === 'home') return status('The home page is required.');
    const id = active;
    dialog(
      'Delete page',
      [{ note: 'Delete ' + page().title + ' and clear links to it? Frames will keep any remaining menu destination.' }],
      () => {
        doc.pages = doc.pages.filter((p) => p.page_id !== id);
        if (!doc.pages.length) delete doc.pages;
        for (const [, p] of M.pages(doc))
          for (const o of [...p.items,...p.bbsScreen || []]) {
            const removed='page:'+id;
            if(RetroMedia.isFrame(o) && (o.href===removed || o.otherHref===removed)){
              const remaining=[{href:o.href,text:o.text},{href:o.otherHref,text:o.otherLabel}].find(t=>t.href && t.href!==removed);
              if(remaining)Object.assign(o,remaining,{widget:'inline-frame'});
              else {delete o.widget;o.href='';}
              delete o.otherHref;delete o.otherLabel;
            }else if(o.href===removed)o.href='';
          }
        switchPage('home');
        record('Deleted page. Undo restores it.');
      },
      'Delete',
    );
  }
  function paste() {
    if (!clip) return status('Copy an object before pasting.');
    if (page().items.length >= 64) return status('This page already has 64 objects.');
    const o = M.copy(clip);
    o.id = M.uid();
    o.w = Math.min(o.w, page().width);
    o.h = Math.min(o.h, page().height);
    o.x = M.clamp(o.x + clipboardOffset, 0, page().width - o.w);
    o.y = M.clamp(o.y + clipboardOffset, 0, page().height - o.h);
    if(o.widget==='flash-movie'){
      const p=page(),candidate={...p,items:[...p.items,o]};
      try{M.normalize(p===doc?candidate:{...doc,pages:doc.pages.map(child=>child===p?candidate:child)});}
      catch(error){return status(error.message);}
    }
    if(RetroMedia.isFrame(o)){
      try{RetroMedia.checkFrames(M.pages(doc).map(([key,p])=>[key,p===page()?{...p,items:[...p.items,o]}:p]));}catch(err){return status(err.message);}
    }
    if (o.href.startsWith('page:') && !M.page(doc, o.href.slice(5))) o.href = '';
    if (RetroMedia.isPlayer(o)) {
      if(page().items.filter(RetroMedia.isPlayer).length>=4)return status('A page supports up to four players.');
      if(o.autoplay && (page().soundtrack || page().items.some(i=>i.autoplay)))o.autoplay=false;
    }
    page().items.push(o);
    selected = o.id;
    clipboardOffset += 8;
    record('Pasted object.');
  }
  async function save() {
    finishInline(true);
    const data = JSON.stringify(M.normalize(doc), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    if (blob.size > 24 * 1024 * 1024) throw Error('Project exceeds the 24 MiB desktop file limit.');
    const filename = cleanName(doc.title) + '.yst';
    if (window.retroPageDesktop?.save) {
      try { await window.retroPageDesktop.save(blob, filename); }
      catch(error){ if(error.name!=='AbortError')status('Could not save project. '+error.message); return; }
    } else downloadBlob(blob, filename);
    status('Saved an editable .yst project.');
  }
  function publish() {
    finishInline(true);
    const service='https://yestersites-webring.jamesmweeksjr.chatgpt.site';
    const suggested=doc.title.toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,40).replace(/^-|-$/g,'');
    dialog('Publish to YesterSites',[
      {name:'title',label:'Site name',value:doc.title,maxLength:80,required:true},
      {name:'slug',label:'Site address',value:doc.slug||suggested,maxLength:40,required:true},
      {name:'listed',label:'List my site in the YesterSites directory',type:'checkbox',value:doc.listed},
      {note:'Your pages and pictures publish together. New webmasters can create an account when they publish.'}
    ],v=>{
      const project=M.normalize({...doc,title:v.title.trim(),slug:v.slug.trim().toLowerCase(),listed:v.listed});
      if(!project.title || (!project.items.length && !project.bbsScreen?.length))throw Error('Add a title and a page object or BBS block before publishing.');
      const data=JSON.stringify(project);
      if(new Blob([data]).size>16*1024*1024)throw Error('Reduce this project below 16 MiB before publishing.');
      const form=document.createElement('form'),field=document.createElement('textarea');
      form.method='post';form.enctype='text/plain';form.action=service+'/api/editor/handoff';form.target='_blank';form.rel='noopener';form.hidden=true;
      field.name='project';field.value=data;form.append(field);document.body.append(form);
      form.submit();form.remove();
      Object.assign(doc,{title:project.title,slug:project.slug,listed:project.listed});record('Opened the publishing window.');
    },'Publish site');
    const field=$('dialog-fields').querySelector('[name=slug]'),notice=node('output','address-check');
    notice.setAttribute('aria-live','polite');field.after(notice);
    let timer;
    function check(){
      clearTimeout(timer);
      const slug=field.value.trim().toLowerCase();
      if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)){notice.textContent='Use lowercase letters, numbers and hyphens.';return;}
      const address=slug+'.yestersites.com';notice.textContent=address;
      timer=setTimeout(async()=>{
        try{
          const response=await fetch(service+'/api/address?slug='+encodeURIComponent(slug),{credentials:'omit'});
          if(!response.ok)throw Error();
          const data=await response.json();
          if(field.isConnected && field.value.trim().toLowerCase()===slug)notice.textContent=address+' · '+(data.state==='available'?'Available':'Registered. Sign in at Publish to check ownership.');
        }catch{if(field.value.trim().toLowerCase()===slug)notice.textContent=address+' · Will check at publish time.';}
      },220);
    }
    field.addEventListener('input',check);check();
  }
  function bbsCommand() {
    const c = $('bbs-input').value.trim().toUpperCase();
    $('bbs-input').value = '';
    if (c === '?') {
      bbsHelp = true;
    } else if (c === 'B' && bbsHelp) bbsHelp = false;
    else if (c === 'B') {
      pageBbs = bbsBack.pop() || 'home';
      bbsHelp = false;
    } else if (c === 'H') {
      bbsBack.push(pageBbs);
      pageBbs = 'home';
      bbsHelp = false;
    } else {
      const dest=RetroBbs.command(M.terminal(doc,pageBbs,bbsWidth),c);
      if(dest?.resource){RetroBbs.openResource(dest.resource);return;}
      const target=dest?.page;
      if(!target)
        return status('Enter a link number, H for Home, B for Back, or ? for help.');
      bbsBack.push(pageBbs);
      pageBbs = target;
      bbsHelp = false;
    }
    renderBbs();
    $('bbs-lines').scrollTop = 0;
  }
  function prefs() {
    try {
      localStorage.setItem(
        storageKey + '.terminal',
        JSON.stringify({ columns: bbsWidth, color: bbsColor }),
      );
    } catch {}
    renderBbs();
  }
  $('bbs-width').onchange = (e) => {
    bbsWidth = Number(e.target.value);
    prefs();
  };
  $('bbs-form').onsubmit = (e) => {
    e.preventDefault();
    bbsCommand();
  };
  async function action(key) {
    closeMenus();
    if (key !== 'dialog-close') finishInline(true);
    const o = object();
    if (key.startsWith('add-') && key !== 'add-page') {
      const kind = key.slice(4);
      if (kind === 'image') $('image-file').click();
      else place({ kind });
      return;
    }
    switch (key) {
      case 'dialog-close':
        $('dialog').close();
        return;
      case 'template':
        RetroStudioDrawer.chooseStarter(load,false);
        break;
      case 'new':
      case 'sample':
        dialog(
          key === 'new' ? 'New project' : 'Open sample project',
          [{ note: 'Replace the current drawing board? Save a .yst copy to keep this project.' }],
          () =>
            load(
              key === 'new' ? M.blank() : {...presets.sample,listed:true},
              key === 'new' ? 'Created a blank project.' : 'Opened Late Night Signal.',
            ),
          'Open',
        );
        break;
      case 'open':
        $('open-file').click();
        break;
      case 'save':
        await save();
        break;
      case 'undo':
        undo(-1);
        break;
      case 'redo':
        undo(1);
        break;
      case 'copy':
        if (o) {
          clip = M.copy(o);
          clipboardOffset = 12;
          status('Copied ' + M.kinds[o.kind] + '.');
        }
        break;
      case 'paste':
        paste();
        break;
      case 'duplicate':
        if (o) {
          clip = M.copy(o);
          clipboardOffset = 12;
          paste();
        }
        break;
      case 'delete':
        if (o) {
          page().items = page().items.filter((i) => i.id !== o.id);
          selected = null;
          record('Deleted object.');
        }
        break;
      case 'front':
      case 'back':
        if (o) {
          const items = page().items;
          items.splice(items.indexOf(o), 1);
          items[key === 'front' ? 'push' : 'unshift'](o);
          record('Changed layer order.');
        }
        break;
      case 'properties':
        properties();
        break;
      case 'settings':
        pageSettings();
        break;
      case 'add-page':
        addPage();
        break;
      case 'duplicate-page':
        duplicatePage();
        break;
      case 'delete-page':
        removePage();
        break;
      case 'rename-page':
        dialog(
          'Rename page',
          [{ name: 'title', label: 'Page title', value: page().title, maxLength: 80, required: true }],
          (v) => {
            page().title = v.title.trim();
            record('Renamed page.');
          },
          'Rename',
        );
        break;
      case 'stamps':
        setDrawer('GIFs');
        if (innerWidth < 691) $('drawer').classList.add('open');
        break;
      case 'show-drawer':
        $('inspector').classList.remove('open');
        $('drawer').classList.toggle('open');
        break;
      case 'show-inspector':
        $('drawer').classList.remove('open');
        $('inspector').classList.toggle('open');
        break;
      case 'grid':
        grid = !grid;
        drawObjects();
        status(grid ? 'Grid on.' : 'Grid off.');
        break;
      case 'snap':
        snap = !snap;
        status(snap ? 'Snap to 8 px on.' : 'Snapping off.');
        break;
      case 'zoom':
        dialog(
          'Drawing board zoom',
          [
            {
              name: 'z',
              label: 'Magnification',
              type: 'select',
              options: [
                ['fit', 'Fit to window'],
                ['0.5', '50%'],
                ['0.75', '75%'],
                ['1', '100%'],
                ['1.5', '150%'],
                ['2', '200%'],
              ],
              value: zoom,
            },
          ],
          (v) => {
            zoom = v.z;
            fit();
          },
          'Apply',
        );
        break;
      case 'author-bbs':
        armed = null;
        bbsEditor.open();
        break;
      case 'return-html':
        bbsEditor.close();
        render();
        break;
      case 'bbs-options':
        dialog(
          'BBS display',
          [
            { name: 'n', label: 'Columns', type: 'select', options: [32, 40, 80], value: bbsWidth },
            {
              name: 'color',
              label: 'Phosphor',
              type: 'select',
              options: Object.keys(phosphors),
              value: bbsColor,
            },
          ],
          (v) => {
            bbsWidth = Number(v.n);
            bbsColor = v.color;
            prefs();
          },
          'Apply',
        );
        break;
      case 'preview':
      case 'preview-bbs':
        await RetroExport.openPreview(
          doc,
          active,
          key === 'preview-bbs' ? 'bbs' : page().profile === 'text' ? 'text' : 'modern',
        );
        break;
      case 'export':
        await RetroExport.download(doc);
        status('Exported your website ZIP.');
        break;
      case 'code-editor':
      case 'craft-html':{
        const existing=object();
        if(existing?.widget==='html-block'){craftDialog(existing);break;}
        const p=page(), part=widgets['html-block'].parts[0];
        const w=Math.min(part.w,p.width),h=Math.min(part.h,p.height);
        const draft={...M.item(part.kind,0,0,p),...part,widget:'html-block',w,h,
          x:Math.min(24,p.width-w),y:Math.min(32,p.height-h)};
        craftDialog(draft,true);break;
      }
      case 'craft-flash':{
        const kind='flash-movie';
        if(object()?.widget!==kind)insertWidget(kind,24,32);
        craftDialog(object());break;
      }
      case 'fallback':{
        if(!o)break;
        const target=page(),id=active;
        dialog('Classic / text fallback',[
          {name:'fallbackText',label:'Description or link label',value:o.fallbackText||'',maxLength:500},
          {name:'fallbackUrl',label:'Link for older browsers (optional)',value:o.fallbackUrl||'',maxLength:2048},
          {note:'Leave both fields empty to use the automatic fallback.'}
        ],values=>applyObject(o,RetroCraft.fallbackFields(values)),'Save fallback');
        const form=$('dialog-fields'),samples=node('div','edition-samples'),feedback=node('p');
        feedback.setAttribute('role','status');
        const previews=['modern','phone','classic','text'].map(mode=>{
          const box=node('div'),frame=node('iframe');frame.setAttribute('sandbox','');
          frame.title=mode+' edition';box.append(node('strong',null,mode),frame);samples.append(box);
          return [mode,frame];
        });
        form.append(feedback,samples);
        let version=0,timer;
        async function refresh(){
          const current=++version;
          try{
            const fields=RetroCraft.fallbackFields(Object.fromEntries([...form.querySelectorAll('input')].map(input=>[input.name,input.value])));
            const edited={...target,items:target.items.map(item=>item===o?{...item,...fields}:item)};
            const draft=target===doc?edited:{...doc,pages:doc.pages.map(p=>p===target?edited:p)};
            const pages=await Promise.all(previews.map(([mode])=>RetroExport.source(draft,id,mode)));
            if(current!==version || !samples.isConnected)return;
            previews.forEach(([,frame],i)=>{frame.srcdoc=pages[i];});feedback.textContent='';
          }catch(error){if(current===version)feedback.textContent=error.message;}
        }
        const schedule=()=>{clearTimeout(timer);timer=setTimeout(refresh,300);};
        form.addEventListener('input',schedule);refresh();
        $('dialog').addEventListener('close',()=>{version++;clearTimeout(timer);form.removeEventListener('input',schedule);samples.remove();},{once:true});
        break;
      }
      case 'source':{
        const target=page();
        dialog('HTML source & page CSS',[
          {name:'pageStyles',label:'Page stylesheet',type:'textarea',value:target.pageStyles||'',maxLength:4096},
          {note:'Style .page, .text, .link, .image, .box or .rule. For example: .link { color: #ce315b; font-weight: bold; }'},
          {name:'html',label:'Generated HTML · '+target.title,type:'textarea',value:await RetroExport.source(doc,active),readOnly:true}
        ],v=>{
          RetroCraft.pageCSS(v.pageStyles);
          if(v.pageStyles.trim())target.pageStyles=v.pageStyles;else delete target.pageStyles;
          record('Applied page stylesheet.');
        },'Apply stylesheet');
        break;
      }
      case 'publish':
        publish();
        break;
      case 'credits':
        dialog(
          'Artwork credits',
          [
            { note: 'Retro Page artwork and Late Night Signal by RODDY.' },
            { url: 'assets/credits/pixelarticons.txt', label: 'Object drawer icons — Pixelarticons credits and license' },
            { url: 'assets/credits/art-library.txt', label: 'New artwork collections, source credits and permissions' },
            { url: 'assets/credits/art-sources.json', label: 'Archived artwork file-by-file sources' },
            {
              url: 'assets/credits/LICENSE-AND-CREDITS.txt',
              label: 'Mosaic icons — original credits and terms',
            },
            { url: 'assets/credits/SOURCES.txt', label: 'Animated GIF stamps — authors and sources' },
            { url: 'assets/credits/CC0-1.0.txt', label: 'CC0 public domain dedication' },
          ],
          null,
          'Close',
        );
        break;
      case 'about':
        dialog(
          'About Retro Page',
          [
            { note: 'Retro Page is a RODDY desktop and web editor for making YesterSites homepages.' },
            { url: 'https://roddy.world/', label: 'roddy.world' },
          ],
          null,
          'Close',
        );
        break;
      case 'help':
        dialog(
          'Using Retro Page',
          [
            {
              note: 'Choose Text, Image or Link, then click the drawing board. Drag an object to move it. Drag a white square to resize it. Double-click text to type. Ctrl+Enter finishes an edit.',
            },
            {
              note: 'Use Pages to add a page and GIFs to browse stamps. Preview tests your work on desktop, phone, Classic HTML and BBS. Save makes an editable .yst file. Export website ZIP creates standalone pages you can host anywhere.',
            },
          ],
          null,
          'Close',
        );
        break;
    }
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-action]');
    if (b) {
      action(b.dataset.action).catch((err) => {
        status(err.message);
        alert(err.message);
      });
      return;
    }
    const tab = e.target.closest('[data-drawer]');
    if (tab) {
      if (tab.dataset.drawer !== drawer) setDrawer(tab.dataset.drawer);
      return;
    }
    const p = e.target.closest('[data-page]');
    if (p) {
      switchPage(p.dataset.page);
      return;
    }
    const widget=e.target.closest('[data-widget]');
    if(widget){const key=widget.dataset.widget;
      if(mediaLibrary[key] || RetroCraft.isCraft({widget:key})){
        armed=null;const offset=18*(page().items.filter(RetroMedia.isPlayer).length%4);
        try{insertWidget(key,24+offset,48+offset);}catch(error){status(error.message);}return;
      }
      place({widget:key,label:widgets[key].label});return;}
    const st = e.target.closest('[data-stamp]');
    if (st) {
      place({ kind: 'image', ...stamps[Number(st.dataset.stamp)] });
      return;
    }
    const eye = e.target.closest('[data-eye]');
    if (eye) {
      const k = layerKey(eye.dataset.eye);
      hidden.has(k) ? hidden.delete(k) : hidden.add(k);
      drawObjects();
      renderLayers();
      return;
    }
    const layer = e.target.closest('[data-layer]');
    if (layer) {
      select(layer.dataset.layer);
      return;
    }
    if (!e.target.closest('.menubar')) closeMenus();
  });
  $('layers').addEventListener('dblclick', (e) => {
    if (e.target.closest('[data-layer]')) properties();
  });
  $('drawer-content').addEventListener('dragstart', (e) => {
    const b = e.target.closest('[data-stamp],[data-drag-type],[data-widget],[data-archive],[data-used]');
    if (b)
      e.dataTransfer.setData(
        'application/x-retro-page-tool',
        JSON.stringify(
          b.dataset.used ? {kind:'image',used:b.dataset.used} : b.dataset.archive ? {kind:'image', archive:b.dataset.archive, label:b.title} : b.dataset.widget ? {widget:b.dataset.widget} : b.dataset.stamp !== undefined
            ? { kind: 'image', stamp: Number(b.dataset.stamp) }
            : { kind: b.dataset.dragType },
        ),
      );
  });
  paper.addEventListener('dragover', (e) => e.preventDefault());
  paper.addEventListener('drop', async (e) => {
    e.preventDefault();
    try {
      const [x, y] = point(e),
        file = e.dataTransfer.files[0];
      let data;
      if (file) {
        const src = await M.readImage(file);
        M.imageType(src);
        data = { kind: 'image', src, label: file.name };
      } else {
        const raw = e.dataTransfer.getData('application/x-retro-page-tool');
        if (!raw) return;
        data = JSON.parse(raw);
        if (data.widget && Object.hasOwn(widgets, data.widget)) {
          armed=null; insertWidget(data.widget,x,y);return;
        }
        if (!Object.hasOwn(M.kinds, data.kind)) return;
        if(data.used){
          const row=projectArtwork().find(st=>st.used===data.used);if(!row)return;data={kind:'image',...row};
        }else if (data.archive) {
          data = {kind:'image', archive:data.archive, label:String(data.label || 'Archive GIF').slice(0,90)};
        } else if ('stamp' in data) {
          if (!Number.isInteger(data.stamp) || !stamps[data.stamp]) return;
          data = {kind:'image', ...stamps[data.stamp]};
        } else if (data.kind === 'image') {
          $('image-file').click();
          return;
        }
      }
      armed = null;
      paper.classList.remove('pick-target');
      await insert(data, x, y);
    } catch (err) {
      status(err.message);
    }
  });
  $('open-file').onchange = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      if (f.size > 24 * 1024 * 1024) throw Error('Project exceeds 24 MiB.');
      const raw = M.normalize(JSON.parse(await f.text()));
      load(raw, 'Opened ' + f.name + '.');
    } catch (err) {
      status('Could not open project. ' + err.message);
    }
  };
  $('image-file').onchange = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const src = await M.readImage(f);
      M.imageType(src);
      await M.dimensions(src);
      place({ kind: 'image', src, label: f.name.replace(/\.[^.]+$/, '') });
    } catch (err) {
      status(err.message);
    }
  };
  document.addEventListener('keydown', (e) => {
    if (document.querySelector('dialog[open]')) return;
    if (bbsEditor.isOpen()) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==='s') {e.preventDefault();save();}
      return;
    }
    if (e.key === 'Escape') {
      if (editing) return;
      gestureEnd(true);
      armed = null;
      closeMenus();
      closePanels();
      render();
      return;
    }
    if (e.target.matches('input,textarea,select,[contenteditable]')) return;
    const shortcut =
      e.ctrlKey || e.metaKey
        ? {
            s: 'save',
            o: 'open',
            n: 'new',
            z: e.shiftKey ? 'redo' : 'undo',
            y: 'redo',
            c: 'copy',
            v: 'paste',
            d: 'duplicate',
          }[e.key.toLowerCase()]
        : { F5: 'preview', Delete: 'delete', Backspace: 'delete' }[e.key];
    if (shortcut) {
      e.preventDefault();
      action(shortcut).catch((err) => status(err.message));
      return;
    }
    if (e.key === 'Enter' && object() && e.target === $('viewport')) {
      e.preventDefault();
      editInline();
      return;
    }
    const dir = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key],
      o = object();
    if (dir && o && e.target === $('viewport')) {
      e.preventDefault();
      const step = e.shiftKey ? 8 : 1;
      o.x = M.clamp(o.x + dir[0] * step, 0, page().width - o.w);
      o.y = M.clamp(o.y + dir[1] * step, 0, page().height - o.h);
      record('Moved object.');
    }
  });
  const bbsEditor = window.makeBbsEditor({
    project:()=>doc, active:()=>active, switchPage, record, saveDraft, status,
    options:()=>({width:bbsWidth,color:bbsColor}), setOptions:(width,color)=>{bbsWidth=width;bbsColor=color;prefs();},
    reset:ok=>dialog('Use the original terminal screen?', [{note:'Remove the custom BBS blocks for this page? Undo restores them.'}],ok,'Use original'),
  });
  const openParams=new URLSearchParams(location.hash.slice(1));
  const opening=openParams.has('open');
  async function openPublishedProject(){
    const key=openParams.get('open');
    history.replaceState(null,'',location.pathname+location.search);
    const service='https://yestersites-webring.jamesmweeksjr.chatgpt.site';
    dialog('Opening your saved project',[{note:'Loading pages, pictures and BBS screens…'}],null,'Close');
    try{
      const reply=await fetch(service+'/api/editor/open',{method:'POST',credentials:'omit',body:key,cache:'no-store'});
      if(!reply.ok)throw Error('Open the site again from My Sites to get a fresh editor link.');
      load(await reply.json(),'Opened your published project.');
      if($('dialog').open)$('dialog').close();
      if(openParams.get('publish')==='1')publish();
    }catch(error){
      dialog('Could not open this project',[{note:error.message},{url:service+'/account/',label:'Return to My Sites'}],null,'Close');
    }
  }
  $('viewport').onscroll = drawRulers;
  new ResizeObserver(fit).observe($('viewport'));
  record(stickyError || 'Drag an object. Double-click text to edit.');
  if(requestedDrawer==='videos' && innerWidth<691) $('drawer').classList.add('open');
  if(opening)openPublishedProject();
  else if(firstVisit && drawer==='Objects')RetroStudioDrawer.chooseStarter(load,true);
})();

if (!document.querySelector('script[src="./desktop-window.js"]') && 'serviceWorker' in navigator && ['https:', 'http:'].includes(location.protocol)) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./offline.js').catch(() => {
      // Local saves and the downloadable editor still work where workers are disabled.
    });
  });
}

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
  let doc = M.copy(presets.sample),
    active = 'home',
    selected = null,
    drawer = new URLSearchParams(location.search).get('drawer') === 'gifs' ? 'GIFs' : 'Objects',
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
  try {
    const recovery = localStorage.getItem(storageKey);
    if (recovery) {
      const state = JSON.parse(recovery);
      doc = M.normalize(state.doc);
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
      ['HTML source…', 'source'],
      ['BBS preview', 'preview-bbs'],
      null,
      ['Zoom…', 'zoom'],
      ['Show grid', 'grid'],
      ['Snap to 8 px', 'snap'],
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
    drawer = value;
    renderDrawer();
  }
  const stamps = [...presets.stamps];
  const animatedBuiltins = new Set();
  let artOrder = [...presets.stamps], artLoading, browsedLocalArt = false;
  const artGroups = ['All artwork','Animated GIFs', ...new Set(presets.stamps.map(st => st.group))];
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
  const videoPresets=Object.fromEntries(['YouTube','Rumble','Internet Archive'].map(label=>[
    'media-'+label.toLowerCase().replace(' ','-'),{...window.retroObjects.presets['video-player'],label:label+' video',saveAs:'video-player'}]));
  for(const [mode,label] of Object.entries(RetroMedia.voices))videoPresets['audio-'+mode]={...window.retroObjects.presets['audio-player'],label,saveAs:'audio-player'};
  const widgets = {...videoPresets, ...window.retroObjects.presets, ...palette.shapes, ...palette.web, ...palette.bbs};
  function renderDrawer() {
    if (!$('drawer-content')) return;
    $('drawer-title').textContent = drawer === 'GIFs' ? 'GIF Stamps' : drawer;
    $('drawer').querySelector('[data-action="add-page"]').hidden = drawer !== 'Pages';
    for (const b of document.querySelectorAll('[data-drawer]'))
      b.classList.toggle('active', b.dataset.drawer === drawer);
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
    } else if (drawer === 'Objects') {
      const groups = node('select', 'stamp-search');
      groups.setAttribute('aria-label', 'Object group');
      for (const name of ['Basic shapes', 'Web objects']) groups.add(new Option(name));
      groups.value = objectGroup;
      groups.onchange=()=>{objectGroup=groups.value;renderDrawer();};
      root.append(groups);
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
      const builtin = Object.entries({...videoPresets,...window.retroObjects.presets}).filter(([key]) =>
        RetroMedia.isPanel({widget:key}) ? objectGroup==='Basic shapes' : objectGroup !== 'Basic shapes' && key.startsWith('bbs-') === (objectGroup === 'BBS objects'));
      const extra = objectGroup === 'Basic shapes' ? palette.shapes : objectGroup === 'BBS objects' ? palette.bbs : palette.web;
      for (const [key,spec] of [...builtin, ...Object.entries(extra)]) {
        const b=node('button','object-choice');
        const part=spec.parts[0], src=spec.preview || (key==='counter'?counterSource(part.text):part.src);
        let icon=glyph(part.kind);
        if(src){
          icon=node('img','object-art');
          icon.alt='';icon.src=src;icon.draggable=false;
        }
        b.append(icon,document.createTextNode(spec.label));
        b.draggable=true; b.dataset.widget=key; choices.append(b);
      }
    } else {
      if (artPanel) { root.append(artPanel); root.scrollTop=artScroll; return; }
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
        place({kind:'image', archive:item.id, label:item.name}));
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
        const matching = artOrder.filter(st =>
          (artGroup === artGroups[0] || st.group === artGroup ||
            (artGroup === 'Animated GIFs' && (st.animated || animatedBuiltins.has(st.label)))) &&
          (st.label+' '+st.group+' '+(st.alt || '')).toLowerCase().includes(query));
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
            b.draggable = true; b.dataset.stamp = stamps.indexOf(st);
            b.title = (st.wallpaper?'Apply as page wallpaper. ':'')+(st.alt || st.label);
            im.src = st.src; im.alt = ''; im.draggable = false;
            b.append(im,node('span',null,st.label));grid.append(b);
          }
        }
        content.append(button('Artwork credits','credits','stamp-credits'));
      }
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
      const src = o.kind === 'image' ? o.src : '';
      if (src) {
        const thumb = node('img');
        thumb.src = src;
        thumb.alt = '';
        name.append(thumb);
      } else name.append(glyph(o.kind));
      const text = o.text.trim().replace(/\s+/g, ' ');
      name.append(node('span', null, M.kinds[o.kind] + (text ? ': ' + text : '')));
      row.append(eye, name);
      root.append(row);
    }
    root.scrollTop = top;
  }
  function renderProperties() {
    const o = object();
    $('properties-title').textContent = o ? M.kinds[o.kind] + ' Properties' : 'Properties';
    for (const k of ['x', 'y', 'w', 'h', 'text']) {
      const c = $('prop-' + k);
      c.value = o ? o[k] : '';
      c.disabled = !o || (k === 'text' && o.kind === 'rule');
    }
    $('prop-caption').textContent = o?.widget === 'counter' ? 'Counter digits' : o?.kind === 'image' ? 'Alt text' : 'Text';
    for (const c of $('properties').querySelectorAll('button')) c.disabled = !o;
  }
  function renderBbs() {
    if (!M.page(doc, pageBbs)) pageBbs = active;
    $('bbs-width').value = String(bbsWidth);
    $('terminal').style.setProperty('--phosphor', phosphors[bbsColor]);
    $('bbs-lines').textContent = bbsHelp
      ? 'TERMINAL HELP\n\n1…9  Follow a link\nH    Go Home\nB    Go back\n?    Help\n\nB returns to your page.'
      : M.terminal(doc, pageBbs, bbsWidth).lines.join('\n');
  }
  function geometry(el, o) {
    for (const k of ['x', 'y', 'w', 'h'])
      el.style[{ x: 'left', y: 'top', w: 'width', h: 'height' }[k]] = o[k] + 'px';
  }
  function drawObjects() {
    const paper = $('paper');
    paper.replaceChildren();
    paper.style.width = page().width + 'px';
    paper.style.height = page().height + 'px';
    paper.style.backgroundColor = page().background;
    for (const [i, o] of page().items.entries()) {
      const el = node('div', 'canvas-object');
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
      if(RetroMedia.isBorder(o)){el.style.border='6px '+RetroMedia.borderStyles[o.widget]+' '+o.color;el.style.boxShadow='none';}
      else if(RetroMedia.isFrame(o)){
        const pane=node('div','editor-frame');
        if(o.widget==='split-frame'){const rail=node('div','editor-frame-menu');rail.append(node('strong',null,'INDEX'),node('span',null,o.text),node('span',null,o.otherLabel));pane.append(rail);}
        pane.append(node('span','editor-frame-content',o.text+'  ▧'));el.append(pane);
      } else if (RetroMedia.isPlayer(o)) {
        const deck=node('div','player-face');
        deck.dataset.skin=o.playerSkin||'deck';deck.append(node('strong',null,(o.widget==='audio-player'?RetroMedia.voices[o.audioMode]||'Wave Deck':RetroMedia.skins[o.playerSkin]||'Vision Deck')+' · '+o.text),node('span',null,o.widget==='audio-player'?'▂ ▄ ▆ ▃ ▇ ▅ ▂':'▶'),node('small',null,'▶   ▪   ━━━━━━'));
        el.append(deck);
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
    $('window-title').textContent = 'Retro Page — ' + (doc.title || 'Untitled homepage') + '.yst';
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
    (RetroMedia.isPanel(o) || RetroMedia.isPlayer(o) || ['image', 'rule', 'link'].includes(o.kind)) ? properties() : editInline();
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
  function playerDialog(o,isNew,preset=o.widget) {
    const p=page();
    const hints={
      'media-youtube':'Paste a YouTube watch, Shorts or share URL.',
      'media-rumble':'On Rumble, open Share → Embed and copy the iframe or its URL.',
      'media-internet-archive':'Paste the Archive movie item URL for its original player, or a direct MP4 download for Vision Deck.',
    };
    const formTitle=widgets[preset].label;
    const action=async v=>{

      const href=await mediaLink(v.media,o.widget);
      if (!$('dialog').open || dialogAccept!==action || p!==page()) return;
      const hosted=!!RetroMedia.source(href,o.widget).embed;
      const values={text:v.text,href,alternateSrc:v.alternateSrc?RetroMedia.source(v.alternateSrc,o.widget).url:'',playerSkin:v.playerSkin,audioMode:v.audioMode||'clip',autoplay:!hosted && !!v.autoplay,loop:!hosted && !!v.loop};
      if (!isNew) return applyObject(o,values);
      const candidate={...o,...values}, trial={...p,items:[...p.items,candidate]};
      M.normalize(p===doc?trial:{...doc,pages:doc.pages.map(child=>child===p?trial:child)});
      p.items.push(candidate);selected=candidate.id;record('Placed '+widgets[o.widget].label+'.');
    };
    dialog(formTitle,[
      ...(hints[preset]?[{note:hints[preset]}]:[]),
      {name:'text',label:'Player title',value:o.text,required:true,maxLength:120},
      {name:'media',label:o.widget==='video-player'?'YouTube, Rumble, Archive movie or HTTPS video file':'HTTPS audio file or live stream',value:o.href,required:true,maxLength:2048},
      {name:'playerSkin',label:'Player frame',type:'select',options:Object.entries(RetroMedia.skins),value:o.playerSkin||(isNew?'win31':'deck')},
      ...(o.widget==='audio-player'?[{name:'audioMode',label:'Audio panel',type:'select',options:Object.entries(RetroMedia.voices),value:o.audioMode||(Object.hasOwn(RetroMedia.voices,preset.slice(6))?preset.slice(6):'clip')}]:[]),
      {name:'alternateSrc',label:'Fallback media file (optional)',value:o.alternateSrc||'',maxLength:2048},
      {name:'autoplay',label:'Start on arrival',type:'checkbox',value:o.autoplay},
      {name:'loop',label:'Repeat clip',type:'checkbox',value:o.loop},
      {url:'https://yestersites.com/members/screening-room/',label:'Try the Screening Room examples'},
    ],action,isNew?'Insert':'Apply');
    const field=$('dialog-fields').querySelector('[name=media]');
    const options=['autoplay','loop'].map(name=>$('dialog-fields').querySelector('[name='+name+']'));
    const adjust=()=>{
      const provider=/(?:https:\/\/(?:www\.)?rumble\.com\/|https:\/\/(?:www\.)?archive\.org\/(?:details|embed)\/)/i.test(field.value) ||
        (!field.value && ['media-rumble','media-internet-archive'].includes(preset));
      for (const opt of options)opt.disabled=provider;
    };
    field.oninput=adjust;adjust();
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
  function insertWidget(key,x,y) {
    const p=page(), spec=widgets[key], parts=spec.parts;
    const gw=Math.max(...parts.map(part=>(part.dx||0)+part.w));
    const gh=Math.max(...parts.map(part=>(part.dy||0)+part.h));
    const scale=Math.min(1,p.width/gw,p.height/gh);
    x=M.clamp(x,0,p.width-Math.floor(gw*scale));
    y=M.clamp(y,0,p.height-Math.floor(gh*scale));
    const objects=parts.map(({dx=0,dy=0,...part})=>{
      const o={...M.item(part.kind,0,0,p),...part,
        x:x+Math.floor(scale*dx),y:y+Math.floor(scale*dy),w:Math.max(1,Math.floor(scale*part.w)),h:Math.max(1,Math.floor(scale*part.h))};
      const storedWidget = Object.hasOwn(spec,'saveAs') ? spec.saveAs : key;
      if (storedWidget) o.widget = storedWidget;
      if (key==='counter') o.src=counterSource(o.text);
      if (key==='bbs-menu' || (storedWidget==='bbs-menu' && !o.href)) o.href='page:'+(M.pages(doc).find(([id])=>id!==active)?.[0]||'home');
      if (key==='wallpaper') Object.assign(o,{x:0,y:0,w:p.width,h:p.height});
      return o;
    });
    if(RetroMedia.isFrame(objects[0]))return frameDialog(objects[0],true);
    if(RetroMedia.isPlayer(objects[0]))return playerDialog(objects[0],true,key);
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
      p.items.splice(0,replace?1:0,o);selected=o.id;record('Applied '+data.label+' as page wallpaper.');return;
    }
    if (data.archive) {
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
    if (RetroMedia.isFrame(o)) return frameDialog(o,false);
    if (RetroMedia.isPlayer(o)) return playerDialog(o,false);
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
      [{ note: 'Delete ' + page().title + ' and clear links to this page?' }],
      () => {
        doc.pages = doc.pages.filter((p) => p.page_id !== id);
        if (!doc.pages.length) delete doc.pages;
        for (const [, p] of M.pages(doc))
          for (const o of [...p.items,...p.bbsScreen || []]) if (o.href === 'page:' + id) o.href = '';
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
  function save() {
    finishInline(true);
    const data = JSON.stringify(M.normalize(doc), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    if (blob.size > 24 * 1024 * 1024) throw Error('Project exceeds the 24 MiB desktop file limit.');
    downloadBlob(blob, cleanName(doc.title) + '.yst');
    status('Saved an editable .yst project.');
  }
  function publish() {
    dialog(
      'Publish to YesterSites',
      [
        { name: 'slug', label: 'Site address', value: doc.slug, maxLength: 40, required: true },
        {
          name: 'listed',
          label: 'List in the YesterSites directory',
          type: 'checkbox',
          value: doc.listed,
        },
        { note: 'Review all '+M.pages(doc).length+' pages together at the YesterSites publishing desk.' },
      ],
      (v) => {
        const d = M.normalize({ ...doc, slug: v.slug.trim(), listed: v.listed });
        if (!d.title.trim() || (!d.items.length && !d.bbsScreen?.length))
          throw Error('Add a title and a page object or BBS block before publishing.');
        const bytes = new TextEncoder().encode(JSON.stringify(d));
        if(bytes.length>16*1024*1024)throw Error('Reduce this project below 16 MiB before publishing.');
        if(bytes.length>850000){
          doc.slug=d.slug;doc.listed=d.listed;save();
          const a=node('a');a.href='https://yestersites.com/desktop/publish/';a.target='_blank';a.rel='noopener';a.click();
          status('Choose the downloaded .yst in the publishing desk.');return;
        }
        const chars = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
        const target =
          'https://yestersites.com/desktop/publish/#draft=' +
          btoa(chars).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        doc.slug = d.slug;
        doc.listed = d.listed;
        record('Prepared your page for the publishing desk.');
        const a = node('a');
        a.href = target;
        a.target = '_blank';
        a.rel = 'noopener';
        a.click();
      },
      'Continue',
    );
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
      const target = M.terminal(doc, pageBbs, bbsWidth).links[Number(c) - 1];
      if (!/^\d+$/.test(c) || !target)
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
        dialog(
          'New from template',
          [
            { name: 'starter', label: 'Starter site', type: 'select', options: Object.keys(window.RetroTemplates) },
            { note: 'Create an editable copy. Save your current project first to keep it.' },
          ],
          ({ starter }) => load(M.copy(window.RetroTemplates[starter]), 'Created a new project from ' + starter + '.'),
          'Create site',
        );
        break;
      case 'new':
      case 'sample':
        dialog(
          key === 'new' ? 'New project' : 'Open sample project',
          [{ note: 'Replace the current drawing board? Save a .yst copy to keep this project.' }],
          () =>
            load(
              key === 'new' ? M.blank() : presets.sample,
              key === 'new' ? 'Created a blank project.' : 'Opened Late Night Signal.',
            ),
          'Open',
        );
        break;
      case 'open':
        $('open-file').click();
        break;
      case 'save':
        save();
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
      case 'source':
        dialog(
          'HTML source',
          [
            {
              name: 'html',
              label: page().title,
              type: 'textarea',
              value: await RetroExport.source(doc, active),
              readOnly: true,
            },
          ],
          null,
          'Close',
        );
        break;
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
      setDrawer(tab.dataset.drawer);
      return;
    }
    const p = e.target.closest('[data-page]');
    if (p) {
      switchPage(p.dataset.page);
      return;
    }
    const widget=e.target.closest('[data-widget]');
    if(widget){const key=widget.dataset.widget;place({widget:key,label:widgets[key].label});return;}
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
    const b = e.target.closest('[data-stamp],[data-drag-type],[data-widget],[data-archive]');
    if (b)
      e.dataTransfer.setData(
        'application/x-retro-page-tool',
        JSON.stringify(
          b.dataset.archive ? {kind:'image', archive:b.dataset.archive, label:b.title} : b.dataset.widget ? {widget:b.dataset.widget} : b.dataset.stamp !== undefined
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
        if (data.archive) {
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
  $('viewport').onscroll = drawRulers;
  new ResizeObserver(fit).observe($('viewport'));
  record(stickyError || 'Drag an object. Double-click text to edit.');
})();

if ('serviceWorker' in navigator && ['https:', 'http:'].includes(location.protocol)) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./offline.js').catch(() => {
      // Local saves and the downloadable editor still work where workers are disabled.
    });
  });
}

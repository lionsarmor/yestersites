(() => {
  'use strict';
  const get = id => document.getElementById(id);
  const frames = [
    ['win31', 'DeskSet 3.2', 'Beveled desktop tools'],
    ['classic', 'County Dialer', 'Olive telephone exchange'],
    ['real', 'TapeDeck Live', 'Brushed stereo receiver'],
    ['amber', 'Amberline', 'Amber phosphor terminal'],
    ['bubble', 'Bubble Comet', 'Translucent jelly console'],
    ['atlas', 'Field Atlas', 'Canvas and brass compass'],
    ['cinema', 'Bijou Box', 'Velvet cinema marquee'],
    ['pocket', 'Pocket Relay', 'Handheld dot-matrix deck']
  ];
  const defaults = {launch:'random',edition:'original',gestures:true,fold:false,quiet:false,log:true};
  function read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  }
  const saved = read('ring-surfer.preferences', {});
  const prefs = {...defaults};
  for (const [key, initial] of Object.entries(defaults)) {
    const value = saved?.[key];
    const input = get(key);
    if (typeof initial === 'boolean') {
      prefs[key] = typeof value === 'boolean' ? value : initial;
      input.checked = prefs[key];
    } else {
      prefs[key] = [...input.options].some(o => o.value === value) ? value : initial;
      input.value = prefs[key];
    }
    input.addEventListener('change', () => {
      prefs[key] = input.type === 'checkbox' ? input.checked : input.value;
      store('ring-surfer.preferences', prefs);
      window.dispatchEvent(new CustomEvent('ring-preference', {detail:key}));
    });
  }
  window.RingSurferPreferences = prefs;
  function store(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); get('settings-result').textContent='Saved on this device'; }
    catch { get('settings-result').textContent='Changes last for this visit'; }
  }
  const picker = get('frames'), select = get('theme');
  for (const [key, name, description] of frames) {
    const option = new Option(name, key);
    select.add(option);
    const tile = document.createElement('label');
    tile.className='frame-card'; tile.dataset.skin=key;
    const radio=document.createElement('input');
    radio.type='radio'; radio.name='frame'; radio.value=key;
    const sample=document.createElement('span');
    sample.className='frame-sample'; sample.setAttribute('aria-hidden','true');
    const emblem=document.createElement('i'); emblem.className='frame-emblem';
    const strip=document.createElement('i'); strip.className='frame-detail';
    sample.append(emblem,strip);
    const caption=document.createElement('span');caption.className='frame-caption';
    const title=document.createElement('b');title.textContent=name;
    const desc=document.createElement('small');desc.textContent=description;
    caption.append(title,desc);tile.append(radio,sample,caption);picker.append(tile);
    radio.addEventListener('change', () => applyFrame(key, true));
  }
  function applyFrame(key, save) {
    if (!frames.some(row=>row[0]===key))key='win31';
    document.body.dataset.theme=key; select.value=key;
    for(const radio of picker.querySelectorAll('input'))radio.checked=radio.value===key;
    if(save)store('ring-surfer.theme',key);
  }
  applyFrame(read('ring-surfer.theme','win31'),false);
  select.addEventListener('change',()=>applyFrame(select.value,true));
  const panel=get('settings'),tabs=[get('frames-tab'),get('browsing-tab')];
  get('settings-open').onclick=()=>panel.showModal();
  get('settings-done').onclick=()=>panel.close();
  function selectTab(chosen){
    for(const tab of tabs){
      const active=tab===chosen;
      tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;
      get(tab.getAttribute('aria-controls')).hidden=!active;
    }
  }
  for(const tab of tabs){
    tab.onclick=()=>selectTab(tab);
    tab.onkeydown=e=>{
      const selected=e.key==='Home'?tabs[0]:e.key==='End'?tabs[1]:
        ['ArrowLeft','ArrowRight'].includes(e.key)?tabs.find(item=>item!==tab):null;
      if(selected){e.preventDefault();selectTab(selected);selected.focus();}
    };
  }
})();

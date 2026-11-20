/* Custom terminal blocks live on their own page alongside the HTML canvas. */
window.makeBbsEditor = function (app) {
  const M=window.RetroModel, byId=id=>document.getElementById(id);
  const panel=byId('bbs-workbench');
  const presets=Object.fromEntries(Object.entries({...retroObjects.presets,...retroPalette.bbs}).filter(([id])=>id.startsWith('bbs-')));
  const colors={Green:'#89f781',Amber:'#ffca70',White:'#ecece2'};
  const page=()=>M.page(app.project(),app.active());
  const custom=()=>page().bbsScreen;
  let index=0;
  for (const [key,spec] of Object.entries(presets)) byId('block-preset').add(new Option(spec.label,key));
  const block=()=>custom()?.[index];
  function preview() {
    const {width,color}=app.options(), pre=byId('screen-output');
    pre.textContent=M.terminal(app.project(),app.active(),width).lines.join('\n');
    pre.style.color=colors[color];
    pre.style.width=width+'ch';
  }
  function refresh() {
    if (panel.hidden) return;
    const pages=M.pages(app.project()), blocks=custom();
    byId('screen-page').replaceChildren(...pages.map(([id,p])=>new Option(p.title,id,false,id===app.active())));
    byId('screen-mode').textContent=blocks?'Custom terminal screen':'Using the original terminal screen.';
    byId('screen-custom').textContent=blocks?'Use original screen…':'Customize screen';
    byId('block-tools').disabled=!blocks;
    index=Math.max(0,Math.min(index,(blocks?.length||0)-1));
    byId('block-list').replaceChildren(...(blocks||[]).map((b,i)=>new Option((i+1)+'. '+(b.text.split('\n').find(s=>s.trim()) || presets[b.widget].label).slice(0,45),i,false,i===index)));
    const b=block();
    byId('block-fields').disabled=!b;
    byId('block-text').value=b?.text||'';
    byId('block-link-label').hidden=!['bbs-menu','bbs-files'].includes(b?.widget);
    byId('block-link').replaceChildren(new Option('No destination',''),...pages.map(([id,p])=>new Option(p.title,'page:'+id)));
    if (b?.href && !b.href.startsWith('page:')) byId('block-link').add(new Option(b.href,b.href));
    byId('block-link').value=b?.href||'';
    byId('block-up').disabled=!b || index===0;
    byId('block-down').disabled=!b || index===blocks.length-1;
    byId('block-remove').disabled=!b;
    byId('screen-width').value=app.options().width;
    byId('screen-color').value=app.options().color;
    preview();
  }
  byId('screen-custom').onclick=()=>{
    if (custom()) return app.reset(()=>{delete page().bbsScreen;index=0;app.record('Restored original terminal screen.');});
    const legacy=page().items.filter(o=>o.widget?.startsWith('bbs-')).sort((a,b)=>a.y-b.y||a.x-b.x);
    page().bbsScreen=legacy.length?legacy.map(({widget,text,href})=>({widget,text,href:href||''})):
      [{widget:'bbs-welcome',text:page().title.toUpperCase(),href:''},...M.pages(app.project()).filter(([id])=>id!==app.active())
        .map(([id,p])=>({widget:'bbs-menu',text:p.title,href:'page:'+id}))];
    index=0;app.record('Created a custom terminal screen.');
  };
  byId('screen-page').onchange=e=>{index=0;app.switchPage(e.target.value);};
  byId('block-list').onchange=e=>{index=Number(e.target.value);refresh();};
  byId('block-add').onclick=()=>{
    if(custom().length>=64) return app.status('A terminal screen supports 64 blocks.');
    const key=byId('block-preset').value,spec=presets[key],part=spec.parts[0];
    custom().push({widget:spec.saveAs||key,text:part.text||'',href:part.href||''});
    index=custom().length-1;app.record('Added '+spec.label+'.');byId('block-text').focus();
  };
  for(const [id,step] of [['block-up',-1],['block-down',1]]) byId(id).onclick=()=>{
    const blocks=custom(), b=blocks.splice(index,1)[0];index+=step;blocks.splice(index,0,b);app.record('Moved terminal block.');
  };
  byId('block-remove').onclick=()=>{custom().splice(index,1);app.record('Removed terminal block.');};
  byId('block-text').oninput=e=>{block().text=e.target.value;preview();app.saveDraft();};
  byId('block-text').onchange=()=>app.record('Edited terminal block.');
  byId('block-link').onchange=e=>{block().href=e.target.value;app.record('Updated terminal link.');};
  for(const id of ['screen-width','screen-color']) byId(id).onchange=()=>{
    app.setOptions(Number(byId('screen-width').value),byId('screen-color').value);preview();
  };
  return {
    open(){panel.hidden=false;document.body.classList.add('bbs-mode');refresh();byId('screen-page').focus();},
    close(){panel.hidden=true;document.body.classList.remove('bbs-mode');document.querySelector('#toolbar [data-action=author-bbs]').focus();},
    isOpen:()=>!panel.hidden, refresh,
  };
};

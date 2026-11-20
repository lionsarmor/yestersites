/* The authored blocks are shared by the terminal monitor, preview and published editions. */
window.makeBbsEditor=function(app){
  const M=window.RetroModel,$=id=>document.getElementById(id),panel=$('bbs-workbench');
  const presets=Object.fromEntries(Object.entries({...retroObjects.presets,...retroPalette.bbs}).filter(([key])=>key.startsWith('bbs-')));
  const types={'bbs-welcome':['Welcome','welcome'],'bbs-menu':['Menu entries','menu'],'bbs-art':['ASCII art','art'],'bbs-bulletin':['Bulletins','bulletin'],'bbs-files':['File areas','files']};
  const colors={Green:'#9bed93',Amber:'#ffce7b',White:'#e6eded'};
  const page=()=>M.page(app.project(),app.active()),blocks=()=>page().bbsScreen;
  let index=0,displayPage='',editingPage='',back=[];
  const selected=()=>blocks()?.[index];
  const kind=(key,spec)=>spec.saveAs||key;
  function automaticBlocks(){
    const p=page(),items=[...p.items].sort((a,b)=>a.y-b.y||a.x-b.x);
    const legacy=items.filter(o=>o.widget?.startsWith('bbs-'));
    if(legacy.length)return legacy.map(o=>({widget:presets[o.widget]?.saveAs||o.widget,text:o.text,href:o.href||''}));
    const entries=[{widget:'bbs-welcome',text:p.title.toUpperCase(),href:''}],body=[];
    for(const o of items){
      if(o.href.startsWith('page:') && o.href!=='page:'+app.active())entries.push({widget:'bbs-menu',text:o.text||M.page(app.project(),o.href.slice(5)).title,href:o.href});
      else if(!o.href.startsWith('page:') && o.text.trim() && o.text.trim().replace(/\s+/g,' ').toLowerCase()!==p.title.trim().replace(/\s+/g,' ').toLowerCase() && !['/','|'].includes(o.text.trim()))body.push(o.kind==='image'?'['+o.text+']':o.text);
    }
    if(body.length)for(const text of body)entries.push({widget:'bbs-bulletin',text,href:''});
    if(entries.length>64){const tail=entries.pop();const last=entries.at(-1);if(last.widget==='bbs-bulletin' && tail.widget==='bbs-bulletin' && last.text.length+tail.text.length+2<=8000)last.text+='\n\n'+tail.text;else entries.push(tail);}
    return entries;
  }
  function preview(){
    if(!M.page(app.project(),displayPage))displayPage=app.active();
    const {width,color}=app.options(),out=$('screen-output');
    const screen=M.terminal(app.project(),displayPage,width);
    out.textContent=screen.lines.join('\n');out.style.color=colors[color];out.style.width=width+'ch';
    $('monitor-title').textContent=M.page(app.project(),displayPage).title;
    $('monitor-size').textContent=width+' COL · '+screen.lines.length+' LINES';
    return screen;
  }
  function editMonitor(){displayPage=app.active();back=[];preview();}
  function ensureCustom(){if(!blocks()){const items=automaticBlocks();if(items.length>64){app.status('This screen exceeds 64 blocks. Shorten the HTML page before customizing.');return false;}page().bbsScreen=items;}return true;}
  const group=(key,s)=>s.group||types[kind(key,s)]?.[0]||'Bulletins';
  $('block-group').replaceChildren(...['All blocks',...new Set(Object.entries(presets).map(([key,s])=>group(key,s)))].map(k=>new Option(k)));
  function add(key){
    const items=blocks()||automaticBlocks();
    if(items.length>=64)return app.status('A screen supports 64 blocks.');
    const spec=presets[key],widget=spec.saveAs||key,text=spec.parts.map(p=>p.text).filter(Boolean).join('\n');
    page().bbsScreen=items;items.push({widget,text,href:spec.parts[0].href||''});
    index=items.length-1;displayPage=app.active();back=[];app.record('Added '+spec.label+'.');$('block-text').focus();
  }
  function library(){
    const root=$('bbs-stamps');root.replaceChildren();
    for(const [key,spec] of Object.entries(presets)){
      if($('block-group').value!=='All blocks' && $('block-group').value!==group(key,spec))continue;
      const button=document.createElement('button'),icon=document.createElement('img');
      button.type='button';button.dataset.bbsBlock=key;icon.width=36;icon.height=32;icon.alt='';
      icon.src=spec.preview||'assets/instruments/'+(types[kind(key,spec)]?.[1]||'bbs')+'-still.gif';
      button.append(icon,document.createTextNode(spec.label));button.onclick=()=>add(key);root.append(button);
    }
  }
  $('block-group').onchange=library;library();
  function refresh(){
    if(panel.hidden)return;
    if(editingPage!==app.active()){editingPage=displayPage=app.active();back=[];index=0;}
    const pages=M.pages(app.project()),items=blocks(),shown=items||automaticBlocks();
    $('screen-page').replaceChildren(...pages.map(([id,p])=>new Option(p.title,id,false,id===app.active())));
    $('screen-mode').textContent=items?'Custom BBS edition':'Following the HTML page';
    $('screen-custom').textContent=items?'Restore automatic screen…':'Customize this screen';
    index=Math.max(0,Math.min(index,shown.length-1));
    $('block-list').replaceChildren(...shown.map((b,i)=>new Option((i+1)+'. '+(b.text.split('\n').find(s=>s.trim())||presets[b.widget]?.label||'Block').slice(0,45),i,false,i===index)));
    const b=selected(),linked=['bbs-menu','bbs-files'].includes(b?.widget),external=linked && b.href && !b.href.startsWith('page:');
    $('block-fields').disabled=!b;$('block-caption').textContent=b?presets[b.widget]?.label||'Block properties':'Block properties';
    $('block-text').value=b?.text||'';
    $('block-link-label').hidden=!linked;$('block-url-label').hidden=!external;
    $('block-link').replaceChildren(new Option('No link',''),...pages.map(([id,p])=>new Option(p.title,'page:'+id)),new Option('Web or file address…','external'));
    $('block-link').value=external?'external':b?.href||'';$('block-url').value=external?b.href:'';
    $('block-up').disabled=!b||index===0;$('block-down').disabled=!b||index===shown.length-1;
    $('block-remove').disabled=!b;$('block-copy').disabled=!b||shown.length>=64;
    $('screen-width').value=app.options().width;$('screen-color').value=app.options().color;preview();
  }
  $('screen-custom').onclick=()=>{
    if(blocks())return app.reset(()=>{delete page().bbsScreen;index=0;editMonitor();app.record('Restored automatic screen.');});
    if(!ensureCustom())return;app.record('Created a custom terminal screen.');
  };
  $('screen-page').onchange=e=>app.switchPage(e.target.value);
  $('block-list').onchange=e=>{index=Number(e.target.value);if(!blocks()){if(!ensureCustom())return;app.record('Opened block for editing.');}else refresh();editMonitor();};
  for(const [id,step] of [['block-up',-1],['block-down',1]])$(id).onclick=()=>{
    const items=blocks(),[b]=items.splice(index,1);index+=step;items.splice(index,0,b);editMonitor();app.record('Moved block.');
  };
  $('block-remove').onclick=()=>{blocks().splice(index,1);editMonitor();app.record('Removed block.');};
  $('block-copy').onclick=()=>{blocks().splice(index+1,0,{...selected()});index++;editMonitor();app.record('Copied block.');};
  $('block-text').oninput=e=>{selected().text=e.target.value;editMonitor();app.saveDraft();};
  $('block-text').onchange=()=>app.record('Edited block.');
  $('block-link').onchange=e=>{
    if(e.target.value==='external'){$('block-url-label').hidden=false;$('block-url').focus();return;}
    selected().href=e.target.value;editMonitor();app.record('Updated destination.');
  };
  $('block-url').onchange=e=>{try{const href=M.webAddress(e.target.value);selected().href=href;editMonitor();app.record('Updated destination.');}catch(err){app.status(err.message);}};
  for(const id of ['screen-width','screen-color'])$(id).onchange=()=>{app.setOptions(Number($('screen-width').value),$('screen-color').value);preview();};
  $('monitor-command').onsubmit=e=>{
    e.preventDefault();const screen=preview(),input=$('monitor-input'),cmd=input.value.trim().toUpperCase();input.value='';
    const target=cmd==='H'?'home':cmd==='B'?back.pop():/^[1-9]\d*$/.test(cmd)?screen.links[Number(cmd)-1]:null;
    if(!target){app.status('Enter a listed menu number, H for home or B to go back.');return;}
    if(cmd!=='B' && target!==displayPage)back.push(displayPage);
    displayPage=target;preview();input.focus();
  };
  return {open(){panel.hidden=false;document.body.classList.add('bbs-mode');editingPage='';refresh();$('screen-page').focus();},
    close(){panel.hidden=true;document.body.classList.remove('bbs-mode');document.querySelector('#toolbar [data-action=author-bbs]').focus();},isOpen:()=>!panel.hidden,refresh};
};

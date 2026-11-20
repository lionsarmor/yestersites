/* One renderer supplies the ZIP, HTML source and live preview. */
(() => {
  'use strict';
  const M = window.RetroModel;
  const editions = ['modern','phone','classic','text'];
  const encoder = new TextEncoder();
  const escape = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const file = (id, ed='') => (id === 'home' ? ed || 'index' : 'page-'+id+(ed ? '-'+ed : ''))+'.html';
  const labels = {modern:'Desktop',phone:'Phone',classic:'Classic',text:'Text only'};
  const navSigns = new Set(['/','|','·','•','»','›','–','-']);
  const rawBytes = src => Uint8Array.from(atob(src.slice(src.indexOf(',')+1)), c=>c.charCodeAt(0));
  function dataUri(bytes, type) {
    let binary = '';
    for(let i=0;i<bytes.length;i+=16384) binary+=String.fromCharCode(...bytes.subarray(i,i+16384));
    return 'data:image/'+type+';base64,'+btoa(binary);
  }
  // A fixed 216-colour cube leaves one independent transparent palette entry.
  // Frequent clear codes keep the LZW stream at nine bits throughout.
  async function classicGif(src) {
    const photo = new Image(); photo.src=src; await photo.decode();
    const canvas=document.createElement('canvas');
    canvas.width=photo.naturalWidth; canvas.height=photo.naturalHeight;
    const ctx=canvas.getContext('2d'); ctx.drawImage(photo,0,0);
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    const records=[...encoder.encode('GIF89a'),canvas.width&255,canvas.width>>8,canvas.height&255,canvas.height>>8,247,0,0];
    for(let i=0;i<256;i++) records.push((Math.floor(i/36)%6)*51,(Math.floor(i/6)%6)*51,(i%6)*51);
    records.push(33,249,4,1,0,0,255,0,44,0,0,0,0,canvas.width&255,canvas.width>>8,canvas.height&255,canvas.height>>8,0,8);
    const blocks=[]; let buffer=0,bits=0;
    const write=code=>{buffer|=code<<bits;bits+=9;while(bits>=8){blocks.push(buffer&255);buffer>>>=8;bits-=8;}};
    for(let i=0;i<pixels.length;i+=4) {
      if(i%880===0) write(256);
      write(pixels[i+3]<128 ? 255 : Math.round(pixels[i]/51)*36+Math.round(pixels[i+1]/51)*6+Math.round(pixels[i+2]/51));
    }
    write(257);if(bits)blocks.push(buffer&255);
    for(let i=0;i<blocks.length;i+=255){const part=blocks.slice(i,i+255);records.push(part.length,...part);}
    records.push(0,59);return Uint8Array.from(records);
  }
  async function mediaFor(doc, inline) {
    const bySource=new Map(), files=[], paths=new Map();
    for(const [id,page] of M.pages(doc)) {
      const objects=new Map(); paths.set(id,objects);
      for(const obj of page.items) {
        const src=M.appearance(obj); if(!src)continue;
        if(!bySource.has(src)) {
          const n=bySource.size+1, format=src.slice(11,src.indexOf(';')),ext=format==='jpeg'?'jpg':format;
          const path='pictures/img'+n+'.'+ext;
          let classic=inline?src:path;
          if(!inline)files.push({name:path,data:rawBytes(src)});
          if(format==='png'){
            const bytes=await classicGif(src), name='pictures/img'+n+'.gif';
            classic=inline?dataUri(bytes,'gif'):name;
            if(!inline)files.push({name,data:bytes});
          }
          bySource.set(src,[inline?src:path,classic]);
        }
        objects.set(obj.id,bySource.get(src));
      }
    }
    return {files,paths};
  }
  function rows(page, backdrop) {
    const rows=[];
    for(const o of page.items.filter(o=>o!==backdrop).sort((a,b)=>a.y-b.y||a.x-b.x)){
      const row=rows[rows.length-1];
      if(row&&o.y<Math.min(...row.map(p=>p.y+p.h/2))&&row.every(p=>o.x>=p.x+p.w||p.x>=o.x+o.w))row.push(o);
      else rows.push([o]);
    }
    return rows.map(row=>row.sort((a,b)=>a.x-b.x));
  }
  const boardCss='.board{position:relative;width:100%;margin:auto;overflow:hidden}.object{position:absolute;box-sizing:border-box;overflow:hidden;pointer-events:none;line-height:normal;overflow-wrap:anywhere}.object img{display:block;width:100%;height:100%}.object a{display:block;width:100%;height:100%;color:inherit;pointer-events:auto}';
  const phoneCss='.phone{max-width:42rem;margin:auto;padding:1rem;box-sizing:border-box;min-height:70vh;overflow-wrap:anywhere;line-height:1.45}.phone p{margin:0 0 1rem}.phone img{max-width:100%;height:auto;vertical-align:middle}.phone a{display:inline-block;min-height:44px;align-content:center;color:inherit}.navlinks{display:flex;flex-wrap:wrap;gap:0 .45em;align-items:center}';
  function render(page,id,edition,media,names=file) {
    const hasMedia=o=>media.has(o.id);
    const first=page.items[0], backdrop=first&&first.kind==='image'&&first.src&&!first.text.trim()&&!first.href&&!first.x&&!first.y&&first.w===page.width&&first.h===page.height?first:null;
    const [r,g,b]=page.background.slice(1).match(/../g).map(x=>parseInt(x,16));
    const ink=r*299+g*587+b*114>145000?'#161616':'#f8f7ee';
    function link(o,body){
      const href=o.href.startsWith('page:')?names(o.href.slice(5),edition):o.href;
      return href ? '<a href="'+escape(href)+'">'+(body||escape(o.text||href))+'</a>':body;
    }
    function content(o,layout) {
      const text=escape(o.text).replace(/\r?\n/g,'<br>');
      if(layout==='text'&&o.kind==='image')return text?'[Image: '+text+']':'';
      if(layout!=='text'&&hasMedia(o))return '<img src="'+media.get(o.id)[Number(layout==='classic')]+'" width="'+o.w+'" height="'+o.h+'" border="0" alt="'+escape(o.text)+'">';
      return text;
    }
    function style(o){return 'text-align:'+o.align+';font-family:'+M.fonts[o.font_family]+';color:'+o.color+';font-weight:'+(o.bold?'bold':'normal')+';font-style:'+(o.italic?'italic':'normal')+';';}
    function board(){
      let html='<div class="board" style="max-width:'+page.width+'px;background:'+page.background+'"><div style="padding-top:'+100*page.height/page.width+'%"></div>';
      for(const [index,o] of page.items.entries()){
        const css=style(o)+'left:'+100*o.x/page.width+'%;top:'+100*o.y/page.height+'%;width:'+100*o.w/page.width+'%;height:'+100*o.h/page.height+'%;z-index:'+(index+1)+';background:'+(o.kind==='rule'?o.color:o.fill||'transparent')+';font-size:'+o.font_size+'px;font-size:min('+o.font_size+'px,'+100*o.font_size/page.width+'vw);'+(o.kind==='box'?'box-shadow:inset 0 0 0 1px '+o.color:'');
        html+='<div class="object" style="'+escape(css)+'">'+link(o,content(o,'modern'))+'</div>';
      }return html+'</div>';
    }
    function flow(layout){
      let html=layout==='text'?'<h1>'+escape(page.title)+'</h1>':'';
      for(const row of rows(page,backdrop)){
        const parts=[];
        for(const o of row){
          let body=content(o,layout);
          if(o.kind==='rule'){parts.push([o,'<hr>']);continue;}
          if(!body&&!o.href)continue;
          if(layout==='classic'){
            const levels=[10,13,16,18,24,32,48],delta=levels.map(s=>Math.abs(s-o.font_size));
            if(o.bold)body='<b>'+body+'</b>';if(o.italic)body='<i>'+body+'</i>';
            body='<font color="'+o.color+'" face="'+escape(M.fonts[o.font_family])+'" size="'+(1+delta.indexOf(Math.min(...delta)))+'">'+(body||escape(o.href))+'</font>';
          }
          body=link(o,body);
          if(layout==='phone')body='<span style="'+escape(style(o)+'font-size:'+Math.max(16,Math.min(56,o.font_size))+'px;background:'+(o.fill||'transparent'))+'">'+body+'</span>';
          parts.push([o,body]);
        }
        if(row.length>1&&row.some(o=>o.href)&&row.every(o=>o.href||navSigns.has(o.text.trim())))html+='<p class="navlinks">'+parts.map(p=>p[1]).join(' ')+'</p>';
        else if(layout==='classic'&&parts.length>1)html+='<table border="0" cellpadding="4" cellspacing="0"><tr>'+parts.map(([o,x])=>'<td valign="top" align="'+o.align+'">'+x+'</td>').join('')+'</tr></table>';
        else html+=parts.map(([o,x])=>o.kind==='rule'?x:'<p align="'+(layout==='phone'&&hasMedia(o)?'center':o.align)+'">'+x+'</p>').join('');
      }
      if(layout==='classic')return '<center><table border="0" cellpadding="6" cellspacing="0" width="'+Math.min(600,page.width)+'"><tr><td>'+html+'</td></tr></table></center>';
      if(layout==='phone')return '<article class="phone">'+html+'</article>';
      return html;
    }
    const layout=edition|| (page.profile==='text'?'text':'auto');
    const old=layout==='classic'||layout==='text';
    const choices=names===file?editions:['classic','text'];
    const footer='<div class="editions"><hr><p>'+(page.byline?escape(page.byline)+' &middot; ':'')+choices.filter(e=>e!==edition).map(e=>'<a href="'+names(id,e)+'">'+labels[e]+'</a>').join(' | ')+'</p></div>';
    let css='',attrs='';
    if(layout==='classic')attrs=' bgcolor="'+page.background+'" text="'+ink+'" link="'+ink+'" vlink="'+ink+'"'+(backdrop?' background="'+media.get(backdrop.id)[1]+'"':'');
    if(!old){
      css='body{margin:0;background-color:'+page.background+';color:'+ink+';'+(backdrop?'background-image:url('+media.get(backdrop.id)[0]+');background-position:center top;background-size:'+page.width+'px '+page.height+'px':'')+'}.editions{box-sizing:border-box;margin:auto;max-width:'+page.width+'px;padding:.3em .75em;font:13px/1.5 Arial,sans-serif}.editions a{color:inherit}'+boardCss+phoneCss;
      if(layout==='auto')css+='.phone{display:none}@media(max-width:600px){.phone{display:block}.board{display:none}}';
    }
    const body=layout==='auto'?board()+flow('phone'):layout==='modern'?board():flow(layout);
    return '<!DOCTYPE html><html lang="en"><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>'+escape(page.title)+'</title>'+(css?'<style>'+css+'</style>':'')+'</head><body'+attrs+'>'+body+footer+'</body></html>';
  }
  function dosCopy(doc,bundle) {
    const ids=M.pages(doc).map(([id])=>id);
    const name=(id,e)=>id==='home'?(e==='text'?'TEXT':'INDEX')+'.HTM':(e==='text'?'T':'P')+String(ids.indexOf(id)).padStart(7,'0')+'.HTM';
    const pictures=new Map(),files=bundle.files.filter(f=>/\.(gif|jpg)$/.test(f.name));
    files.forEach((f,i)=>{const short='I'+String(i+1).padStart(7,'0')+f.name.slice(-4).toUpperCase();pictures.set(f.name,short);bundle.files.push({name:'DOS/'+short,data:f.data});});
    for(const [id,page] of M.pages(doc)){
      const media=new Map([...bundle.paths.get(id)].map(([key,p])=>[key,[pictures.get(p[1]),pictures.get(p[1])]]));
      for(const ed of ['classic','text']){
        const source=render(page,id,ed,media,name).replace(/[^\x00-\x7F]/gu,ch=>'&#'+ch.codePointAt(0)+';');
        bundle.files.push({name:'DOS/'+name(id,ed),data:encoder.encode(source)});
      }
    }
  }
  async function download(raw) {
    const doc=M.normalize(raw),bundle=await mediaFor(doc,false);
    for(const [id,page] of M.pages(doc))for(const ed of ['',...editions])bundle.files.push({name:file(id,ed),data:encoder.encode(render(page,id,ed,bundle.paths.get(id)))});
    dosCopy(doc,bundle);
    const url=URL.createObjectURL(window.makeSiteZip(bundle.files)),anchor=document.createElement('a');
    anchor.href=url;anchor.download=(doc.slug||doc.title.toLowerCase().replace(/[^a-z0-9]+/g,'-')||'retro-page')+'-site.zip';
    anchor.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  async function source(raw,id,ed='') {
    const doc=M.normalize(raw),bundle=await mediaFor(doc,false);
    return render(M.page(doc,id),id,ed,bundle.paths.get(id));
  }
  async function openPreview(raw,id,initial='modern') {
    const doc=M.normalize(raw),bundle=await mediaFor(doc,true);
    const modes={modern:['Modern desktop','modern',0,0],phone:['Phone · 390 × 844','phone',390,844],authored:['Authored size','modern',0,0],classic640:['Classic · 640 × 480','classic',640,480],classic800:['Classic · 800 × 600','classic',800,600],text:['Text browser','text',0,0],bbs:['BBS terminal','bbs',0,0]};
    const dlg=document.createElement('dialog');dlg.className='site-preview';dlg.setAttribute('aria-label','Website preview');
    dlg.innerHTML='<form method="dialog"><strong>Website preview</strong><button autofocus value="close">Close</button></form><div class="preview-controls"><label>Page <select data-control="page"></select></label><label>Display <select data-control="mode"></select></label><label data-option="fit">Scale <select data-control="scale"><option>Fit</option><option>100%</option></select></label><label data-option="bbs">Columns <select data-control="columns"><option>32</option><option>40</option><option>80</option></select></label><label data-option="bbs">Phosphor <select data-control="color"><option>Green</option><option>Amber</option><option>White</option></select></label><output></output></div><div class="preview-stage"><div class="preview-footprint"><iframe title="Published page preview" sandbox="allow-same-origin"></iframe></div><section class="preview-terminal" hidden><pre></pre><form><label>Select &gt; <input size="6" maxlength="5" autocomplete="off"></label> <button>Enter</button> <span role="status"></span></form><p>H Home · B Back · ? Help</p></section></div>';
    const find=s=>dlg.querySelector(s),control=name=>find('[data-control="'+name+'"]');
    const choose=control('mode'),pages=control('page'),frame=find('iframe'),stage=find('.preview-stage'),foot=find('.preview-footprint'),term=find('.preview-terminal');
    for(const [key,p] of M.pages(doc))pages.add(new Option(p.title||'Untitled',key));
    for(const [key,settings] of Object.entries(modes))choose.add(new Option(settings[0],key));
    pages.value=id;choose.value=modes[initial]?initial:'modern';
    const history=[];let help=false;
    const paths=new Map();
    for(const [key] of M.pages(doc))for(const ed of ['',...editions])paths.set(file(key,ed),[key,ed]);
    function resize(){
      if(choose.value==='bbs')return;
      const p=M.page(doc,pages.value),mode=modes[choose.value],aw=Math.max(1,stage.clientWidth-20),ah=Math.max(1,stage.clientHeight-20);
      const w=choose.value==='authored'?p.width:mode[2]||aw,h=choose.value==='authored'?p.height:mode[3]||ah;
      const ratio=control('scale').value==='Fit'?Math.min(1,aw/w,ah/h):1;
      Object.assign(frame.style,{width:w+'px',height:h+'px',transform:'scale('+ratio+')'});
      Object.assign(foot.style,{width:Math.ceil(w*ratio)+'px',height:Math.ceil(h*ratio)+'px'});
      find('output').textContent=w+' × '+h+' CSS px';
    }
    function display(){
      const key=pages.value,p=M.page(doc,key),ed=modes[choose.value][1],bbs=ed==='bbs';
      foot.hidden=bbs;term.hidden=!bbs;
      dlg.querySelectorAll('[data-option="bbs"]').forEach(el=>el.hidden=!bbs);
      find('[data-option="fit"]').hidden=bbs;
      if(bbs){
        const cols=Number(control('columns').value);
        term.style.color={Green:'#69ed45',Amber:'#ffc05b',White:'#f3f1e7'}[control('color').value];
        find('pre').textContent=help?'TERMINAL HELP\n\n1, 2 ... Open a link\nH        Home\nB        Back\n?        Help':M.terminal(doc,key,cols).lines.join('\n');
        term.style.setProperty('--columns',cols+'ch');find('output').textContent=cols+' columns';
        term.querySelector('[role=status]').textContent='';
      }else{frame.srcdoc=render(p,key,ed,bundle.paths.get(key));resize();}
    }
    frame.addEventListener('load',()=>{
      const inner=frame.contentDocument;
      inner?.addEventListener('click',event=>{
        const anchor=event.target.closest('a');if(!anchor)return;
        const href=anchor.getAttribute('href');event.preventDefault();
        if(paths.has(href)){
          const [key,ed]=paths.get(href);pages.value=key;
          if(ed!==modes[choose.value][1])choose.value=ed==='classic'?'classic640':ed||'modern';
          display();
        }else if(/^https?:\/\//.test(href))window.open(href,'_blank','noopener,noreferrer');
      });
    });
    term.querySelector('form').onsubmit=event=>{
      event.preventDefault();const input=term.querySelector('input'),cmd=input.value.trim().toLowerCase();input.value='';
      const current=pages.value,list=M.terminal(doc,current,Number(control('columns').value)).links;
      if(cmd==='?')help=true;
      else if(cmd==='b'){if(help)help=false;else if(history.length)pages.value=history.pop();}
      else if(cmd==='h'||(/^[1-9]\d*$/.test(cmd)&&Number(cmd)<=list.length)){
        const key=cmd==='h'?'home':list[Number(cmd)-1];if(current!==key)history.push(current);pages.value=key;help=false;
      }else{term.querySelector('[role=status]').textContent='Enter a listed number or ? for help.';return;}
      display();input.focus();
    };
    choose.onchange=pages.onchange=()=>{history.length=0;help=false;display();};
    control('columns').onchange=control('color').onchange=display;control('scale').onchange=resize;
    const observer=new ResizeObserver(resize);
    dlg.addEventListener('close',()=>{observer.disconnect();dlg.remove();},{once:true});
    document.body.append(dlg);dlg.showModal();observer.observe(stage);display();
  }
  window.RetroExport={source,download,openPreview};
})();

/* Serializable authoring objects. The member host uses the same validation and renderer. */
const RetroCraft = (() => {
  const player = 'https://yestersites.com/flash/';
  const arcade='https://yestersites.com/arcade/';
  function cartridgeURL(value){
    let u;
    try{u=new URL(checkedString(value,2048,'ROM address'));}catch{throw Error('Enter a complete HTTPS link to a cartridge file.');}
    if(u.protocol!=='https:'||u.username||u.password||u.port||!u.hostname.includes('.')||/^\d+(?:\.\d+){3}$/.test(u.hostname)||u.hostname.includes(':')||/\.(?:local|localhost|internal|test|invalid)\.?$/i.test(u.hostname))throw Error('Choose a public HTTPS file address without credentials.');
    u.hash='';return u.href;
  }
  const maxBytes = 768 * 1024;
  const tags = new Set('div span p h1 h2 h3 h4 h5 h6 b strong i em u s small big blockquote pre code kbd ol ul li dl dt dd table caption thead tbody tr th td hr br'.split(' '));
  const properties = new Set(('color background-color font-family font-size font-style font-weight font-variant line-height letter-spacing word-spacing text-align text-indent text-decoration text-transform text-shadow white-space overflow-wrap vertical-align '+
    'margin margin-top margin-right margin-bottom margin-left padding padding-top padding-right padding-bottom padding-left border border-top border-right border-bottom border-left border-color border-width border-style border-radius box-shadow border-collapse border-spacing '+
    'display width height max-width min-width max-height min-height box-sizing list-style-type gap grid-template-columns align-items justify-content flex-wrap').split(' '));
  const escape = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const isCraft = o => ['html-block','flash-movie','flash-book','game-cartridge'].includes(o?.widget);
  function checkedString(value,limit,label) {
    if(typeof value!=='string' || value.length>limit)throw Error(label+' is limited to '+limit+' characters.');
    return value;
  }
  function declarations(source) {
    return source.split(';').filter(part=>part.trim()).map(part=>{
      const split=part.indexOf(':'),name=part.slice(0,split).trim().toLowerCase(),value=part.slice(split+1).trim();
      if(split<1 || !properties.has(name))throw Error('Unsupported CSS property: '+name);
      if(!/^[\w\s#.,%"'\-+]+$/.test(value) || value.length>180)throw Error('Use a literal CSS value for '+name+' (for example #ffc900 or 2px solid navy).');
      return name+':'+value;
    }).join(';');
  }
  function stylesheet(value) {
    let remaining=checkedString(value,4096,'Stylesheet').trim(),out='';
    while(remaining){
      const rule=/^([\w. ,>+*\-]+)\{([^{}]*)\}/.exec(remaining);
      if(!rule || !rule[1].trim())throw Error('Use flat CSS rules with element or .class selectors.');
      out+=rule[1].trim()+'{'+declarations(rule[2])+'}';remaining=remaining.slice(rule[0].length).trim();
    }
    return out;
  }
  function pageCSS(source,root=':is(.board,.phone)') {
    const rules=stylesheet(source);
    return rules.replace(/([^{}]+)\{([^{}]*)\}/g,(_,selectors,values)=>{
      const targets=selectors.split(',').map(selector=>{
        const name=selector.trim();
        if(!/^\.(page|text|link|image|box|rule)$/.test(name))throw Error('Page selectors are .page, .text, .link, .image, .box and .rule.');
        return name==='.page'?root:root+' .rp-'+name.slice(1);
      });
      const styles=values.split(';').filter(Boolean).map(value=>{
        const prop=value.slice(0,value.indexOf(':'));
        if(!/^(color$|background-color$|font-|text-|line-height$|letter-spacing$|word-spacing$|border|box-shadow$)/.test(prop))throw Error('Use typography, colors, shadows and borders in the page stylesheet.');
        return value+'!important';
      });
      return targets.join(',')+'{'+styles.join(';')+'}';
    });
  }
  function markup(value) {
    let rest=checkedString(value,8192,'HTML'),html='',plain='';
    const stack=[];
    while(rest){
      if(rest[0]!=='<'){
        const end=rest.indexOf('<'),raw=end<0?rest:rest.slice(0,end);
        html+=escape(raw).replace(/&amp;(amp|lt|gt|quot|nbsp|#39);/g,'&$1;');plain+=raw;rest=rest.slice(raw.length);continue;
      }
      const token=/^<(\/?)([a-z][a-z0-9]*)([^<>]*)>/i.exec(rest);
      if(!token)throw Error('Close each HTML tag. Write &lt; for a literal less-than sign.');
      const tag=token[2].toLowerCase();let attrs=token[3].trim(),output='';
      if(!tags.has(tag))throw Error('Unsupported HTML element: '+tag);
      if(token[1]){
        if(attrs || stack.pop()!==tag)throw Error('Unexpected closing tag: '+tag);
        html+='</'+tag+'>';plain+=' ';
      }else{
        const empty=tag==='br'||tag==='hr';
        if(empty)attrs=attrs.replace(/\/$/,'').trim();
        const seen=new Set();
        while(attrs){
          const attr=/^(class|style|colspan|rowspan)\s*=\s*(?:"([^"]*)"|'([^']*)')(?:\s+|$)/i.exec(attrs);
          if(!attr)throw Error('Use quoted class, style or table span attributes.');
          const name=attr[1].toLowerCase();let val=attr[2]??attr[3];
          if(seen.has(name))throw Error('Duplicate '+name+' attribute.');seen.add(name);
          if(name==='class' && !/^[a-zA-Z0-9_ -]{1,120}$/.test(val))throw Error('Invalid CSS class.');
          if(name==='style')val=declarations(val);
          if(name.endsWith('span') && (!['td','th'].includes(tag)||!/^([1-9]|1[0-6])$/.test(val)))throw Error('Table spans must be 1–16.');
          output+=' '+name+'="'+escape(val)+'"';attrs=attrs.slice(attr[0].length);
        }
        html+='<'+tag+output+'>';if(!empty){stack.push(tag);if(stack.length>40)throw Error('Use fewer than 40 nested elements.');}else plain+=' ';
      }
      rest=rest.slice(token[0].length);
    }
    if(stack.length)throw Error('Missing closing tag for '+stack.at(-1)+'.');
    return {html,plain:plain.replace(/\s+/g,' ').trim()};
  }
  function swfBytes(data) {
    if(data==='demo')return 0;
    if(typeof data!=='string' || data.length<12 || data.length>Math.ceil(maxBytes/3)*4 || data.length%4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data))throw Error('Choose a SWF of 768 KiB or less.');
    const head=atob(data.slice(0,12)),sig=head.slice(0,3),length=data.length*3/4-(data.endsWith('==')?2:data.endsWith('=')?1:0);
    const size=head.charCodeAt(4)+256*head.charCodeAt(5)+65536*head.charCodeAt(6)+16777216*head.charCodeAt(7);
    if(!['FWS','CWS','ZWS'].includes(sig)||size<14||size>16*1024*1024||sig==='FWS'&&size!==length)throw Error('Choose a Flash SWF up to 16 MiB uncompressed.');
    return length;
  }
  function fields(o) {
    if(o.widget==='game-cartridge'){
      if(!o.romData)return {romUrl:cartridgeURL(o.romUrl),romData:''};
      if(typeof o.romData!=='string' || o.romData.length>699052 || !/^[A-Za-z0-9+/]+={0,2}$/.test(o.romData))throw Error('Upload an uncompressed cartridge up to 512 KiB.');
      const bytes=Uint8Array.from(atob(o.romData),ch=>ch.charCodeAt(0));
      if(bytes.length>524288)throw Error('Upload limit is 512 KiB.');
      CartridgeFormat.inspect(bytes);
      return {romData:o.romData,romUrl:''};
    }
    if(o.widget==='flash-movie'||o.widget==='flash-book'){
      let content;
      if(o.widget==='flash-book'){
        if(!Array.isArray(o.scenes)||!o.scenes.length||o.scenes.length>8)throw Error('Create between one and eight Flash scenes.');
        content={scenes:o.scenes.map(s=>{
          const title=checkedString(s?.title,48,'Scene title').trim(),body=checkedString(s?.body,450,'Scene text').trim();
          if(!title || !body)throw Error('Give each scene a title and some text.');
          return {title,body};
        })};
      }else{swfBytes(o.swf);content={swf:o.swf};}
      const stageFit=o.stageFit??'showAll',stageColor=o.stageColor??'#17263c';
      if(!['showAll','noBorder','exactFit'].includes(stageFit)||!/^#[0-9a-f]{6}$/i.test(stageColor))throw Error('Choose a stage scale and a six-digit backdrop color.');
      return {...content,stageFit,stageColor,stageControls:o.stageControls!==false};
    }
    markup(o.markup);stylesheet(o.styles);return {markup:o.markup,styles:o.styles};
  }
  function render(o,edition) {
    const old=edition==='classic'||edition==='text',title=escape(o.text);
    if(o.widget==='game-cartridge'){
      const src=o.romData?arcade+'#data='+o.romData:arcade+'#rom='+encodeURIComponent(cartridgeURL(o.romUrl));
      if(old)return '[Game cartridge] '+title+' · <a href="'+escape(src)+'">Open game player</a>';
      return '<span class="cartridge-stage"><button type="button" class="cartridge-size">Full screen</button><iframe allow="fullscreen *; gamepad *" class="craft-window cartridge-window" title="'+title+'" sandbox="allow-scripts" referrerpolicy="no-referrer" loading="lazy" src="'+escape(src)+'"></iframe></span>';
    }
    if(o.widget==='flash-movie'||o.widget==='flash-book'){
      if(old)return o.widget==='flash-book'?fields(o).scenes.map(s=>'<p><b>'+escape(s.title)+'</b><br>'+escape(s.body).replace(/\n/g,'<br>')+'</p>').join(''):'[Flash movie] '+title;
      const cfg=fields(o),params=new URLSearchParams();
      if(cfg.stageFit!=='showAll')params.set('fit',cfg.stageFit);
      if(cfg.stageColor!=='#17263c')params.set('matte',cfg.stageColor);
      if(!cfg.stageControls)params.set('controls','off');
      let data=o.swf;
      if(o.widget==='flash-book'){
        params.set('book','1');
        const bytes=new TextEncoder().encode(JSON.stringify(cfg.scenes));
        data=btoa(String.fromCharCode(...bytes));
      }
      const src=player+(params.size?'?'+params:'')+'#'+data;
      return '<iframe class="craft-window" title="'+title+'" sandbox="allow-scripts" referrerpolicy="no-referrer" loading="lazy" src="'+escape(src)+'"></iframe>';
    }
    const content=markup(o.markup);
    if(edition==='text')return escape(content.plain||o.text);
    if(edition==='classic')return content.html.replace(/ (class|style)="[^"]*"/g,'');
    const doc='<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; form-action &#39;none&#39;; base-uri &#39;none&#39;"><style>html{overflow-wrap:anywhere}body{margin:4px}'+stylesheet(o.styles)+'</style>'+content.html;
    return '<iframe class="craft-window" sandbox="" title="'+title+'" srcdoc="'+escape(doc)+'"></iframe>';
  }
  const css='.cartridge-stage{display:flex;flex-direction:column;width:100%;height:100%;background:#233832;pointer-events:auto}.cartridge-size{flex:none;align-self:end;color:#fff4d8;background:#243c32;font:bold 14px Arial;cursor:pointer}.cartridge-stage .cartridge-window{flex:1;min-height:0}.cartridge-stage:fullscreen,.cartridge-stage.game-expanded{position:fixed;inset:0;width:100vw;height:100vh;max-width:none;max-height:none;box-sizing:border-box;margin:0;padding:0;border:0;z-index:2147483647}.craft-window{display:block;box-sizing:border-box;width:100%;height:100%;border:0;pointer-events:auto}.phone .craft-window{height:auto;aspect-ratio:4/3}.phone .cartridge-window{aspect-ratio:420/460;min-height:290px}@media(max-width:600px){.board .craft-window{min-height:160px}}';
  function validStill(bytes){
    const at=i=>bytes.charCodeAt(i),word=i=>at(i)+256*at(i+1);
    const width=word(6),height=word(8);
    if(!/^GIF8[79]a/.test(bytes)||bytes.length>98304||!(width>0&&width<=320&&height>0&&height<=240))return false;
    const table=flag=>(flag&128)?3*(2<<(flag&7)):0;
    let pos=13+table(at(10)),frames=0;
    while(pos<bytes.length){
      const marker=at(pos++);
      if(marker===59)return frames===1&&pos===bytes.length;
      if(marker===33){pos++;} // Extension label, followed by data sub-blocks.
      else if(marker===44){
        const left=word(pos),top=word(pos+2),w=word(pos+4),h=word(pos+6);
        if(++frames>1||!w||!h||left+w>width||top+h>height)return false;
        pos+=9+table(at(pos+8));
        const codeSize=at(pos++);if(!(codeSize>=2&&codeSize<=8))return false;
      }else return false;
      while(pos<bytes.length&&at(pos)){pos+=1+at(pos);}
      if(pos>=bytes.length)return false;
      pos++;
    }
    return false;
  }
  function fallbackFields(o){
    const out={};
    for(const [key,label,limit] of [['fallbackText','Classic caption',500],['fallbackTranscript','Text edition transcript',8000],['fallbackUrl','Classic link',2048],['transcriptUrl','Transcript link',2048]]){
      const value=checkedString(o[key]??'',limit,label).trim();
      if(value && key.endsWith('Url')){
        let url;
        try{url=new URL(value);}catch{throw Error('Use a complete HTTP or HTTPS address for the '+label.toLowerCase()+'.');}
        if(!['http:','https:'].includes(url.protocol)||url.username||url.password||/[\\\s\x00-\x1f]/.test(value))throw Error('Use an HTTP or HTTPS link without credentials or spaces.');
      }
      out[key]=value;
    }
    const poster=o.fallbackPoster??'';
    if(poster){
      if(typeof poster!=='string'||poster.length>131094||!/^data:image\/gif;base64,[a-zA-Z0-9+/]+={0,2}$/.test(poster))throw Error('Choose a GIF still of 96 KiB or less.');
      let bytes;try{bytes=atob(poster.slice(22));}catch{throw Error('The poster image could not be read.');}
      if(!validStill(bytes))throw Error('Use a single-frame GIF still up to 320 by 240 pixels.');
    }
    out.fallbackPoster=poster;
    return out;
  }
  function hasFallback(o,edition){
    const shared=o.fallbackText||o.fallbackUrl;
    const text=o.fallbackTranscript||o.transcriptUrl,still=o.fallbackPoster||o.posterMedia;
    return !!(shared||(edition==='text'?text:edition==='classic'?still:text||still));
  }
  function fallback(o,edition='classic',poster=''){
    const classic=edition==='classic';
    const caption=(classic?o.fallbackText:o.fallbackTranscript||o.fallbackText)||o.text||'';
    const url=(classic?o.fallbackUrl:o.transcriptUrl||o.fallbackUrl)||'';
    const parts=[];
    if(classic&&poster)parts.push('<img src="'+escape(poster)+'" alt="'+escape(o.fallbackText||o.text||'Still image')+'" border="0">');
    if(caption)parts.push(escape(caption).replace(/\r?\n/g,'<br>'));
    if(url)parts.push('<a href="'+escape(url)+'">'+(!classic&&o.transcriptUrl?'Transcript link':'Related link')+'</a>');
    return parts.join('<br>');
  }
  return {hasFallback,fallbackFields,fallback,isCraft,fields,render,markup,stylesheet,pageCSS,swfBytes,maxBytes,player,arcade,css};
})();

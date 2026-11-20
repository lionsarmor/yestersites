/* Serializable authoring objects. The member host uses the same validation and renderer. */
const RetroCraft = (() => {
  const player = 'https://yestersites.com/flash/';
  const maxBytes = 768 * 1024;
  const tags = new Set('div span p h1 h2 h3 h4 h5 h6 b strong i em u s small big blockquote pre code kbd ol ul li dl dt dd table caption thead tbody tr th td hr br'.split(' '));
  const properties = new Set(('color background-color font-family font-size font-style font-weight font-variant line-height letter-spacing word-spacing text-align text-indent text-decoration text-transform text-shadow white-space overflow-wrap vertical-align '+
    'margin margin-top margin-right margin-bottom margin-left padding padding-top padding-right padding-bottom padding-left border border-top border-right border-bottom border-left border-color border-width border-style border-radius box-shadow border-collapse border-spacing '+
    'display width height max-width min-width max-height min-height box-sizing list-style-type gap grid-template-columns align-items justify-content flex-wrap').split(' '));
  const escape = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const isCraft = o => ['html-block','flash-movie'].includes(o?.widget);
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
    if(o.widget==='flash-movie'){swfBytes(o.swf);return {swf:o.swf};}
    markup(o.markup);stylesheet(o.styles);return {markup:o.markup,styles:o.styles};
  }
  function render(o,edition) {
    const old=edition==='classic'||edition==='text',title=escape(o.text);
    if(o.widget==='flash-movie'){
      if(old)return '[Flash movie] '+title;
      return '<iframe class="craft-window" title="'+title+'" sandbox="allow-scripts" referrerpolicy="no-referrer" loading="lazy" src="'+player+'#'+escape(o.swf)+'"></iframe>';
    }
    const content=markup(o.markup);
    if(edition==='text')return escape(content.plain||o.text);
    if(edition==='classic')return content.html.replace(/ (class|style)="[^"]*"/g,'');
    const doc='<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; form-action &#39;none&#39;; base-uri &#39;none&#39;"><style>html{overflow-wrap:anywhere}body{margin:4px}'+stylesheet(o.styles)+'</style>'+content.html;
    return '<iframe class="craft-window" sandbox="" title="'+title+'" srcdoc="'+escape(doc)+'"></iframe>';
  }
  const css='.craft-window{display:block;box-sizing:border-box;width:100%;height:100%;border:0;pointer-events:auto}.phone .craft-window{height:220px}@media(max-width:600px){.board .craft-window{min-height:160px}}';
  function fallbackFields(o){
    const text=checkedString(o.fallbackText??'',500,'Classic description').trim();
    const url=checkedString(o.fallbackUrl??'',2048,'Classic link').trim();
    if(url){
      let parsed;
      try{parsed=new URL(url);}catch{throw Error('Use a complete HTTP or HTTPS address for the classic link.');}
      if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password)throw Error('Use an HTTP or HTTPS link without credentials.');
    }
    return {fallbackText:text,fallbackUrl:url};
  }
  function fallback(o){
    const {fallbackText:text,fallbackUrl:url}=fallbackFields(o);
    return url?'<a href="'+escape(url)+'">'+escape(text||url)+'</a>':escape(text);
  }
  return {fallbackFields,fallback,isCraft,fields,render,markup,stylesheet,pageCSS,swfBytes,maxBytes,player,css};
})();

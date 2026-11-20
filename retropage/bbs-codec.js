/* Shared by the authoring tools, ZIP exporter and member host. */
const RetroBbs = (() => {
  const palette=['#000000','#0000aa','#00aa00','#00aaaa','#aa0000','#aa00aa','#aa5500','#aaaaaa','#555555','#5555ff','#55ff55','#55ffff','#ff5555','#ff55ff','#ffff55','#ffffff'];
  const alphabets={ascii:' .:+-*#@/\\|_[]{}<>ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',ansi:' ░▒▓█▀▄■┌─┐│└┘├┤┬┴┼╔═╗║╚╝╠╣╬◆*+@ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',petscii:' ♥♦♣♠●○╱╲┌─┐│└┘├┤┬┴┼▌▐▄▀π←↑*+@ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'};
  const modes={ansi:'PC ANSI / CP437',petscii:'Commodore PETSCII',ascii:'Plain ASCII'};
  const reserved=new Set(['H','B','?']);
  const widgets=['bbs-menu','bbs-files','bbs-door','bbs-wall','bbs-welcome','bbs-art','bbs-bulletin','bbs-paint'];
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function ensure(ok,msg){if(!ok)throw Error(msg);}
  function fresh(mode='ansi',width=32,height=8){
    return {mode,width,height,cells:' '.repeat(width*height),colors:'70'.repeat(width*height)};
  }
  function normalize(block,linkOK){
    ensure(block && widgets.includes(block.widget) && typeof block.text==='string' && block.text.length<=8000 && typeof block.href==='string' && linkOK(block.href),'Check the BBS block and destination.');
    const {widget,text,href}=block,b={widget,text,href};
    if(block.hotkey){
      const key=String(block.hotkey).toUpperCase();
      ensure(/^[A-Z0-9]{1,3}$/.test(key) && !reserved.has(key) && ['bbs-menu','bbs-files','bbs-door'].includes(widget),'Use a 1–3 character menu hotkey. H and B are reserved.');
      b.hotkey=key;
    }
    if(block.ink!==undefined){ensure(/^[\da-f]{2}$/i.test(block.ink),'Choose foreground and background colors.');b.ink=block.ink.toLowerCase();}
    if(widget==='bbs-paint'){
      const p=block.paint;
      ensure(p && Object.hasOwn(modes,p.mode) && [32,40,80].includes(p.width) && (p.mode!=='petscii'||p.width===40) && Number.isInteger(p.height) && p.height>=1 && p.height<=25,'Choose a valid painter size and character set.');
      const n=p.width*p.height;
      ensure(typeof p.cells==='string' && p.cells.length===n && [...p.cells].every(c=>alphabets[p.mode].includes(c)||c.charCodeAt(0)>=32 && c.charCodeAt(0)<=126) && typeof p.colors==='string' && p.colors.length===n*2 && /^[0-9a-f]+$/i.test(p.colors),'The painting contains invalid characters or colors.');
      b.paint={mode:p.mode,width:p.width,height:p.height,cells:p.cells,colors:p.colors.toLowerCase()};
    }
    if(block.bulletin){
      const {id,body}=block.bulletin;
      ensure(widget==='bbs-menu'&&!href&&/^[0-9a-f]{32}$/.test(id)&&typeof body==='string'&&body.trim()&&body.length<=8000,'Give the bulletin a readable message of up to 8,000 characters.');
      b.bulletin={id,body};
    }
    if(block.attachment){
      const {name,data}=block.attachment;
      ensure(widget==='bbs-files' && /^[a-z\d][a-z\d._-]{0,63}$/i.test(name) && typeof data==='string' && data.length>0 && data.length<=65536 && data.length%4===0 && /^(?:[A-Za-z0-9+/]+={0,2})$/.test(data),'Use a file up to 48 KiB with a simple filename.');
      b.attachment={name,data};
    }
    return b;
  }
  function checkKeys(blocks){
    const keys=blocks.map(b=>b.hotkey).filter(Boolean);ensure(new Set(keys).size===keys.length,'Each menu hotkey on a screen must be unique.');
  }
  const plain=c=>'┌┐└┘├┤┬┴┼╔╗╚╝╠╣╬'.includes(c)?'+':'─═'.includes(c)?'-':'│║'.includes(c)?'|':c==='╱'?'/':c==='╲'?'\\':c==='←'?'<':c==='↑'?'^':c==='○'?'o':'#';
  const ascii=s=>s.normalize('NFKD').replace(/[’‘]/g,"'").replace(/[–—]/g,'-').replace(/[^\x20-\x7e\n]/g,c=>Object.values(alphabets).some(s=>s.includes(c))?plain(c):'');
  function authored(blocks,columns,pageLabel,id,wrap){
    const lines=[],rich=[],links=[],resources=[],linkKeys=[],commands={},claimed=new Set(blocks.map(b=>b.hotkey).filter(Boolean));
    let menu=0,file=0;
    function add(str,styles=''){
      lines.push(ascii(str));rich.push({text:str,styles});
    }
    function keyFor(block,resource){
      if(block.hotkey)return block.hotkey;
      let key;
      do{key=resource?'F'+(++file):String(++menu);}while(claimed.has(key));return key;
    }
    blocks.forEach((o,index)=>{
      if(o.bulletin)o={...o,href:'page:'+o.bulletin.id};
      if(o.paint){
        const p=o.paint;
        for(let y=0;y<p.height;y++){
          const offset=y*p.width;
          for(let x=0;x<p.width;x+=columns){
            const n=Math.min(p.width-x,columns),a=offset+x;
            add(p.cells.slice(a,a+n),p.colors.slice(2*a,2*(a+n)));
          }
        }
        add('');return;
      }
      let label=ascii(o.text.replace(/\t/g,'    '));
      if(['bbs-menu','bbs-files','bbs-door'].includes(o.widget) && (o.href||o.attachment)){
        const key=keyFor(o,!!o.attachment||!o.href.startsWith('page:'));
        if(!o.attachment && o.href.startsWith('page:')){
          const dest=o.href.slice(5);
          links.push(dest);linkKeys.push(key);commands[key]={page:dest};
          label=(o.hotkey?'['+key+']':key)+'  '+(label||pageLabel(dest));
        }else{
          const href=o.attachment?'bbs-files/'+id+'/'+index+'/'+o.attachment.name:o.href;
          const resource={text:label.split('\n')[0]||o.attachment?.name||'Open resource',href,key};
          if(o.attachment)resource.attachment=o.attachment;
          resources.push(resource);commands[key]={resource};
          label=(o.hotkey?'['+key+']':key)+'  '+label+'\n'+ascii(href);
        }
      }
      for(const text of label.split('\n')){
        const rows=['bbs-art','bbs-files'].includes(o.widget)?(text.match(new RegExp('.{1,'+columns+'}','g'))||['']):wrap(text,columns);
        for(const row of rows)add(row,o.ink?.repeat(row.length));
      }
      add('');
    });
    return {lines,rich,links,linkKeys,commands,resources};
  }
  function bulletinPages(pages){
    const children=[],used=new Set(pages.map(([id])=>id));
    for(const [parent,p] of pages){
      for(const block of p.bbsScreen||[]){
        if(!block.bulletin)continue;
        const {id,body}=block.bulletin;
        ensure(!used.has(id),'Each BBS bulletin needs a unique screen ID.');used.add(id);
        children.push([id,{title:block.text,items:[],bbsScreen:[
          {widget:'bbs-welcome',text:block.text,href:''},
          {widget:'bbs-bulletin',text:body,href:''},
          {widget:'bbs-menu',text:'Return to '+p.title,href:'page:'+parent,hotkey:'0'}
        ]}]);
      }
    }
    return children;
  }
  function toHTML(screen){
    if(!screen.rich)return esc(screen.lines.join('\n'));
    return screen.rich.map(row=>{
      if(!row.styles)return esc(row.text);
      const spans=[];
      for(let i=0;i<row.text.length;){
        const color=row.styles.slice(i*2,i*2+2);let end=i+1;
        while(end<row.text.length && row.styles.slice(end*2,end*2+2)===color)end++;
        spans.push('<span style="color:'+palette[parseInt(color[0],16)]+';background-color:'+palette[parseInt(color[1],16)]+'">'+esc(row.text.slice(i,end))+'</span>');i=end;
      }
      return spans.join('');
    }).join('\n');
  }
  const cp='ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ';
  const pet={" ":32,"!":33,"\"":34,"#":35,"$":36,"%":37,"&":38,"'":39,"(":40,")":41,"*":42,"+":43,",":44,"-":45,".":46,"/":47,"0":48,"1":49,"2":50,"3":51,"4":52,"5":53,"6":54,"7":55,"8":56,"9":57,":":58,";":59,"<":60,"=":61,">":62,"?":63,"@":64,"A":65,"B":66,"C":67,"D":68,"E":69,"F":70,"G":71,"H":72,"I":73,"J":74,"K":75,"L":76,"M":77,"N":78,"O":79,"P":80,"Q":81,"R":82,"S":83,"T":84,"U":85,"V":86,"W":87,"X":88,"Y":89,"Z":90,"[":91,"£":92,"]":93,"↑":94,"←":95,"─":96,"♠":97,"╮":105,"╰":106,"╯":107,"╲":109,"╱":110,"•":113,"♥":115,"╭":117,"╳":118,"○":119,"♣":120,"♦":122,"┼":123,"│":125,"π":126,"◥":127," ":160,"▌":161,"▄":162,"▔":163,"▁":164,"▏":165,"▒":166,"▕":167,"◤":169,"├":171,"▗":172,"└":173,"┐":174,"▂":175,"┌":176,"┴":177,"┬":178,"┤":179,"▎":180,"▍":181,"▃":185,"▖":187,"▝":188,"┘":189,"▘":190,"▚":191};
  const petColor=[144,31,30,159,28,156,129,152,151,154,153,159,150,156,158,5];
  const ansiColor=[0,4,2,6,1,5,3,7];
  function bytes(screen,mode){
    if(mode==='ascii')return new TextEncoder().encode(screen.lines.join('\r\n')+'\r\n');
    const out=[],petscii=mode==='petscii';
    const rows=screen.rich||screen.lines.map(text=>({text,styles:''}));
    if(petscii)out.push(142,146,5); // Uppercase/graphics, reverse off, white.
    let last='';
    for(const {text,styles} of rows){
      for(let i=0;i<text.length;i++){
        const ink=styles?.slice(i*2,i*2+2)||'70',c=text[i];
        if(ink!==last){
          const fg=parseInt(ink[0],16),bg=parseInt(ink[1],16);
          if(petscii)out.push(bg?18:146,petColor[bg||fg]); // C64 uses reverse video for filled backgrounds.
          else{
            const sgr=(fg<8?30:90)+ansiColor[fg%8]+';'+((bg<8?40:100)+ansiColor[bg%8]);
            out.push(27,...Array.from('['+sgr+'m',c=>c.charCodeAt(0)));
          }
          last=ink;
        }
        if(petscii){const upper=c.toUpperCase();out.push(pet[upper]??pet[plain(c)]??63);}
        else{const code=c.charCodeAt(0),ext=cp.indexOf(c);out.push(code>=32 && code<=126?code:ext>=0?128+ext:plain(c).charCodeAt(0));}
      }
      if(petscii){out.push(13);last='';}else out.push(13,10);
    }
    out.push(...(petscii?[146,5]:[27,91,48,109]));return Uint8Array.from(out);
  }
  function command(screen,key){
    if(screen.commands)return screen.commands[key];
    const i=Number(key)-1;return /^[1-9]\d*$/.test(key) && screen.links[i]?{page:screen.links[i]}:null;
  }
  function bytesOf(file){return Uint8Array.from(atob(file.data),c=>c.charCodeAt(0));}
  function openResource(r){
    if(!r.attachment){window.open(r.href,'_blank','noopener,noreferrer');return;}
    const url=URL.createObjectURL(new Blob([bytesOf(r.attachment)],{type:'application/octet-stream'}));
    const a=document.createElement('a');a.href=url;a.download=r.attachment.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  return {bulletinPages,palette,alphabets,modes,fresh,normalize,checkKeys,authored,toHTML,bytes,command,bytesOf,openResource};
})();

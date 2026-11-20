/* Character-cell editor. Coordinates and brush width are measured in terminal columns. */
function makeScreenPainter(root,commit){
  const $=s=>root.querySelector(s);
  root.innerHTML='<div class="painter-tools"><label>Character set <select name="charset"></select></label><label>Columns <select name="columns"><option>32</option><option>40</option><option>80</option></select></label><label>Rows <input name="rows" type="number" min="1" max="25" size="2"></label><button type="button" data-border>Draw border</button></div><div class="painter-tools"><label>Character <select name="glyph"></select></label><label>Ink <select name="ink"></select></label><label>Paper <select name="paper"></select></label><button type="button" data-erase>Erase</button></div><div class="paint-scroll"><div class="paint-grid" tabindex="0" role="group" aria-label="Character canvas. Arrow keys move, Space paints, Delete erases, and typing inserts characters."></div></div><output></output>';
  const mode=$('[name=charset]'),width=$('[name=columns]'),height=$('[name=rows]'),glyph=$('[name=glyph]'),ink=$('[name=ink]'),paper=$('[name=paper]'),grid=$('.paint-grid');
  const names=['Black','Blue','Green','Cyan','Red','Magenta','Brown','Light gray','Dark gray','Light blue','Bright green','Bright cyan','Light red','Pink','Yellow','White'];
  mode.replaceChildren(...Object.entries(RetroBbs.modes).map(([value,label])=>new Option(label,value)));
  for(const s of [ink,paper])s.replaceChildren(...names.map((name,i)=>new Option(name,i.toString(16))));
  ink.value='a';paper.value='0';
  let block,x=0,y=0,drawing=false,dirty=false;
  function glyphs(){
    const value=glyph.value;glyph.replaceChildren(...Array.from(new Set(RetroBbs.alphabets[mode.value]),c=>new Option(c===' '?'Space':c,c)));
    glyph.value=RetroBbs.alphabets[mode.value].includes(value)&&value?value:mode.value==='ascii'?'#':mode.value==='ansi'?'█':'♥';
  }
  function show(){
    const p=block.paint,frag=document.createDocumentFragment();
    grid.style.setProperty('--cols',p.width);x=Math.min(x,p.width-1);y=Math.min(y,p.height-1);
    for(let i=0;i<p.cells.length;i++){
      const cell=document.createElement('span');cell.dataset.i=i;cell.setAttribute('aria-hidden','true');cell.textContent=p.cells[i];
      cell.style.color=RetroBbs.palette[parseInt(p.colors[2*i],16)];cell.style.backgroundColor=RetroBbs.palette[parseInt(p.colors[2*i+1],16)];frag.append(cell);
    }
    grid.replaceChildren(frag);cursor();
  }
  function cursor(){
    const old=grid.querySelector('.cursor');if(old)old.classList.remove('cursor');
    grid.children[y*block.paint.width+x]?.classList.add('cursor');$('output').textContent='Column '+(x+1)+' · Row '+(y+1);
  }
  function write(x,y,ch,color=ink.value+paper.value){
    const p=block.paint,i=y*p.width+x;
    p.cells=p.cells.slice(0,i)+ch+p.cells.slice(i+1);
    p.colors=p.colors.slice(0,2*i)+color+p.colors.slice(2*i+2);
    const el=grid.children[i];el.textContent=ch;el.style.color=RetroBbs.palette[parseInt(color[0],16)];el.style.backgroundColor=RetroBbs.palette[parseInt(color[1],16)];dirty=true;
  }
  function finish(){drawing=false;if(dirty){dirty=false;commit();}}
  function stroke(e){
    const cell=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-i]');if(!grid.contains(cell)||!cell)return;
    const i=Number(cell.dataset.i);x=i%block.paint.width;y=Math.floor(i/block.paint.width);
    write(x,y,glyph.value);cursor();
  }
  grid.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();grid.focus();grid.setPointerCapture(e.pointerId);drawing=true;stroke(e);};
  grid.onpointermove=e=>{if(drawing)stroke(e);};grid.onpointerup=grid.onpointercancel=grid.onlostpointercapture=finish;
  grid.onkeydown=e=>{
    if(e.ctrlKey||e.metaKey||e.altKey)return;
    const p=block.paint,delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];
    if(delta){x=Math.max(0,Math.min(p.width-1,x+delta[0]));y=Math.max(0,Math.min(p.height-1,y+delta[1]));}
    else if(e.key==='Delete'||e.key==='Backspace'){write(x,y,' ','70');finish();}
    else if(e.key.length===1 && (/[ -~]/.test(e.key)||RetroBbs.alphabets[p.mode].includes(e.key))){
      write(x,y,e.key===' '?glyph.value:p.mode==='petscii'?e.key.toUpperCase():e.key);if(e.key!==' ')x=Math.min(p.width-1,x+1);finish();
    }else return;
    e.preventDefault();cursor();
  };
  function resize(){
    const p=block.paint,cols=mode.value==='petscii'?40:Number(width.value),rows=Number(height.value);
    if(!Number.isInteger(rows)||rows<1||rows>25){height.value=p.height;return;}
    if((cols<p.width||rows<p.height) && !confirm('Crop cells outside the new size?')){set(block);return;}
    const next=RetroBbs.fresh(mode.value,cols,rows),chars=Array.from(next.cells),styles=next.colors.match(/../g);
    for(let y=0;y<Math.min(rows,p.height);y++)for(let x=0;x<Math.min(cols,p.width);x++){
      const old=y*p.width+x,i=y*cols+x,c=p.cells[old];
      chars[i]=RetroBbs.alphabets[next.mode].includes(c)||/[ -~]/.test(c)?c:'#';styles[i]=p.colors.slice(2*old,2*old+2);
    }
    block.paint={...next,cells:chars.join(''),colors:styles.join('')};set(block);commit();
  }
  mode.onchange=width.onchange=height.onchange=resize;
  $('[data-border]').onclick=()=>{
    const p=block.paint,[tl,h,tr,v,bl,br]=p.mode==='ascii'?'+-+|++':'┌─┐│└┘';
    for(let col=0;col<p.width;col++){
      write(col,0,col===0?tl:col===p.width-1?tr:h);if(p.height>1)write(col,p.height-1,col===0?bl:col===p.width-1?br:h);
    }
    for(let row=1;row<p.height-1;row++){write(0,row,v);write(p.width-1,row,v);}finish();
  };
  $('[data-erase]').onclick=()=>{glyph.value=' ';ink.value='7';paper.value='0';grid.focus();};
  function set(b){
    block=b;root.hidden=!b;if(!b)return;const p=b.paint;
    mode.value=p.mode;width.value=p.width;width.disabled=p.mode==='petscii';height.value=p.height;glyphs();show();
  }
  return {set};
}

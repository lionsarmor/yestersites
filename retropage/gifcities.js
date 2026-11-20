/* Shared by the art drawer and Grub. Search metadata stays separate from saved projects. */
window.GifCities = (() => {
  const endpoint = 'https://gifcities.archive.org/api/v1/gifsearch';
  const base = 'https://blob.gifcities.org/gifcities/';
  const cache = new Map();
  function element(tag, label) {
    const node = document.createElement(tag);
    if (label) node.textContent = label;
    return node;
  }
  function panel(root, choose, decorate) {
    let generation = 0, controller, results = [], offset = 0;
    const pageSize = 24;
    function clear() {
      generation++;
      if (controller) controller.abort();
      root.replaceChildren();
    }
    function draw() {
      root.replaceChildren();
      if (!results.length) {
        root.append(element('p','No GifCities matches. Try another word.'));
        return;
      }
      const pager = element('div'), grid = element('div');
      pager.className = 'art-pager';
      grid.className = 'stamp-grid';
      const prev = element('button','‹'), next = element('button','›');
      prev.type = next.type = 'button';
      prev.setAttribute('aria-label','Previous GifCities matches');
      next.setAttribute('aria-label','Next GifCities matches');
      prev.disabled = offset === 0;
      next.disabled = offset + pageSize >= results.length;
      prev.onclick = () => { offset -= pageSize; draw(); };
      next.onclick = () => { offset += pageSize; draw(); };
      pager.append(prev,element('span',(offset+1)+'–'+Math.min(offset+pageSize,results.length)+' of '+results.length),next);
      const feedback = element('p');
      feedback.setAttribute('role','status');
      for (const item of results.slice(offset,offset+pageSize)) {
        const tile = element('button'), image = element('img');
        tile.type='button'; tile.className='stamp'; tile.title=item.name;
        if (choose) image.crossOrigin='anonymous';
        image.src=item.url; image.alt=''; image.loading='lazy'; image.referrerPolicy='no-referrer';
        tile.append(image,element('span',item.name)); grid.append(decorate?decorate(tile,item):tile);
        image.draggable=false;
        if (choose) {
          tile.draggable=true;
          tile.dataset.archive=item.id;
          tile.onclick=()=>choose(item);
        } else {
          tile.onclick=()=>{
            const large=element('img'); large.src=item.url; large.alt=item.name;
            large.style.maxWidth='100%'; feedback.replaceChildren(large);
          };
        }
      }
      root.append(pager,grid,feedback);
    }
    async function search(value) {
      clear(); offset=0;
      const term=value.trim().slice(0,160);
      if (!term) {root.append(element('p','Enter a word to search GifCities.'));return;}
      const run=generation;
      root.append(element('p','Searching GifCities…'));
      controller=new AbortController();
      const active=controller;
      const timer=setTimeout(()=>active.abort(),75000);
      try {
        let matches=cache.get(term);
        if (!matches) {
          const response=await fetch(endpoint+'?'+new URLSearchParams({q:term}),{signal:active.signal,credentials:'omit'});
          if (!response.ok) throw Error('search');
          const rows=await response.json(),seen=new Set();
          matches=[];
          for (const row of rows) {
            const id=row.checksum;
            if (!/^[A-Z2-7]{32}$/.test(id) || seen.has(id)) continue;
            seen.add(id);
            matches.push({id,url:base+id+'.gif',width:Number(row.width)||0,height:Number(row.height)||0,name:(String(row.gif||'').split('/').pop() || row.url_text || term).slice(0,90)});
          }
          if(cache.size>=6) cache.delete(cache.keys().next().value);
          cache.set(term,matches);
        }
        if(run===generation){results=matches;draw();}
      } catch {
        if(run===generation) root.replaceChildren(element('p','GifCities could not be reached. Search again to retry.'));
      } finally {clearTimeout(timer);}
    }
    return {search,clear};
  }
  async function imageData(id) {
    if (typeof id !== 'string' || !/^[A-Z2-7]{32}$/.test(id)) throw Error('Choose a GifCities result again.');
    const response = await fetch(base + id + '.gif', {credentials:'omit', signal:AbortSignal.timeout(30000)});
    if (!response.ok) throw Error('GifCities could not load that GIF. Select it again to retry.');
    if (Number(response.headers.get('content-length')) > 98304) throw Error('This GIF exceeds the 96 KiB image limit.');
    const blob = await response.blob();
    const src = await window.RetroModel.readImage(blob.slice(0, blob.size, 'image/gif'));
    window.RetroModel.imageType(src);
    return src;
  }
  return {panel, imageData};
})();

/* Starter projects, saved art references, and the media search drawer. */
window.RetroStudioDrawer = (() => {
  const make=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
  const button=(text)=>{const el=make('button',text);el.type='button';return el;};
  const starters=[
    ['blank','Start blank'],['pocket-bog','Pocket Bog · Flash pet club'],['moon-relay','2001 Anime Shrine'],['player-two','Nintendo Repair Club'],
    ['fan-club','1995 Fan Club'],['radio-shack','1999 Radio Shack'],['personal-blog','2002 Personal Blog'],
    ['dial-up','Dial-up BBS'],['late-night','Late Night Signal']
  ];
  function chooseStarter(open,first){
    const chooser=make('dialog');chooser.className='starter-chooser';
    const header=make('header'),heading=make('h2',first?'Make your first homepage':'New homepage');
    heading.id='starter-heading';chooser.setAttribute('aria-labelledby',heading.id);
    const close=button('×');close.setAttribute('aria-label','Close starter chooser');close.onclick=()=>chooser.close();
    header.append(heading,close);const grid=make('div');grid.className='starter-grid';
    let choice;const cards=[];
    for(const [key,label] of starters){
      const tile=button('');tile.className='starter-card';tile.dataset.starter=key;
      if(key==='blank'){
        const page=make('span');page.className='blank-sheet';page.setAttribute('aria-hidden','true');tile.append(page);
      }else{
        const image=make('img');image.src='assets/starters/'+key+'.webp';image.alt='';tile.append(image);
      }
      tile.append(make('strong',label));cards.push(tile);grid.append(tile);
      tile.onclick=()=>{choice=key;cards.forEach(card=>card.setAttribute('aria-pressed',String(card===tile)));};
    }
    const foot=make('footer'),message=make('output',first?'': 'Creating a site replaces this working draft. Save a copy to keep it.');
    message.setAttribute('aria-live','polite');const create=button('Create site');create.className='starter-create';
    create.onclick=async()=>{
      create.disabled=true;const key=choice,label=starters.find(([id])=>id===key)[1];
      try{
        let doc;
        if(key==='blank')doc=RetroModel.blank();
        else if(key==='late-night')doc=RetroModel.copy(window.retroPresets.sample);
        else if(Object.hasOwn(window.RetroTemplates,label))doc=RetroModel.copy(window.RetroTemplates[label]);
        else{const response=await fetch('assets/starters/'+key+'.json');if(!response.ok)throw Error('Could not open the starter. Try again.');doc=await response.json();}
        if(!chooser.open)return;
        open({...doc,slug:'',listed:true},'Opened '+label+'.');chooser.close();
      }catch(error){message.textContent=error.message;}finally{create.disabled=false;}
    };
    foot.append(message,create);chooser.append(header,grid,foot);
    chooser.addEventListener('close',()=>chooser.remove(),{once:true});document.body.append(chooser);
    cards[0].click();chooser.showModal();
  }

  function artShelf(){
    const key='roddy.retro-page.art.v1';
    let state={favorites:[],recent:[]};
    try{const saved=JSON.parse(localStorage.getItem(key));if(Array.isArray(saved?.favorites)&&Array.isArray(saved?.recent))state=saved;}catch{}
    const token=row=>row.archive?'gif:'+row.archive:'stamp:'+row.group+'/'+row.label;
    function describe(row){
      if(row.archive)return {archive:row.archive,label:row.label,width:row.width||0,height:row.height||0};
      if(row.group)return {group:row.group,label:row.label};
      return null;
    }
    function write(){try{localStorage.setItem(key,JSON.stringify(state));}catch{}}
    function remember(row){
      const entry=describe(row);if(!entry)return;
      state.recent=[entry,...state.recent.filter(v=>token(v)!==token(entry))].slice(0,96);write();
    }
    function starred(row){return state.favorites.some(v=>token(v)===token(row));}
    function decorate(tile,row,refresh){
      const original=tile.querySelector('img'),frame=make('div');frame.className='art-card';
      const dim=make('small');dim.className='art-dim';
      const size=()=>{const w=original.naturalWidth||row.width,h=original.naturalHeight||row.height;if(w&&h)dim.textContent=w+' × '+h;};
      original.addEventListener('load',size,{once:true});size();tile.append(dim);frame.append(tile);
      if(describe(row)){
        const star=button('');star.className='art-star';
        function update(){const on=starred(row);star.textContent=on?'★':'☆';star.setAttribute('aria-pressed',String(on));star.title=(on?'Remove from':'Add to')+' favorites: '+row.label;star.setAttribute('aria-label',star.title);}
        update();star.onclick=()=>{
          state.favorites=starred(row)?state.favorites.filter(v=>token(v)!==token(row)):[describe(row),...state.favorites];
          write();update();refresh();
        };frame.append(star);
      }
      return frame;
    }
    return {remember,token,describe,decorate,items:name=>name==='Favorites'?state.favorites:state.recent};
  }
  function videoVault(place,relay){
    const root=make('section');root.className='video-vault';root.setAttribute('aria-label','Video Vault');
    const form=make('form'),query=make('input'),search=button('Search YouTube');
    query.type='search';query.required=true;query.maxLength=100;query.placeholder='Find old YouTube videos';query.setAttribute('aria-label','Find YouTube videos published through 2010');
    search.type='submit';form.append(make('small','Published on YouTube by December 31, 2010'),query,search);const status=make('output');status.setAttribute('aria-live','polite');
    const preview=make('div'),list=make('div'),more=button('More results');list.className='video-results';more.hidden=true;
    root.append(form,status,preview,list,more);
    let request=0,controller,next=null,lastQuery;
    function clearPreview(){preview.replaceChildren();preview.className='';}
    function addRow(item){
      const row=make('article'),pic=make('img');pic.src=item.thumbnail;pic.alt='';pic.loading='lazy';pic.referrerPolicy='no-referrer';
      const label=make('strong',item.title),date=make('small','Published on YouTube '+item.year);
      const audition=button('Preview'),use=button('Place on page');
      audition.onclick=()=>{
        clearPreview();preview.className='vault-preview';
        const object={kind:'box',widget:'video-player',href:item.url,text:item.title,playerSkin:'hardware'};
        const frame=make('div');frame.className='vault-screen';frame.innerHTML=RetroMedia.render(object,'modern');
        const close=button('Close preview');close.onclick=clearPreview;preview.append(frame,close);RetroMedia.mount(frame);
        frame.querySelector('.movie-load')?.click();preview.scrollIntoView({block:'nearest'});
      };
      use.onclick=()=>{try{place(item);status.textContent='Placed '+item.title+'.';}catch(error){status.textContent=error.message;}};
      const actions=make('div');actions.append(audition,use);row.append(pic,label,date,actions);list.append(row);
    }
    async function get(term,page){
      controller?.abort();controller=new AbortController();
      const run=++request;const abort=controller,timer=setTimeout(()=>abort.abort(),25000);
      more.disabled=true;status.textContent='Searching YouTube…';
      try{
        const params=new URLSearchParams({q:term});if(page)params.set('pageToken',page);
        const response=await fetch(relay+'/api/video-search?'+params,{credentials:'omit',signal:abort.signal});
        if(!response.ok){
          if(response.status===503)throw Error('YouTube search is unavailable right now. You can still paste a link into a YouTube video object.');
          if(response.status===429)throw Error('YouTube search has reached its request limit. Try again later.');
          throw Error('YouTube could not complete this search. Try again.');
        }
        const data=await response.json();if(!Array.isArray(data.items))throw Error('YouTube returned an unreadable search result.');
        const results=data.items.filter(r=>/^[A-Za-z0-9_-]{11}$/.test(r.id)).map(r=>({...r,url:'https://www.youtube.com/watch?v='+r.id,year:Number(r.year)}));
        const nextPage=data.nextPageToken;
        if(run!==request)return;
        const dated=results.filter(r=>Number.isInteger(r.year)&&r.year>=2005&&r.year<=2010);
        for(const item of dated)addRow(item);
        next=nextPage;more.hidden=!next;
        status.textContent=list.children.length?list.children.length+' videos through 2010.':'No YouTube videos matched through 2010.';
      }catch(error){if(run===request)status.textContent=error.name==='AbortError'?'Search timed out. Try again.':error.message;}
      finally{clearTimeout(timer);if(run===request)more.disabled=false;}
    }
    form.onsubmit=e=>{e.preventDefault();lastQuery=query.value.trim();if(!lastQuery)return;next=null;clearPreview();list.replaceChildren();more.hidden=true;get(lastQuery,null);};
    more.onclick=()=>get(lastQuery,next);
    root.stopPreview=clearPreview;
    return root;
  }
  return {chooseStarter,artShelf,videoVault};
})();

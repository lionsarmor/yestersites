(() => {
  'use strict';
  if(window===top || window.origin!=='null'){
    const shell=new URL('./',location.href);
    shell.hash=location.hash;
    location.replace(shell.href);
    return;
  }
  const $=id=>document.getElementById(id);
  const canvas=$('screen'), context=canvas.getContext('2d',{alpha:false});
  const attached=location.hash.startsWith('#data=');
  const source=attached?null:new URLSearchParams(location.hash.slice(1)).get('rom');
  const bundled=new URL('lantern-run.nes',location.href);
  const sample=!attached && (!source || source===bundled.href);
  const pond=!attached && source===new URL('pond-post.gb',location.href).href;
  let system='nes',fingerprint='',stored=false,lastSave=null,restoreAtStart=false;
  let stateId=0,saveBusy=false;
  const stateReplies=new Map();
  const maxSize=2*1024*1024+528;
  let worker=null, workerURL='', state='ready', pending=false, watched, clock=0, animation=0;
  let audio=null, volume=null, nextSound=0, audible=false;
  const held=new Map();


  function cartridgeURL(){
    if (sample) return bundled;
    let url;
    try { url=new URL(source); } catch { throw Error('Enter a complete HTTPS cartridge URL.'); }
    const host=url.hostname.toLowerCase().replace(/\.$/,'');
    if (url.protocol!=='https:' || url.username || url.password || url.port ||
        !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(host) || /(?:^|\.)(localhost|local|internal|test|invalid|home|lan)$/.test(host) ||
        /\.home\.arpa$/.test(host) || /^\d+([.]\d+)*$/.test(host)) {
      throw Error('Use a direct HTTPS URL on a public cartridge host.');
    }
    return url;
  }
  async function readCartridge(url, signal){
    let response;
    try{
      response=await fetch(url,{signal,mode:'cors',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',targetAddressSpace:'public'});
    }catch(err){
      if(signal.aborted)throw Error('Cartridge download timed out.');
      throw Error('Cannot read the cartridge. Use a direct URL on a host that allows CORS.');
    }
    if(!response.ok || !response.body)throw Error('Cartridge download failed (HTTP '+response.status+').');
    if(Number(response.headers.get('content-length'))>maxSize)throw Error('Cartridge exceeds the 2 MiB limit.');
    const reader=response.body.getReader(), chunks=[];
    let size=0;
    try{
      while(true){
        const {value,done}=await reader.read();
        if(done)break;
        size+=value.byteLength;
        if(size>maxSize){await reader.cancel();throw Error('Cartridge exceeds the 2 MiB limit.');}
        chunks.push(value);
      }
    }finally{reader.releaseLock();}
    const rom=new Uint8Array(size);
    let offset=0;
    for(const chunk of chunks){rom.set(chunk,offset);offset+=chunk.length;}
    return rom;
  }
  function input(key,id,down){
    if(!key || state!=='playing')return;
    let pressed=held.get(key);
    if(!pressed){pressed=new Set();held.set(key,pressed);}
    const before=pressed.size;
    if(down)pressed.add(id);else pressed.delete(id);
    if(Boolean(before)===Boolean(pressed.size))return;
    worker.postMessage({type:'key',key,down:pressed.size>0});
    document.querySelector('[data-key="'+key+'"]').classList.toggle('down',pressed.size>0);
  }
  function release(){
    for(const [key,ids] of held)for(const id of Array.from(ids))input(key,id,false);
    held.clear();
  }
  function saveButtons(){
    const active=Boolean(worker && fingerprint && ['paused','playing'].includes(state));
    $('save').disabled=!active || saveBusy;
    $('load-save').disabled=saveBusy || (state!=='ready' && !(active && (stored || lastSave)));
    $('export-save').disabled=!active || saveBusy;$('import-save').disabled=!active || saveBusy;
  }
  async function refreshSave(){
    const id=fingerprint;
    try{
      const bytes=await cartridgeSlot('get','state-'+id);
      if(fingerprint===id && bytes && !lastSave){stored=true;lastSave=bytes;saveButtons();}
    }catch{}
  }
  function engineState(type,packed){
    return new Promise((resolve,reject)=>{
      const id=++stateId;
      const timer=setTimeout(()=>{stateReplies.delete(id);reject(Error('The game did not answer the save request.'));},8000);
      stateReplies.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});
      worker.postMessage({type,id,packed});
    });
  }
  async function saveGame(portable=false){
    if(saveBusy || !worker)return;
    pause();saveBusy=true;saveButtons();
    try{
      const packed=await engineState('snapshot');lastSave=packed;
      if(portable){
        const values=new Uint8Array(packed);let text='';
        for(let i=0;i<values.length;i+=16384)text+=String.fromCharCode(...values.subarray(i,i+16384));
        $('save-code').value='CC1.'+fingerprint+'.'+btoa(text);$('save-code').focus();$('save-code').select();
        $('binding-hint').textContent='Save code ready to copy.';
      }else{
        await cartridgeSlot('put','state-'+fingerprint,packed);stored=true;
        $('status').textContent='Game saved on this device.';
      }
    }catch(error){$('status').textContent=error.message; if(!portable)$('help').textContent='Controls → Transfer a saved game can make a portable copy.';}
    finally{saveBusy=false;saveButtons();}
  }
  async function restoreGame(imported){
    if(saveBusy)return;
    if(state==='ready'){restoreAtStart=true;await launch();return;}
    if(!worker)return;
    pause();saveBusy=true;saveButtons();
    try{
      const packed=imported || (await cartridgeSlot('get','state-'+fingerprint).catch(()=>null)) || lastSave;
      if(!packed)throw Error('No saved game for this cartridge on this device.');
      await engineState('restore',packed);lastSave=packed;
      if(imported && $('options').open)$('options').close();
      resume();$('status').textContent='Saved game resumed.';
    }catch(error){$('status').textContent=error.message;$('binding-hint').textContent=error.message;}
    finally{saveBusy=false;saveButtons();}
  }
  $('save').onclick=()=>saveGame();$('load-save').onclick=()=>restoreGame();
  $('export-save').onclick=()=>saveGame(true);
  $('import-save').onclick=()=>{
    const code=$('save-code').value.trim().split('.');
    if(code.length!==3 || code[0]!=='CC1' || code[1]!==fingerprint){$('binding-hint').textContent='Choose a save code for this exact cartridge.';return;}
    try{
      const packed=Uint8Array.from(atob(code[2]),c=>c.charCodeAt(0));
      if(!packed.length || packed.length>1024*1024)throw Error();
      restoreGame(packed.buffer);
    }catch{$('binding-hint').textContent='Invalid save code.';}
  };
  function showState(next,message){
    state=next;document.body.className=next;
    $('status').textContent=message;
    $('power').classList.toggle('on',state==='playing');
    $('power').title=state==='playing'?'Power on':'Power off';
    $('pause').disabled=!['playing','paused'].includes(state);
    $('pause').textContent=state==='paused'?'Resume':'Pause';
    $('play').disabled=state==='loading';
    $('play').textContent={ready:'Play cartridge',loading:'Loading…',paused:'Resume game',error:'Try again'}[state]||'Play cartridge';
    $('curtain').hidden=state==='playing';
    $('poster').hidden=!(sample||pond) || state==='paused';
    $('cart').hidden=sample || pond || state==='paused';
    saveButtons();
    for(const button of document.querySelectorAll('[data-key]'))button.disabled=state!=='playing';
  }
  function silence(){
    if(volume && audio){volume.gain.value=0;volume.disconnect();volume=null;}
    nextSound=0;
  }
  function stopWorkers(){
    clearTimeout(watched);cancelAnimationFrame(animation);pending=false;release();silence();
    worker?.terminate();worker=null;
    if(workerURL){URL.revokeObjectURL(workerURL);workerURL='';}
  }
  function fail(message){stopWorkers();showState('error',message);}
  function arm(){clearTimeout(watched);watched=setTimeout(()=>fail('The cartridge stopped responding.'),4000);}
  function scheduleSound(data){
    if(!audible || !data.samples || !data.sampleCount || audio?.state!=='running' || state!=='playing')return;
    if(!volume){volume=audio.createGain();volume.gain.value=.42;volume.connect(audio.destination);}
    const now=audio.currentTime;
    if(nextSound>now+.16)return;
    const buffer=audio.createBuffer(1,data.sampleCount,44100);
    buffer.copyToChannel(new Float32Array(data.samples,0,data.sampleCount),0);
    const sound=audio.createBufferSource();sound.buffer=buffer;sound.connect(volume);
    nextSound=Math.max(now+.015,nextSound);sound.start(nextSound);nextSound+=buffer.duration;
  }
  const controls=installDeckControls(input,pause);
  function animate(now){
    if(state!=='playing')return;
    controls.poll();
    if(!pending){
      const count=Math.min(2,Math.floor((now-clock)*60/1000));
      if(count>0){
        clock=now-clock>52?now:clock+count*1000/60;
        pending=true;arm();worker.postMessage({type:'frame',count,sound:audible});
      }
    }
    animation=requestAnimationFrame(animate);
  }
  function resume(){
    if(state==='playing')return;
    showState('playing','Playing');canvas.focus({preventScroll:true});
    if(audible && audio)audio.resume().catch(()=>{});
    clock=performance.now()-17;animation=requestAnimationFrame(animate);
  }
  function pause(){
    if(state!=='playing')return;
    release();silence();cancelAnimationFrame(animation);showState('paused','Paused');
  }
  async function launch(){
    if(state==='loading'||state==='playing')return;
    if(state==='paused'){resume();return;}
    showState('loading','Reading cartridge…');
    const download=new AbortController(), timer=setTimeout(()=>download.abort(),15000);
    try{
      let rom;
      if(attached){
        const blob=location.hash.slice('#data='.length);
        if(!blob.length || blob.length>4*Math.ceil(524288/3))throw Error('Attached cartridge exceeds 512 KiB.');
        try{rom=Uint8Array.from(atob(blob),c=>c.charCodeAt(0));}catch{throw Error('Invalid attached cartridge encoding.');}
        if(rom.byteLength>524288)throw Error('Attached cartridge exceeds 512 KiB.');
      }else rom=await readCartridge(cartridgeURL(),download.signal);
      const info=CartridgeFormat.inspect(rom);system=info.system;
      fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',rom)),b=>b.toString(16).padStart(2,'0')).join('');
      stored=false;lastSave=null;
      if(info.title && !pond)$('label').textContent=info.title;
      if(info.title==='POND POST')$('help').textContent='Deliver three letters. Move to a post box and press A.';
      canvas.setAttribute('aria-label','Playable game screen. Open Controls for keyboard and controller bindings.');
      canvas.width=system==='gb'?160:256;canvas.height=system==='gb'?144:240;
      $('display').classList.toggle('gb',system==='gb');
      const engine=system==='gb'?'binjgb-6c04827/binjgb.js':'jsnes-2.1.0/jsnes.min.js';
      async function asset(name,asBinary=false){
        const response=await fetch(new URL(name,location.href),{signal:download.signal,credentials:'omit',redirect:'error'});
        if(!response.ok)throw Error('Could not load the cartridge engine.');
        return asBinary?response.arrayBuffer():response.text();
      }
      const [core,codec,adapter,wasm]=await Promise.all([
        asset(engine),asset('state-worker.js'),asset(system==='gb'?'gb-worker.js':'engine-worker.js'),
        system==='gb'?asset('binjgb-6c04827/binjgb.wasm',true):null
      ]);
      workerURL=URL.createObjectURL(new Blob([core,'\n',codec,'\n',adapter],{type:'text/javascript'}));
      worker=new Worker(workerURL);
      worker.onerror=()=>fail('The cartridge engine could not start.');
      worker.onmessage=({data})=>{
        if(data.type==='state'){
          const reply=stateReplies.get(data.id);
          if(reply){stateReplies.delete(data.id);data.error?reply.reject(Error(data.error)):reply.resolve(data.packed);}
          return;
        }
        clearTimeout(watched);
        if(data.type==='error'){fail(data.unsupported?'This cartridge mapper is unsupported.':'This cartridge could not run.');return;}
        if(data.type==='loaded'){
          controls.connect();resume();
          if(restoreAtStart){restoreAtStart=false;restoreGame();}
          else refreshSave();
          return;
        }
        if(data.type==='frame'){
          pending=false;
          context.putImageData(new ImageData(new Uint8ClampedArray(data.pixels),canvas.width,canvas.height),0,0);
          scheduleSound(data);
        }
      };
      arm();worker.postMessage({type:'load',rom:rom.buffer,wasm},wasm?[rom.buffer,wasm]:[rom.buffer]);
    }catch(error){fail(download.signal.aborted?'Cartridge download timed out.':error.message);}
    finally{clearTimeout(timer);download.abort();}
  }
  $('label').textContent=pond?'Pond Post':attached?'Attached cartridge':'Lantern Run';
  if(pond){
    $('poster').src='pond-post.png';
    $('help').textContent='Deliver three letters. Move to a post box and press X or the A button.';
  }else if(!sample && !attached){
    try{$('label').textContent=decodeURIComponent(cartridgeURL().pathname.split('/').pop()||'Game cartridge').slice(0,90);}
    catch{$('label').textContent='Game cartridge';}
  }else if(sample)$('help').textContent='Catch six fireflies. Arrows move · hold X or the A button to dash.';
  let expandedByPage=false;
  function sizeLabel(){$('full').textContent=(expandedByPage || document.fullscreenElement)?'Exit full screen':'Full screen';}
  window.addEventListener('message',event=>{
    if(event.source===parent && typeof event.data?.cartridgeExpanded==='boolean'){expandedByPage=event.data.cartridgeExpanded;sizeLabel();}
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape' && expandedByPage)parent.postMessage({cartridgeSize:'exit'},'*');});
  $('full').onclick=async()=>{
    if(expandedByPage){parent.postMessage({cartridgeSize:'toggle'},'*');return;}
    try{
      if(document.fullscreenElement)await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    }catch{
      parent.postMessage({cartridgeSize:'toggle'},'*');
    }
  };
  document.addEventListener('fullscreenchange',sizeLabel);
  $('help').textContent+=' Gamepad: press any button, then use the D-pad or left stick.';
  $('play').onclick=launch;
  $('pause').onclick=()=>state==='playing'?pause():resume();
  $('sound').onclick=async()=>{
    if(!audible){
      try{
        audio ||= new AudioContext();
        await audio.resume();audible=true;
      }catch{$('status').textContent='Sound unavailable';return;}
    }else{audible=false;silence();}
    $('sound').setAttribute('aria-pressed',String(audible));$('sound').textContent=audible?'Sound on':'Sound off';
  };
  for(const button of document.querySelectorAll('[data-key]')){
    button.onpointerdown=e=>{e.preventDefault();button.setPointerCapture(e.pointerId);input(button.dataset.key,e.pointerId,true);};
    button.onpointerup=button.onlostpointercapture=e=>input(button.dataset.key,e.pointerId,false);
    button.onkeydown=e=>{if(['Enter',' '].includes(e.key)){e.stopPropagation();e.preventDefault();input(button.dataset.key,'button',true);}};
    button.onkeyup=e=>{if(['Enter',' '].includes(e.key)){e.stopPropagation();e.preventDefault();input(button.dataset.key,'button',false);}};
    button.onblur=()=>input(button.dataset.key,'button',false);
  }
  document.addEventListener('keydown',e=>{
    const key=controls.key(e.code);
    if(e.metaKey||e.altKey||e.ctrlKey||!key||state!=='playing' || $('options').open)return;
    if(e.code==='Enter' && e.target.closest('button'))return;
    e.preventDefault();input(key,e.code,true);
  });
  document.addEventListener('keyup',e=>input(controls.key(e.code),e.code,false));
  window.addEventListener('blur',pause);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
  window.addEventListener('pagehide',e=>{
    if(e.persisted){pause();return;}
    stopWorkers();
    if(audio)audio.close().catch(()=>{});
  });
  showState('ready','Ready');
})();

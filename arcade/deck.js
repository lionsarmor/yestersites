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
  const source=new URLSearchParams(location.hash.slice(1)).get('rom');
  const bundled=new URL('lantern-run.nes',location.href);
  const sample=!source || source===bundled.href;
  const maxSize=2*1024*1024+528;
  let worker=null, workerURL='', state='ready', pending=false, watched, clock=0, animation=0;
  let audio=null, volume=null, nextSound=0, audible=false;
  const held=new Map();
  const keys={ArrowUp:'UP',ArrowDown:'DOWN',ArrowLeft:'LEFT',ArrowRight:'RIGHT',KeyX:'A',KeyZ:'B',Enter:'START',ShiftLeft:'SELECT',ShiftRight:'SELECT'};

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
    if(size<16 || rom[0]!==78 || rom[1]!==69 || rom[2]!==83 || rom[3]!==26 || !rom[4] || (rom[7]&12)!==0){
      throw Error('Choose an uncompressed iNES 1.0 .nes cartridge.');
    }
    const expected=16+(rom[6]&4?512:0)+rom[4]*16384+rom[5]*8192;
    if(expected!==size)throw Error('The cartridge length does not match its header.');
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
    $('poster').hidden=!sample || state==='paused';
    $('cart').hidden=sample || state==='paused';
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
  let padEnabled=true;
  const padKeys={A:0,B:1,SELECT:8,START:9,UP:12,DOWN:13,LEFT:14,RIGHT:15};
  function readPad(){
    if(!padEnabled || !navigator.getGamepads)return;
    let pads;
    try{pads=navigator.getGamepads();}catch{padEnabled=false;return;}
    if(!document.hasFocus())return;
    const p=Array.from(pads).find(p=>p && p.mapping==='standard');
    for(const [key,n] of Object.entries(padKeys)){
      const x=p?.axes[0]||0,y=p?.axes[1]||0;
      const stick={LEFT:x<-.45,RIGHT:x>.45,UP:y<-.45,DOWN:y>.45};
      input(key,'gamepad',Boolean(p?.buttons[n]?.pressed || stick[key]));
    }
  }
  function animate(now){
    if(state!=='playing')return;
    readPad();
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
      const url=cartridgeURL();
      // Worker source is assembled exclusively from these two bundled, same-release files.
      // ROM bytes cross the worker boundary as data and are interpreted by JSNES.
      const [rom,...sources]=await Promise.all([readCartridge(url,download.signal),
        ...['jsnes-2.1.0/jsnes.min.js','engine-worker.js'].map(async filename=>{
          const response=await fetch(new URL(filename,location.href),{signal:download.signal,credentials:'omit',redirect:'error'});
          if(!response.ok)throw Error('Could not load the cartridge engine.');
          return response.text();
        })]);
      workerURL=URL.createObjectURL(new Blob([sources[0],'\n',sources[1]],{type:'text/javascript'}));
      worker=new Worker(workerURL);
      worker.onerror=()=>fail('The cartridge engine could not start.');
      worker.onmessage=({data})=>{
        clearTimeout(watched);
        if(data.type==='error'){fail(data.unsupported?'This cartridge mapper is unsupported.':'This cartridge could not run.');return;}
        if(data.type==='loaded'){resume();return;}
        if(data.type==='frame'){
          pending=false;
          context.putImageData(new ImageData(new Uint8ClampedArray(data.pixels),256,240),0,0);
          scheduleSound(data);
        }
      };
      arm();worker.postMessage({type:'load',rom:rom.buffer},[rom.buffer]);
    }catch(error){fail(download.signal.aborted?'Cartridge download timed out.':error.message);}
    finally{clearTimeout(timer);download.abort();}
  }
  $('label').textContent='Lantern Run';
  if(!sample){
    try{$('label').textContent=decodeURIComponent(cartridgeURL().pathname.split('/').pop()||'Game cartridge').slice(0,90);}
    catch{$('label').textContent='Game cartridge';}
  }else $('help').textContent='Catch six fireflies. Arrows move · hold X or the A button to dash.';
  $('full').onclick=async()=>{
    try{
      if(document.fullscreenElement)await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    }catch{
      $('status').textContent='Open the full player from the game link for a larger screen.';
    }
  };
  document.addEventListener('fullscreenchange',()=>{$('full').textContent=document.fullscreenElement?'Exit full screen':'Full screen';});
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
    if(e.metaKey||e.altKey||e.ctrlKey||!keys[e.code]||state!=='playing')return;
    if(e.code==='Enter' && e.target.closest('button'))return;
    e.preventDefault();input(keys[e.code],e.code,true);
  });
  document.addEventListener('keyup',e=>input(keys[e.code],e.code,false));
  window.addEventListener('blur',release);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
  window.addEventListener('pagehide',e=>{
    if(e.persisted){pause();return;}
    stopWorkers();
    if(audio)audio.close().catch(()=>{});
  });
  showState('ready','Ready');
})();

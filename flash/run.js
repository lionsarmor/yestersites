(() => {
  const base=new URL('./',document.currentScript.src).href, runtime=base+'ruffle-0.8.0/';
  const screen=document.getElementById('screen'),status=document.getElementById('status'),button=document.getElementById('play');
  const movie=document.getElementById('movie'),data=movie.textContent;
  window.RufflePlayer={config:{publicPath:runtime,polyfills:false,autoplay:'on',allowScriptAccess:false,allowNetworking:'none',openUrlMode:'deny',socketProxy:[],credentialAllowList:[],allowFullscreen:false,contextMenu:false,showSwfDownload:false}};
  let library;
  function loadLibrary(){
    if(!library)library=new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src=runtime+'ruffle.js';script.crossOrigin='anonymous';
      script.onload=resolve;script.onerror=()=>{library=null;reject(Error('Player unavailable'));};document.head.append(script);
    });
    return library;
  }
  button.onclick=async()=>{
    button.disabled=true;status.textContent='Loading projector…';
    try{
      await loadLibrary();
      let bytes;
      const book=movie.dataset.book==='true';
      const parameters=book?{book:new TextDecoder().decode(Uint8Array.from(atob(data),ch=>ch.charCodeAt(0)))}:{};
      if(data==='demo'||book){const response=await fetch(base+(book?'scene-book.swf':'comet.swf'),{credentials:'omit'});if(!response.ok)throw Error();bytes=new Uint8Array(await response.arrayBuffer());}
      else bytes=Uint8Array.from(atob(data),ch=>ch.charCodeAt(0));
      const player=window.RufflePlayer.newest().createPlayer();
      screen.className='playing';screen.replaceChildren(player);
      const engine=player.ruffle();
      await engine.load({data:bytes,parameters,forceScale:true,scale:movie.dataset.scale,backgroundColor:movie.dataset.matte,swfFileName:'movie.swf',...window.RufflePlayer.config});
      if(movie.dataset.transport==='true'){
        const bar=document.createElement('div'),pause=document.createElement('button'),restart=document.createElement('button'),info=document.createElement('small');
        bar.id='transport';pause.textContent='Pause';restart.textContent='Restart';info.textContent='Flash stage';
        pause.onclick=()=>{if(engine.suspended){engine.resume();pause.textContent='Pause';}else{engine.suspend();pause.textContent='Resume';}};
        restart.onclick=async()=>{pause.disabled=restart.disabled=true;try{await engine.reload();engine.resume();pause.textContent='Pause';}catch{info.textContent='Restart failed';}finally{pause.disabled=restart.disabled=false;}};
        bar.append(pause,restart,info);screen.append(bar);
      }
    }catch{screen.className='';screen.replaceChildren(button,status);button.disabled=false;status.textContent='Playback failed. This movie needs a supported browser and a self-contained SWF.';}
  };
  button.disabled=false;status.textContent='Ruffle projector';
})();

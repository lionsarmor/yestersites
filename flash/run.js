(() => {
  const base=new URL('./',document.currentScript.src).href, runtime=base+'ruffle-0.8.0/';
  const screen=document.getElementById('screen'),status=document.getElementById('status'),button=document.getElementById('play');
  const data=document.getElementById('movie').textContent;
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
      if(data==='demo'){const response=await fetch(base+'comet.swf',{credentials:'omit'});if(!response.ok)throw Error();bytes=new Uint8Array(await response.arrayBuffer());}
      else bytes=Uint8Array.from(atob(data),ch=>ch.charCodeAt(0));
      const player=window.RufflePlayer.newest().createPlayer();
      screen.className='playing';screen.replaceChildren(player);
      await player.ruffle().load({data:bytes,swfFileName:'movie.swf',...window.RufflePlayer.config});
    }catch{screen.className='';screen.replaceChildren(button,status);button.disabled=false;status.textContent='Playback failed. This movie needs a supported browser and a self-contained SWF.';}
  };
  button.disabled=false;status.textContent='Ruffle projector';
})();

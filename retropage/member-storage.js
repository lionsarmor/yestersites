/* Install in the creator page that owns the official cartridge iframe. */
function installCartridgeStorage(){
  if(typeof window==='undefined' || window.__ysCartridgeStorage)return;
  window.__ysCartridgeStorage=true;
  let opening;
  function database(){
    if(!opening)opening=new Promise((resolve,reject)=>{
      const request=indexedDB.open('yestersites-cartridge-saves',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('slots');
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    }).catch(e=>{opening=null;throw e;});
    return opening;
  }
  window.addEventListener('message',async event=>{
    const request=event.data?.cartridgeStorage,port=event.ports[0];
    const gamepad=event.data?.cartridgePad==='connect';
    if(!port || (!gamepad && (!request || !['get','put'].includes(request.action))))return;
    const standalone=/^\/arcade\/(?:index\.html)?$/.test(location.pathname) && window===window.parent;
    const frame=Array.from(document.querySelectorAll('iframe[src]')).find(f=>{
      if(f.contentWindow!==event.source)return false;
      try{
        const url=new URL(f.getAttribute('src'),document.baseURI);
        if(standalone && url.origin===location.origin && url.pathname==='/arcade/deck.html')return true;
        return url.origin==='https://yestersites.com' && /^\/arcade\/(?:index\.html)?$/.test(url.pathname);
      }catch{return false;}
    });
    if(!frame)return;
    if(gamepad){
      let active=true,previous='';
      port.onmessage=()=>{active=false;port.close();};
      const poll=()=>{
        if(!active || !frame.isConnected){port.close();return;}
        let pad;
        try{pad=Array.from(navigator.getGamepads?.()||[]).find(p=>p && p.connected);}catch{}
        const current=pad?{name:pad.id.slice(0,90),buttons:pad.buttons.slice(0,32).map(b=>b.pressed),axes:pad.axes.slice(0,2).map(v=>Math.round(v*100)/100)}:null;
        const signature=JSON.stringify(current);
        if(signature!==previous){previous=signature;port.postMessage({pad:current});}
        requestAnimationFrame(poll);
      };
      poll();return;
    }
    const slot=request.slot,isPrefs=slot==='controls-v1';
    if(typeof slot!=='string' || (!isPrefs && !/^state-[0-9a-f]{64}$/.test(slot)))return;
    const limit=isPrefs?4096:1024*1024;
    const payload=request.data;
    if(request.action==='put' && (!(payload instanceof ArrayBuffer) || !payload.byteLength || payload.byteLength>limit))return;
    const member=location.pathname.match(/^\/members\/([a-z0-9-]+)\//);
    const namespace=member?'member:'+member[1]:'site';
    const key=namespace+'/'+slot;
    try{
      const db=await database(),write=request.action==='put';
      const tx=db.transaction('slots',write?'readwrite':'readonly');
      const store=tx.objectStore('slots');
      let result;
      if(write){
        // Bound consumption by a shared-service host and by an individual author.
        const count=store.count(IDBKeyRange.bound(namespace+'/',namespace+'/\uffff'));
        count.onsuccess=()=>{
          const existing=store.getKey(key);
          existing.onsuccess=()=>{if(count.result>=32 && existing.result===undefined){tx.abort();return;}store.put(payload,key);};
        };
      }else{
        const read=store.get(key);
        read.onsuccess=()=>{result=read.result;};
      }
      tx.oncomplete=()=>{port.postMessage({ok:true,data:result||null});port.close();};
      tx.onabort=()=>{port.postMessage({ok:false});port.close();};
    }catch{port.postMessage({ok:false});port.close();}
  });
}

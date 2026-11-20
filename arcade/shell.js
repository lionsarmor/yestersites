function openCartridge(){
  const target=new URL('deck.html',location.href);
  target.hash=location.hash;
  // A fragment-only navigation must discard the previous cartridge and sound.
  const previous=document.querySelector('iframe');
  const player=previous.cloneNode(false);
  player.src=target.href;
  previous.replaceWith(player);
}
openCartridge();
window.addEventListener('hashchange',openCartridge);

window.addEventListener('message',event=>{
  const game=document.querySelector('iframe').contentWindow;
  if(event.source===game && ['toggle','exit'].includes(event.data?.cartridgeSize) && parent!==window){
    parent.postMessage({cartridgeSize:event.data.cartridgeSize},'*');
  }else if(event.source===parent && parent!==window && typeof event.data?.cartridgeExpanded==='boolean'){
    game.postMessage({cartridgeExpanded:event.data.cartridgeExpanded},'*');
  }
});

if(parent===window)installCartridgeStorage();
else window.addEventListener('message',event=>{
  if(event.source===document.querySelector('iframe').contentWindow && event.ports.length===1 &&
    (event.data?.cartridgeStorage || event.data?.cartridgePad==='connect')){
    parent.postMessage(event.data,'*',[event.ports[0]]);
  }
});

function cartridgeSlot(action,slot,data){
  return new Promise((resolve,reject)=>{
    const channel=new MessageChannel();
    const timer=setTimeout(()=>{channel.port1.close();reject(Error('Device storage is unavailable here.'));},2500);
    channel.port1.onmessage=e=>{
      clearTimeout(timer);channel.port1.close();
      if(e.data?.ok)resolve(e.data.data);else reject(Error('Device storage is full or unavailable.'));
    };
    parent.postMessage({cartridgeStorage:{action,slot,data}},'*',[channel.port2]);
  });
}
function installDeckControls(onKey,pause){
  const $=id=>document.getElementById(id);
  const keyboard={UP:'ArrowUp',DOWN:'ArrowDown',LEFT:'ArrowLeft',RIGHT:'ArrowRight',A:'KeyX',B:'KeyZ',START:'Enter',SELECT:'ShiftLeft'};
  const buttons={UP:12,DOWN:13,LEFT:14,RIGHT:15,A:0,B:1,START:9,SELECT:8};
  const actions=Object.keys(keyboard);
  const defaults=()=>({hand:'right',size:'normal',keys:{...keyboard},buttons:{...buttons}});
  let prefs=defaults(),binding=null,currentPad='',remote=null,remotePort=null,lastButtons=[],changed=false,write=Promise.resolve();
  const validCode=code=>typeof code==='string' && /^[A-Za-z][A-Za-z0-9]{0,30}$/.test(code) && !['Escape','Tab','MetaLeft','MetaRight','AltLeft','AltRight','ControlLeft','ControlRight'].includes(code);
  function apply(){
    document.body.dataset.hand=prefs.hand;document.body.dataset.buttonSize=prefs.size;
    $('hand').value=prefs.hand;$('button-size').value=prefs.size;
    for(const entry of $('bindings').querySelectorAll('button')){
      const key=entry.dataset.keyName,kind=entry.dataset.kind;
      entry.textContent=binding?.key===key && binding.kind===kind?'Press…':kind==='keys'?prefs.keys[key].replace(/^(Key|Digit)/,''):'Button '+(prefs.buttons[key]+1);
      entry.setAttribute('aria-label',key+' '+(kind==='keys'?'keyboard':'controller')+' binding: '+entry.textContent);
    }
  }
  function remember(){
    changed=true;apply();
    const bytes=new TextEncoder().encode(JSON.stringify(prefs)).buffer;
    write=write.then(()=>cartridgeSlot('put','controls-v1',bytes)).catch(()=>{$('binding-hint').textContent='Using these controls for this visit. Device storage is unavailable.';});
  }
  function bind(value){
    const {key,kind}=binding,mapping=prefs[kind],old=mapping[key];
    const other=actions.find(k=>k!==key && mapping[k]===value);
    if(other)mapping[other]=old;
    mapping[key]=value;binding=null;remember();$('binding-hint').textContent='Binding updated.';
  }
  for(const action of actions){
    const row=$('bindings').insertRow(),name=document.createElement('th');
    name.scope='row';name.textContent=action[0]+action.slice(1).toLowerCase();row.append(name);
    for(const kind of ['keys','buttons']){
      const entry=document.createElement('button');entry.dataset.keyName=action;entry.dataset.kind=kind;
      entry.onclick=()=>{
        binding={key:action,kind};apply();
        $('binding-hint').textContent=kind==='keys'?'Press a keyboard key. Escape cancels.':'Press the controller button to use. Escape cancels.';
      };
      row.insertCell().append(entry);
    }
  }
  document.addEventListener('keydown',e=>{
    if(!binding)return;
    e.preventDefault();e.stopImmediatePropagation();
    if(e.key==='Escape'){binding=null;apply();return;}
    if(binding.kind==='keys' && validCode(e.code) && !e.repeat)bind(e.code);
  },true);
  $('hand').onchange=()=>{prefs.hand=$('hand').value;remember();};
  $('button-size').onchange=()=>{prefs.size=$('button-size').value;remember();};
  $('defaults').onclick=()=>{prefs=defaults();binding=null;remember();$('binding-hint').textContent='Default layout and bindings restored.';};
  function connect(){
    if(remotePort){remotePort.postMessage('stop');remotePort.close();}
    remote=null;
    const bridge=new MessageChannel();remotePort=bridge.port1;
    remotePort.onmessage=e=>{remote=e.data?.pad||null;};
    parent.postMessage({cartridgePad:'connect'},'*',[bridge.port2]);
  }
  function poll(){
    let gamepad;
    try{gamepad=Array.from(navigator.getGamepads?.()||[]).find(p=>p && p.connected);}catch{}
    const values=gamepad?gamepad.buttons.map(b=>b.pressed):remote?.buttons||[];
    const axes=gamepad?.axes||remote?.axes||[];
    const name=(gamepad?.id||remote?.name||'').slice(0,90);
    if(name!==currentPad || !$('controller-status').textContent || $('controller-status').textContent.startsWith('Looking')){
      currentPad=name;
      $('controller-status').textContent=name?'Connected: '+name:'No controller detected. Press a controller button, then Reconnect.';
      $('pad-presence').textContent=name?'Controller: '+name:'';$('pad-presence').hidden=!name;
    }
    if(binding?.kind==='buttons'){
      const idx=values.findIndex((pressed,i)=>pressed && !lastButtons[i]);if(idx>=0&&idx<32)bind(idx);
    }
    const stick={LEFT:axes[0]<-.45,RIGHT:axes[0]>.45,UP:axes[1]<-.45,DOWN:axes[1]>.45};
    for(const action of actions)onKey(action,'gamepad',Boolean(values[prefs.buttons[action]]||stick[action]));
    lastButtons=values.slice();
  }
  $('settings').onclick=()=>{pause();$('options').showModal();connect();poll();};
  $('close-options').onclick=()=>$('options').close();
  $('options').onclose=()=>{binding=null;apply();};
  $('reconnect').onclick=()=>{$('controller-status').textContent='Looking for a controller…';connect();poll();};
  window.addEventListener('gamepadconnected',poll);window.addEventListener('gamepaddisconnected',poll);
  const timer=setInterval(()=>{if($('options').open)poll();},66);
  window.addEventListener('pagehide',e=>{if(!e.persisted){clearInterval(timer);remotePort?.postMessage('stop');remotePort?.close();}});
  cartridgeSlot('get','controls-v1').then(saved=>{
    if(!saved || changed)return;
    const p=JSON.parse(new TextDecoder().decode(saved));
    if(['left','right'].includes(p.hand) && ['large','normal'].includes(p.size) &&
      actions.every(k=>validCode(p.keys?.[k]) && Number.isInteger(p.buttons?.[k]) && p.buttons[k]>=0 && p.buttons[k]<32) &&
      new Set(actions.map(k=>p.keys[k])).size===8 && new Set(actions.map(k=>p.buttons[k])).size===8){prefs=p;apply();}
  }).catch(()=>{});
  apply();poll();
  return {poll,connect,key:code=>actions.find(k=>prefs.keys[k]===code || (code==='ShiftRight' && prefs.keys[k]==='ShiftLeft'))};
}

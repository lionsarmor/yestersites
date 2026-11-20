/* Binjgb 6c04827 WASM is pinned and compiled before a cartridge is loaded. */
'use strict';
let core, machine;
function mem(ptr,size){return new Uint8Array(core.HEAP8.buffer,ptr,size);}
function gbState(load){
  const slot=core._state_file_data_new(machine);
  if(!slot)throw Error('State memory unavailable.');
  try{
    const bytes=mem(core._get_file_data_ptr(slot),core._get_file_data_size(slot));
    if(load){
      if(load.byteLength!==bytes.length)throw Error('Incompatible Game Boy save.');
      bytes.set(load);
      if(core._emulator_read_state(machine,slot)!==0)throw Error('Invalid Game Boy save.');
    }else{
      if(core._emulator_write_state(machine,slot)!==0)throw Error('State capture failed.');
      return bytes.slice();
    }
  }finally{core._file_data_delete(slot);core._free(slot);}
}
self.onmessage=async({data})=>{
  try{
    if(data.type==='snapshot'||data.type==='restore'){
      await stateCommand(data,()=>gbState(),bytes=>gbState(bytes));return;
    }
    if(data.type==='load'){
      const compiled=await WebAssembly.compile(data.wasm);
      core=await Binjgb({instantiateWasm(imports,ready){ready(new WebAssembly.Instance(compiled,imports));return {};}});
      const rom=new Uint8Array(data.rom),size=Math.ceil(rom.length/32768)*32768,ptr=core._malloc(size);
      const image=mem(ptr,size);image.fill(0);image.set(rom);
      machine=core._emulator_new_simple(ptr,size,44100,256,2);
      if(!machine)throw Error('Game Boy cartridge rejected.');
      core._emulator_set_default_joypad_callback(machine,core._joypad_new());
      core._emulator_set_builtin_palette(machine,83);
      self.postMessage({type:'loaded'});
    }else if(data.type==='key'){
      const name={A:'A',B:'B',UP:'up',DOWN:'down',LEFT:'left',RIGHT:'right',START:'start',SELECT:'select'}[data.key];
      if(name)core['_set_joyp_'+name](machine,Number(data.down));
    }else if(data.type==='frame'){
      const end=core._emulator_get_ticks_f64(machine)+70224*data.count;
      const mix=[];
      let event=0;
      do{
        event=core._emulator_run_until_f64(machine,end);
        if(event&2 && data.sound){
          const audio=mem(core._get_audio_buffer_ptr(machine),core._get_audio_buffer_capacity(machine));
          for(let i=0;i<audio.length;i+=2)mix.push((audio[i]+audio[i+1])/510);
        }
      }while(!(event&4));
      const pixels=mem(core._get_frame_buffer_ptr(machine),160*144*4).slice();
      const samples=new Float32Array(mix);
      self.postMessage({type:'frame',pixels:pixels.buffer,samples:samples.buffer,sampleCount:samples.length},[pixels.buffer,samples.buffer]);
    }
  }catch{self.postMessage({type:'error'});}
};

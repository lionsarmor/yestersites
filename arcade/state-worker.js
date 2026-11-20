/* Both cores pack their native state with the browser gzip implementation. */
async function stateCommand(data,snapshot,restore){
  try{
    if(data.type==='snapshot'){
      const stream=new Blob([snapshot()]).stream().pipeThrough(new CompressionStream('gzip'));
      const packed=await new Response(stream).arrayBuffer();
      if(packed.byteLength>1024*1024-72)throw Error('Save exceeds one MiB.');
      self.postMessage({type:'state',id:data.id,packed},[packed]);
    }else{
      if(!(data.packed instanceof ArrayBuffer) || data.packed.byteLength>1024*1024)throw Error();
      const reader=new Blob([data.packed]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
      const parts=[];let size=0;
      while(true){
        const {done,value}=await reader.read();if(done)break;
        size+=value.length;
        if(size>16*1024*1024){await reader.cancel();throw Error();}
        parts.push(value);
      }
      restore(new Uint8Array(await new Blob(parts).arrayBuffer()));
      self.postMessage({type:'state',id:data.id});
    }
  }catch{self.postMessage({type:'state',id:data.id,error:'This save could not be processed by this engine.'});}
}

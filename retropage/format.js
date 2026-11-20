/* Shared by the player, editor and publication validator. */
const CartridgeFormat=(()=>{
  const nesMappers=new Set([0,1,2,3,4,5,7,9,11,34,38,66,71,79,94,118,119,140,180,240,241]);
  const gbMappers=new Set([0,1,2,3,5,6,8,9,11,12,13,15,16,17,18,19,25,26,27,28,29,30,255]);
  function inspect(bytes){
    if(!bytes || typeof bytes.length!=='number' || bytes.length>2097680)throw Error('Cartridge exceeds the 2 MiB limit.');
    if(bytes.length>=16 && bytes[0]===78 && bytes[1]===69 && bytes[2]===83 && bytes[3]===26){
      if(!bytes[4] || (bytes[7]&12)!==0)throw Error('Choose an iNES 1.0 cartridge.');
      const expected=16+(bytes[6]&4?512:0)+bytes[4]*16384+bytes[5]*8192;
      if(bytes.length!==expected)throw Error('The cartridge length does not match its header.');
      const mapper=(bytes[6]>>>4)|(bytes[7]&240);
      if(!nesMappers.has(mapper))throw Error('Unsupported NES mapper '+mapper+'.');
      return {system:'nes',title:''};
    }
    if(bytes.length<32768)throw Error('Choose an uncompressed iNES 1.0 or Game Boy cartridge.');
    const size=bytes[0x148], expected=size<=8?32768*(2**size):({82:72,83:80,84:96}[size]||0)*16384;
    let sum=0;
    for(let i=0x134;i<=0x14c;i++)sum=(sum-bytes[i]-1)&255;
    if(!expected || bytes.length!==expected || bytes[0x14d]!==sum)throw Error('Invalid Game Boy cartridge size or header checksum.');
    if(!gbMappers.has(bytes[0x147]))throw Error('Unsupported Game Boy cartridge controller.');
    let title='';
    const end=(bytes[0x143]&128)?0x143:0x144;
    for(let i=0x134;i<end && bytes[i]>=32 && bytes[i]<=126;i++)title+=String.fromCharCode(bytes[i]);
    return {system:'gb',title:title.trim()};
  }
  return Object.freeze({inspect});
})();

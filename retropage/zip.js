'use strict';
/* A stored ZIP keeps the editor usable straight from disk, without a compressor. */
window.makeSiteZip = (() => {
  const encoder = new TextEncoder();
  const crcTable = new Uint32Array(256);
  for (let i = 0; i < crcTable.length; i++) {
    let value = i;
    for (let bit = 0; bit < 8; bit++) {
      value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
    }
    crcTable[i] = value >>> 0;
  }
  function checksum(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
  function record(length, signature) {
    const bytes = new Uint8Array(length), view = new DataView(bytes.buffer);
    view.setUint32(0, signature, true);
    return {bytes, word:(at,n)=>view.setUint16(at,n,true), dword:(at,n)=>view.setUint32(at,n,true)};
  }
  return function makeSiteZip(entries) {
    const files = [], directory = [];
    let offset = 0, directoryLength = 0;
    for (const entry of entries) {
      const name = encoder.encode(entry.name), data = entry.data, crc = checksum(data);
      const local = record(30+name.length, 0x04034b50);
      local.word(4,20); local.word(6,0x0800); local.word(12,0x21);
      local.dword(14,crc); local.dword(18,data.length); local.dword(22,data.length);
      local.word(26,name.length); local.bytes.set(name,30);
      files.push(local.bytes,data);
      const central = record(46+name.length, 0x02014b50);
      central.word(4,20); central.word(6,20); central.word(8,0x0800); central.word(14,0x21);
      central.dword(16,crc); central.dword(20,data.length); central.dword(24,data.length);
      central.word(28,name.length); central.dword(42,offset); central.bytes.set(name,46);
      directory.push(central.bytes);
      directoryLength += central.bytes.length; offset += local.bytes.length+data.length;
    }
    const end = record(22,0x06054b50);
    end.word(8,entries.length); end.word(10,entries.length);
    end.dword(12,directoryLength); end.dword(16,offset);
    return new Blob([...files,...directory,end.bytes],{type:'application/zip'});
  };
})();

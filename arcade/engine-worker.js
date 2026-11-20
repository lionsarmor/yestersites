/* JSNES is loaded from the pinned distribution before this worker program. */
'use strict';
let nes, frame, samples, sampleCount;
self.onmessage = ({data}) => {
  try {
    if (data.type === 'load') {
      nes = new jsnes.NES({
        sampleRate: 44100,
        onFrame(pixels) { frame = pixels; },
        onAudioSample(left, right) {
          if (samples && sampleCount < samples.length) samples[sampleCount++] = (left + right) / 2;
        }
      });
      nes.loadROM(new Uint8Array(data.rom));
      self.postMessage({type: 'loaded'});
    } else if (data.type === 'key') {
      const button = jsnes.Controller['BUTTON_' + data.key];
      if (Number.isInteger(button)) nes[data.down ? 'buttonDown' : 'buttonUp'](1, button);
    } else if (data.type === 'frame') {
      samples = data.sound ? new Float32Array(data.count * 820) : null;
      sampleCount = 0;
      for (let i=0; i<data.count; i++) nes.frame();
      const pixels = Uint32Array.from(frame, pixel => pixel | 0xff000000);
      const transfers = [pixels.buffer];
      if (samples) transfers.push(samples.buffer);
      self.postMessage({type:'frame', pixels:pixels.buffer, samples:samples?.buffer, sampleCount}, transfers);
    }
  } catch (error) {
    self.postMessage({type:'error', unsupported:/mapper/i.test(String(error.message))});
  }
};

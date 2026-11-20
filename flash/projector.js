/* Every movie, including standalone visits to the projector, gets an opaque origin. */
(() => {
  const data=location.hash.slice(1)||'demo';
  if(data!=='demo' && (data.length>1048576 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data))){
    document.body.textContent='This movie could not be read.';return;
  }
  const base=new URL('./',location.href).href;
  const options=new URLSearchParams(location.search);
  const scale=['showAll','noBorder','exactFit'].includes(options.get('fit'))?options.get('fit'):'showAll';
  const matte=/^#[a-f0-9]{6}$/i.test(options.get('matte')||'')?options.get('matte'):'#17263c';
  const transport=options.get('controls')!=='off';
  const book=options.get('book')==='1';
  if(book && (data==='demo'||data.length>80000)){document.body.textContent='This scene book could not be opened.';return;}
  const runtime=base+'ruffle-0.8.0/';
  const policy=["default-src 'none'","script-src 'wasm-unsafe-eval' "+base+"run.js "+runtime+"ruffle.js","connect-src "+runtime+" "+base+"comet.swf "+base+"scene-book.swf","style-src 'unsafe-inline'","img-src data: blob:","media-src blob:","base-uri 'none'","form-action 'none'"].join('; ');
  const frame=document.createElement('iframe');frame.title='Flash movie playback';frame.sandbox='allow-scripts';frame.referrerPolicy='no-referrer';
  frame.srcdoc='<!doctype html><html lang="en"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="'+policy+'"><style>html,body,#screen,ruffle-player{box-sizing:border-box;width:100%;height:100%;margin:0}body{background:#182338;color:#fff4cc;font:14px Tahoma,Arial,sans-serif}#screen{display:grid;place-content:center;text-align:center;border:3px ridge #9caabe}#screen.playing{display:flex;flex-direction:column;border:0;background:'+matte+'}#screen.playing ruffle-player{flex:1;min-height:0}#transport{flex:none;display:flex;align-items:center;gap:5px;padding:3px 6px;background:#d3cec0;color:#28232e;border-top:1px solid #292b38}#transport button{padding:2px 8px;font:12px Tahoma,Arial}#transport .suspend:before{content:"Ⅱ "}#transport .suspend[data-paused=true]:before{content:"▶ "}#transport small{margin-left:auto}button{font:bold 15px Tahoma,Arial;padding:7px 18px;border:3px outset #fff3cc;background:#ddd4bd;color:#231b17;cursor:pointer}small{display:block;margin:5px}p{margin:4px}</style><main id="screen"><button id="play" disabled>▶ Play Flash movie</button><small id="status" role="status">Opening projector…</small></main><script id="movie" data-book="'+book+'" data-scale="'+scale+'" data-matte="'+matte+'" data-transport="'+transport+'" type="application/octet-stream">'+data+'</script><script src="'+base+'run.js"></script></html>';
  document.body.replaceChildren(frame);
})();

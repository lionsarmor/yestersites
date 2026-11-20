/* Shared .yst document model used by the editor, preview and exporters. */
(() => {
  'use strict';
  const presets = window.retroPresets;
  const kinds = { text: 'Text', image: 'Image', link: 'Link', box: 'Box', rule: 'Rule' };
  const sizes = { text: [220, 64], image: [100, 80], link: [180, 32], box: [128, 76], rule: [240, 4] };
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const copy = (value) => structuredClone(value);
  const uid = () =>
    [...crypto.getRandomValues(new Uint8Array(16))].map((n) => n.toString(16).padStart(2, '0')).join('');
  const fonts = presets.fonts;
  function blank(title = 'Untitled homepage') {
    return {
      title,
      slug: '',
      byline: '',
      profile: 'classic',
      listed: true,
      width: 640,
      height: 480,
      background: '#ffffff',
      items: [],
    };
  }
  function item(kind, x, y, page) {
    const [width, height] = sizes[kind],
      w = Math.min(width, page.width),
      h = Math.min(height, page.height);
    return {
      id: uid(),
      kind,
      x: clamp(Math.round(x), 0, page.width - w),
      y: clamp(Math.round(y), 0, page.height - h),
      w,
      h,
      text: kind === 'text' ? 'Double-click to edit' : kind === 'link' ? 'My link' : '',
      href: '',
      src: '',
      color: kind === 'link' ? '#0000bb' : '#191919',
      fill: kind === 'box' ? '#c3c0db' : '',
      font_family: 'Times',
      font_size: 16,
      bold: false,
      italic: false,
      align: 'left',
    };
  }
  function pages(doc) {
    return [['home', doc], ...(doc.pages || []).map((p) => [p.page_id, p])];
  }
  function page(doc, id) {
    return id === 'home' ? doc : doc.pages?.find((p) => p.page_id === id);
  }
  function terminalPage(doc,id){
    return page(doc,id)||RetroBbs.bulletinPages(pages(doc)).find(([key])=>key===id)?.[1];
  }
  function linkOK(s) {
    if (typeof s !== 'string' || s.length > 2048 || /[\\\s\x00-\x1f\x7f]/.test(s)) return false;
    if (!s || /^page:(home|[0-9a-f]{32})$/.test(s) || /^\/(?!\/)/.test(s)) return true;
    try {
      const url = new URL(s);
      return (
        ['http:', 'https:'].includes(url.protocol) && !!url.hostname && !url.username && !url.password
      );
    } catch {
      return false;
    }
  }
  function webAddress(value) {
    let address = value.trim();
    if (/^(?:[a-z0-9-]+\.)+[a-z0-9-]+(?::\d+)?(?:[/?#]|$)/i.test(address)) address = 'https://' + address;
    if (!linkOK(address)) {
      throw Object.assign(Error('Enter a website such as example.com, a path starting with /, or choose a page from the list.'), {field:'href'});
    }
    return address;
  }
  function check(test, message) {
    if (!test) throw Error(message);
  }
  const integer = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
  const string = (v, max) =>
    typeof v === 'string' && v.length <= max && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v);
  const color = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
  function imageType(src) {
    const m = /^data:image\/(gif|jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/.exec(src);
    check(m && m[2].length <= 131072, 'Choose a GIF, JPEG or PNG of 96 KiB or less.');
    let binary;
    try {
      binary = atob(m[2]);
    } catch {
      throw Error('Invalid embedded image.');
    }
    const sig = binary.slice(0, 8);
    const format =
      sig.startsWith('GIF87a') || sig.startsWith('GIF89a')
        ? 'gif'
        : sig.startsWith('\x89PNG\r\n\x1a\n')
          ? 'png'
          : sig.startsWith('\xff\xd8')
            ? 'jpeg'
            : '';
    check(format === m[1] && binary.length <= 98304, 'The embedded image type or size is invalid.');
    const byte = (i) => binary.charCodeAt(i);
    const be16 = (i) => byte(i) * 256 + byte(i + 1);
    let width = 0,
      height = 0;
    if (format === 'gif') {
      width = byte(6) + byte(7) * 256;
      height = byte(8) + byte(9) * 256;
      check(binary.endsWith(';'), 'The GIF is incomplete.');
    } else if (format === 'png') {
      const be32 = (i) => be16(i) * 65536 + be16(i + 2);
      check(binary.slice(12, 16) === 'IHDR', 'Invalid PNG header.');
      width = be32(16);
      height = be32(20);
    } else {
      check(binary.endsWith('\xff\xd9'), 'The JPEG is incomplete.');
      const frames = new Set([
        0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
      ]);
      let pos = 2;
      while (pos < binary.length - 3) {
        if (byte(pos++) !== 0xff) break;
        while (byte(pos) === 0xff) pos++;
        const marker = byte(pos++),
          length = be16(pos);
        if (marker === 0xda || marker === 0xd9 || length < 2 || pos + length > binary.length) break;
        if (frames.has(marker)) {
          height = be16(pos + 3);
          width = be16(pos + 5);
          break;
        }
        pos += length;
      }
    }
    check(
      integer(width, 1, 4096) && integer(height, 1, 4096) && width * height <= 6000000,
      'Invalid image dimensions or image exceeds six megapixels.',
    );
    return format;
  }
  function normalize(raw) {
    check(raw && typeof raw === 'object', 'Choose a Retro Page .yst project.');
    const input = raw.document || raw;
    check(
      Array.isArray(input.pages || []) && (input.pages || []).length < 24,
      'A project supports up to 24 pages.',
    );
    const seen = new Set(['home']);
    function validatePage(p) {
      check(
        p && typeof p === 'object' && Array.isArray(p.items) && p.items.length <= 64,
        'A page supports up to 64 objects.',
      );
      const d = { ...blank(), ...p };
      delete d.pages;
      check(
        string(d.title, 80) &&
          string(d.byline, 48) &&
          string(d.slug, 40) &&
          (!d.slug || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(d.slug)),
        'Check the page title, webmaster and site address.',
      );
      check(
        integer(d.width, 160, 2048) &&
          integer(d.height, 120, 8192) &&
          color(d.background) &&
          ['classic', 'millennium', 'text'].includes(d.profile) &&
          typeof d.listed === 'boolean',
        'Invalid page size, color or format.',
      );
      if(d.pageStyles!==undefined)RetroCraft.pageCSS(d.pageStyles);
      if (d.soundtrack !== undefined) check(typeof d.soundtrack === 'string' && (!d.soundtrack ||
        (d.soundtrack.startsWith('https://') && linkOK(d.soundtrack))), 'Use a direct HTTPS audio or stream address.');
      if ('bbsScreen' in d) {
        check(Array.isArray(d.bbsScreen) && d.bbsScreen.length <= 64, 'A BBS screen supports up to 64 blocks.');
        d.bbsScreen=d.bbsScreen.map(block=>RetroBbs.normalize(block,linkOK));
        RetroBbs.checkKeys(d.bbsScreen);
      }
      const ids = new Set();
      d.items = p.items.map((o) => {
        check(
          o && Object.hasOwn(kinds, o.kind) && string(o.id, 80) && !!o.id && !ids.has(o.id),
          'Invalid or duplicate object ID.',
        );
        ids.add(o.id);
        const n = { ...item(o.kind, 0, 0, d), ...o };
        check(
          integer(n.x, 0, d.width - 1) &&
            integer(n.y, 0, d.height - 1) &&
            integer(n.w, 1, d.width - n.x) &&
            integer(n.h, 1, d.height - n.y),
          'An object is outside its page.',
        );
        check(
          color(n.color) &&
            (n.fill === '' || n.fill === 'transparent' || color(n.fill)) &&
            Object.hasOwn(fonts, n.font_family) &&
            integer(n.font_size, 6, 160) &&
            ['left', 'right', 'center'].includes(n.align),
          'Invalid object appearance.',
        );
        check(
          string(n.text, 8000) &&
            linkOK(n.href) &&
            typeof n.bold === 'boolean' &&
            typeof n.italic === 'boolean',
          'Invalid object text or link.',
        );
        if ('widget' in n) {
          check(typeof n.widget === 'string' && Object.hasOwn(window.retroObjects.presets, n.widget), 'Unknown object preset.');
          if (RetroCraft.hasFallback(n))Object.assign(n,RetroCraft.fallbackFields(n));
          if (RetroCraft.isCraft(n))Object.assign(n,RetroCraft.fields(n));
          if (RetroMedia.isPlayer(n)) RetroMedia.source(n.href,n.widget);
          if(RetroMedia.isFrame(n)){
            RetroMedia.frameURL(n.href);
            if(n.widget==='split-frame'){RetroMedia.frameURL(n.otherHref);check(string(n.otherLabel,120),'Add a short menu label.');}
          }
          if(RetroMedia.isPlayer(n) && n.secondSrc)RetroMedia.source(n.secondSrc,'audio-player');
          if(RetroMedia.isPlayer(n) && n.alternateSrc)RetroMedia.source(n.alternateSrc,n.widget);
          if (n.widget === 'counter') check(/^[0-9]{1,12}$/.test(n.text), 'Enter 1–12 counter digits.');
        }
        if (n.kind === 'image' && n.src) imageType(n.src);
        return n;
      });
      const flashSize=d.items.filter(o=>o.widget==='flash-movie').reduce((n,o)=>n+(o.swf==='demo'?0:o.swf.length),0);
      check(flashSize<=1048576,'A page supports 768 KiB of imported Flash movies.');
      const players=d.items.filter(RetroMedia.isPlayer);
      check(players.length<=4,'A page supports up to four players.');
      check(players.filter(o=>o.autoplay).length+Number(!!d.soundtrack)<=1,'Choose one automatic soundtrack or player per page.');
      return d;
    }
    const doc = validatePage(input);
    if (input.pages?.length)
      doc.pages = input.pages.map((p) => {
        check(
          p && /^[0-9a-f]{32}$/.test(p.page_id) && !seen.has(p.page_id),
          'Invalid or duplicate page ID.',
        );
        seen.add(p.page_id);
        return validatePage(p);
      });
    for (const [, p] of pages(doc))
      for (const o of [...p.items,...p.bbsScreen || []])
        check(
          [o.href,o.otherHref||''].every(url=>!url.startsWith('page:') || seen.has(url.slice(5))),
          'A link points to a missing page.',
        );
    RetroBbs.bulletinPages(pages(doc));
    RetroMedia.checkFrames(pages(doc));
    return doc;
  }
  const letterKeys = ['text', 'w', 'h', 'font_size', 'color', 'align', 'italic', 'bold'];
  const letteringCache = new Map(presets.lettering.map(([key, data]) => [JSON.stringify(key), data]));
  function lettering(o) {
    const key = JSON.stringify(letterKeys.map((k) => o[k]));
    if (letteringCache.has(key)) return letteringCache.get(key);
    const size = o.font_size,
      factor = Math.max(2, Math.ceil(Math.max(o.w, o.h) / 2048));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(o.w / factor));
    canvas.height = Math.max(1, Math.ceil(o.h / factor));
    const ctx = canvas.getContext('2d'),
      scale = size / (16 * factor),
      slant = o.italic ? 5.4 : 0,
      gap = o.bold ? 2.2 : 3.2;
    let y = 0,
      longest = 0;
    for (const [li, line] of o.text.toUpperCase().split(/\r?\n/).entries()) {
      if (y >= canvas.height) break;
      const sx = scale * (li ? 1.13 : 0.94),
        glyphs = [];
      let advance = 0;
      for (const ch of line) {
        if (advance * sx > canvas.width * 1.5) break;
        const paths =
          presets.glyphs[ch]?.map((path) => path.split(' ').map((p) => p.split(',').map(Number))) || [];
        const width = paths.length ? Math.max(...paths.flat().map((pt) => pt[0])) : ch.trim() ? 9 : 6;
        glyphs.push({ ch, paths, advance });
        advance += width + gap;
      }
      const width = Math.max(0, advance - gap + slant) * sx;
      longest = Math.max(longest, Math.min(canvas.width, width));
      let start =
        o.align === 'center'
          ? (canvas.width - width) / 2
          : o.align === 'right'
            ? canvas.width - width
            : 0;
      if (o.align === 'center' && li) start -= Math.min(canvas.width * 0.06, scale * 4.5);
      for (const g of glyphs) {
        const point = (x, z) => {
          const ax = (g.advance + x + (1 - z / 16) * slant) * sx;
          return [Math.round(start + ax), Math.round(y + z * scale + (width - ax) * 0.025)];
        };
        ctx.fillStyle = o.color;
        ctx.beginPath();
        for (const path of g.paths) {
          path.forEach(([x, z], i) => ctx[i ? 'lineTo' : 'moveTo'](...point(x, z)));
          ctx.closePath();
        }
        if (g.paths.length) ctx.fill('evenodd');
        else if (g.ch.trim()) {
          ctx.font = 'bold ' + Math.max(1, size / factor) + 'px monospace';
          ctx.textBaseline = 'top';
          ctx.fillText(g.ch, ...point(0, 0));
        }
      }
      y += Math.max(1, Math.round((size * 1.14) / factor));
    }
    if (longest && y < canvas.height) {
      const w = Math.min(longest * 0.67, canvas.width * 0.76),
        left =
          o.align === 'center' ? (canvas.width - w) / 2 : o.align === 'right' ? canvas.width - w : 0;
      const by = Math.min(canvas.height - 1, y + Math.round(scale * 0.7)),
        h = Math.max(2, (size * 0.37) / factor);
      const bolt = [
        [0, 16],
        [19, 9],
        [34, 6],
        [46, 5],
        [44, 8],
        [63, 3],
        [76, 1],
        [91, 2],
        [100, 5],
        [79, 4],
        [66, 6],
        [51, 10],
        [35, 15],
        [38, 9],
        [24, 11],
      ];
      ctx.beginPath();
      bolt.forEach(([x, z], i) => ctx[i ? 'lineTo' : 'moveTo'](left + (x * w) / 100, by + (z * h) / 16));
      ctx.closePath();
      ctx.fillStyle = '#ffe85b';
      ctx.fill();
    }
    const result = canvas.toDataURL('image/png');
    if (letteringCache.size > 50) letteringCache.clear();
    letteringCache.set(key, result);
    return result;
  }
  function appearance(o) {
    return o.kind === 'text' && o.font_family === 'Lightning Display'
      ? lettering(o)
      : o.kind === 'image'
        ? o.src
        : '';
  }
  function wrap(text, width) {
    const lines = [];
    for (const paragraph of text.split(/\r?\n/)) {
      let line = '';
      for (let word of paragraph.split(/\s+/).filter(Boolean)) {
        if (line && (line + ' ' + word).length > width) {
          lines.push(line);
          line = '';
        }
        while (word.length > width) {
          lines.push(word.slice(0, width));
          word = word.slice(width);
        }
        line += (line ? ' ' : '') + word;
      }
      lines.push(line);
    }
    return lines;
  }
  function terminal(doc, id, columns = 32) {
    const p = terminalPage(doc, id),
      links = [], resources = [],
      body = [];
    const ascii = (s) =>
      s
        .normalize('NFKD')
        .replace(/[’‘]/g, "'")
        .replace(/[–—]/g, '-')
        .replace(/[^\x20-\x7e\n]/g, '');
    const ordered = [...p.items].sort((a,b)=>a.y-b.y||a.x-b.x);
    const authored = p.bbsScreen || ordered.filter(o => o.widget?.startsWith('bbs-'));
    if(p.bbsScreen || authored.length)return RetroBbs.authored(authored,columns,key=>page(doc,key)?.title||key,id,wrap);
    const lines = [...wrap(ascii(p.title.toUpperCase()), columns), ''];
    for (const o of ordered) {
      const t = ascii(o.text.trim());
      if (o.href.startsWith('page:')) {
        const target = o.href.slice(5);
        if (target !== id) {
          links.push(target);
          lines.push(...wrap(links.length + '  ' + (t || page(doc, target).title), columns));
        }
      } else if (
        t &&
        t.toLowerCase().replace(/\s+/g, ' ') !== p.title.toLowerCase() &&
        !['/', '|'].includes(t)
      ) {
        body.push(...wrap(o.kind === 'image' ? '[' + t + ']' : t, columns), '');
      }
    }
    return { lines: [...lines, '', ...body], links,resources };
  }
  const readImage = (file) =>
    new Promise((resolve, reject) => {
      if (file.size > 98304) return reject(Error('Choose an image of 96 KiB or less.'));
      const r = new FileReader();
      r.onerror = () => reject(Error('Image could not be read.'));
      r.onload = () => resolve(r.result);
      r.readAsDataURL(file);
    });
  async function dimensions(src) {
    const im = new Image();
    im.src = src;
    await im.decode();
    check(
      im.naturalWidth <= 4096 &&
        im.naturalHeight <= 4096 &&
        im.naturalWidth * im.naturalHeight <= 6000000,
      'Image exceeds the 4096-pixel or six-megapixel limit.',
    );
    return [im.naturalWidth, im.naturalHeight];
  }
  window.RetroModel = {
    kinds,
    fonts,
    sizes,
    clamp,
    copy,
    uid,
    blank,
    item,
    pages,
    page,
    normalize,
    imageType,
    terminalPage,
    appearance,
    lettering,
    terminal,
    linkOK,
    webAddress,
    readImage,
    dimensions,
  };
})();

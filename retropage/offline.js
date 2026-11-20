/* Cache only the editor shell. Projects and unpublished image data stay in the page's local storage. */
const base = new URL('./', self.location.href);
const prefix = 'roddy-retro-page:' + base.pathname + ':';
const version = prefix + '0.9.2-member-addresses';
const resources = [
  './index.html', './craft.js','./assets/instruments/flash-still.gif',
  ...['bbs','html','film','archive','youtube','rumble','music','radio','clip','audio','menu','art','files','welcome','bulletin'].flatMap(name=>['','-still'].map(suffix=>'./assets/instruments/'+name+suffix+'.gif')),
  './app.css',
  './app.js',
  './bbs.js',
  './media.js',
  './gifcities.js',
  './art-library.js',
  './assets/credits/art-library.txt',
  './assets/credits/art-sources.json',
  './project.js',
  './presets.js',
  './objects.js',
  './palette.js',
  './assets/credits/pixelarticons.txt',
  './templates.js',
  './zip.js',
  './exports.js',
  './assets/retro-page-logo.png',
  './assets/roddy-wordmark.png',
  './assets/tools.png',
  './assets/paper-pencil.png',
  './assets/list-glyphs.png',
  './assets/credits/SOURCES.txt',
  './assets/credits/catalog.json',
  './assets/credits/mosaic-catalog.json',
  './assets/credits/LICENSE-AND-CREDITS.txt',
  './assets/credits/CC0-1.0.txt',
].map((path) => new URL(path, base).href);
const localFiles = new Set(resources);
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(version);
      await cache.addAll(resources.map((url) => new Request(url, { cache: 'reload' })));
      await self.skipWaiting();
    })(),
  );
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys())
        if (key.startsWith(prefix) && key !== version) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const href = url.origin + url.pathname;
  const isEntry = event.request.mode === 'navigate' && (href === base.href || href === resources[0]);
  if (!isEntry && !localFiles.has(href)) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(version);
      return (await cache.match(isEntry ? resources[0] : href)) || fetch(event.request);
    })(),
  );
});

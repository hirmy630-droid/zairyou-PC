// KYOWA ROOF - Service Worker（オフライン対応）
// 仕組み: 初回オンライン時に必要なファイルを端末へ保存 → 以降は電波がなくても起動できる。
// 同一サイトのファイルは「保存済みを即表示しつつ、裏で最新版に更新」する方式。
const CACHE = 'kyowa-roof-v1';
const TAILWIND = 'https://cdn.tailwindcss.com/3.4.17';
const LOCAL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-180.png'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // 一部のファイル（アイコン等）が無くてもインストール自体は失敗させない
    await Promise.all(LOCAL.map(async (url) => {
      try {
        const res = await fetch(url, { cache: 'reload' });
        if (res.ok) await cache.put(url, res);
      } catch (e) {}
    }));
    // Tailwind は他サイトのスクリプト（opaque 応答）なので no-cors で保存
    try {
      const res = await fetch(new Request(TAILWIND, { mode: 'no-cors' }));
      await cache.put(TAILWIND, res);
    } catch (e) {}
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isTailwind = req.url === TAILWIND;
  if (url.origin !== self.location.origin && !isTailwind) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true });
    const network = fetch(req).then((res) => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    }).catch(() => null);

    if (cached) {
      if (!isTailwind) event.waitUntil(network); // 裏で最新版に更新
      return cached;
    }
    const res = await network;
    if (res) return res;
    if (req.mode === 'navigate') {
      const fallback = await cache.match('./index.html');
      if (fallback) return fallback;
    }
    return Response.error();
  })());
});

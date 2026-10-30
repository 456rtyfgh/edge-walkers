// Edge Walkers 서비스 워커 — 앱 셸·sprites·받은 팩 캐시로 오프라인 실행
const VERSION = 'ew-v1';
const SHELL = 'ew-shell-' + VERSION;
const PACKS = 'ew-packs-' + VERSION;
const CORE = ['./', 'index.html', 'manifest.webmanifest', 'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'sprites/manifest.json'];
const ID_RE = /^[A-Za-z0-9_-]{8,32}$/;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    await Promise.all(CORE.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    // sprites/manifest.json 에 적힌 폴더 캐릭터 이미지도 미리 담는다
    try {
      const m = await (await c.match('sprites/manifest.json')).json();
      const files = [];
      for (const ch of m.characters || []) {
        for (const list of Object.values(ch.files || {})) for (const f of list) files.push('sprites/' + ch.dir + '/' + f);
      }
      await Promise.all(files.map((u) => c.add(u).catch(() => {})));
    } catch (_) { /* 폴더 캐릭터 없음 */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== SHELL && k !== PACKS) await caches.delete(k);
    await self.clients.claim();
  })());
});

function dynamicManifest(url) {
  const id = url.searchParams.get('pack');
  const scope = new URL('./', self.registration.scope).href;
  return caches.open(SHELL).then((c) => c.match('manifest.webmanifest')).then((r) => (r ? r.json() : {})).then((m) => {
    m.start_url = scope + (id && ID_RE.test(id) ? '?pack=' + id : '');
    m.scope = scope; m.id = scope;
    m.icons = (m.icons || []).map((i) => Object.assign({}, i, { src: new URL(i.src, scope).href }));
    return new Response(JSON.stringify(m), { headers: { 'content-type': 'application/manifest+json' } });
  });
}

async function networkFirst(req, cacheName, cacheKey, ms) {
  const cache = await caches.open(cacheName);
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms || 6000);
    const res = await fetch(req, { signal: ctl.signal });
    clearTimeout(t);
    if (res && res.ok) cache.put(cacheKey || req, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    const hit = await cache.match(cacheKey || req);
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return; // Supabase 업로드(POST) 등은 가로채지 않음
  const url = new URL(req.url);

  if (url.origin !== self.location.origin) {
    if (url.pathname.includes('/storage/v1/object/public/')) e.respondWith(networkFirst(req, PACKS, null, 20000));
    return;
  }
  if (url.pathname.endsWith('/manifest.webmanifest') && url.searchParams.has('pack')) {
    e.respondWith(dynamicManifest(url));
    return;
  }
  if (req.mode === 'navigate') {
    // ?pack 등 쿼리를 무시하고 앱 셸을 돌려준다 (오프라인 재실행)
    e.respondWith((async () => {
      try { return await networkFirst(req, SHELL, 'index.html', 4000); }
      catch (_) {
        const c = await caches.open(SHELL);
        return (await c.match('index.html')) || (await c.match('./')) || Response.error();
      }
    })());
    return;
  }
  // 그 밖의 같은 출처 파일: 캐시 우선 + 백그라운드 갱신
  e.respondWith((async () => {
    const c = await caches.open(SHELL);
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req).then((r) => { if (r && r.ok) c.put(req, r.clone()).catch(() => {}); return r; }).catch(() => null);
    return hit || (await net) || Response.error();
  })());
});

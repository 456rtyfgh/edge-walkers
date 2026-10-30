// loader.js — 폴더 방식: sprites/manifest.json 기반 캐릭터 로드
(function () {
  const EW = (window.EW = window.EW || {});
  const num = (v, d) => (typeof v === 'number' && isFinite(v) && v > 0 ? v : d);
  const withSlash = (u) => (u.endsWith('/') ? u : u + '/');

  function loadImage(url) {
    return fetch(url).then((r) => {
      if (!r.ok) throw new Error(url + ' ' + r.status);
      return r.blob();
    }).then((b) => EW.store.decodeBlob(b));
  }

  async function parseFolderEntry(entry, baseUrl) {
    baseUrl = withSlash(baseUrl || 'sprites/');
    const cfg = entry.config || {};
    const frames = {};
    for (const a of EW.store.ACTIONS) {
      const files = entry.files && entry.files[a];
      if (!files || !files.length) continue;
      frames[a] = await Promise.all(files.map((f) => loadImage(baseUrl + encodeURIComponent(entry.dir) + '/' + encodeURIComponent(f))));
    }
    const first = Object.values(frames)[0];
    return {
      id: entry.dir,
      name: cfg.name || entry.dir,
      source: 'folder',
      scale: num(cfg.scale, 1), speed: num(cfg.speed, 60), fps: num(cfg.fps, 8),
      count: Math.max(1, Math.round(num(cfg.count, 1))),
      size: first && first[0] ? { w: first[0].width, h: first[0].height } : { w: 0, h: 0 },
      frames,
    };
  }

  async function loadFolderChars(baseUrl) {
    baseUrl = withSlash(baseUrl || 'sprites/');
    let manifest;
    try {
      const r = await fetch(baseUrl + 'manifest.json', { cache: 'no-cache' });
      if (!r.ok) return [];
      manifest = await r.json();
    } catch (e) { return []; }
    const out = [];
    for (const entry of (manifest && manifest.characters) || []) {
      if (!entry.dir || entry.dir.startsWith('_')) continue;
      try {
        const def = await parseFolderEntry(entry, baseUrl);
        const v = EW.store.validateDef(def);
        if (v.ok) out.push(def);
        else console.warn('[edge-walkers] 폴더 캐릭터 제외:', entry.dir, v.errors.join(', '));
      } catch (e) { console.warn('[edge-walkers] 폴더 캐릭터 로드 실패:', entry.dir, e.message); }
    }
    return out;
  }

  EW.loader = { loadFolderChars, parseFolderEntry };
})();

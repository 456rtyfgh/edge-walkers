// store.js — IndexedDB 저장소, 설정 기본값, CharacterDef 검증/변환
(function () {
  const EW = (window.EW = window.EW || {});
  const DB_NAME = 'edge-walkers';
  const ACTIONS = ['walk', 'idle', 'look', 'sit', 'jump', 'sleep'];
  const MIN = { walk: 2, idle: 1 };
  let dbp = null;

  function defaultSettings() {
    return {
      enabledIds: null,
      bg: { type: 'gradient', color: '#1b1f2a', color2: '#2c3350', image: null, fit: 'cover' },
      showSafeArea: false,
      overrides: {},
      importedPacks: [],
    };
  }

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error('IndexedDB 미지원'));
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('characters')) db.createObjectStore('characters', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbp.catch(() => { dbp = null; });
    return dbp;
  }

  async function tx(storeName, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(storeName, mode);
      let out;
      const r = fn(t.objectStore(storeName));
      if (r) r.onsuccess = () => { out = r.result; };
      t.oncomplete = () => resolve(out);
      t.onerror = t.onabort = () => reject(t.error);
    });
  }

  async function decodeBlob(blob) {
    if (window.createImageBitmap) {
      try { return await createImageBitmap(blob); } catch (e) { /* Image 로 대체 */ }
    }
    return new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error('이미지 디코드 실패'));
      im.src = URL.createObjectURL(blob);
    });
  }

  const store = {
    ACTIONS,
    defaultSettings,
    decodeBlob,
    async open() { await open(); },
    listUserChars() { return tx('characters', 'readonly', (s) => s.getAll()).then((r) => r || []); },
    saveUserChar(c) { return tx('characters', 'readwrite', (s) => s.put(c)).then(() => {}); },
    deleteUserChar(id) { return tx('characters', 'readwrite', (s) => s.delete(id)).then(() => {}); },
    async getSettings() {
      const saved = await tx('settings', 'readonly', (s) => s.get('main'));
      const d = defaultSettings();
      if (!saved) return d;
      return Object.assign(d, saved, { bg: Object.assign(d.bg, saved.bg || {}), overrides: saved.overrides || {}, importedPacks: Array.isArray(saved.importedPacks) ? saved.importedPacks : [] });
    },
    async setSettings(partial) {
      const cur = await store.getSettings();
      const next = Object.assign({}, cur, partial);
      if (partial.bg) next.bg = Object.assign({}, cur.bg, partial.bg);
      await tx('settings', 'readwrite', (s) => s.put(next, 'main'));
      return next;
    },
    validateDef(def) {
      const errors = [], warnings = [];
      if (!def || typeof def !== 'object') return { ok: false, errors: ['정의가 없음'], warnings };
      const fr = def.frames || {};
      let w = null, h = null;
      for (const a of Object.keys(fr)) {
        if (!ACTIONS.includes(a)) { warnings.push(`알 수 없는 액션 '${a}' 무시`); continue; }
        if (!Array.isArray(fr[a]) || fr[a].length === 0) { errors.push(`${a}: 비어있지 않은 배열이어야 함`); continue; }
        for (const img of fr[a]) {
          const iw = img.width || img.naturalWidth, ih = img.height || img.naturalHeight;
          if (w == null) { w = iw; h = ih; }
          else if (iw !== w || ih !== h) { errors.push(`${a}: 프레임 크기 불일치 (${iw}x${ih} ≠ ${w}x${h})`); break; }
        }
      }
      for (const a of Object.keys(MIN)) {
        const n = (fr[a] || []).length;
        if (n < MIN[a]) errors.push(`${a}: 최소 ${MIN[a]}장 필요 (현재 ${n})`);
      }
      if (w != null && w !== h) warnings.push(`정사각형이 아님 (${w}x${h}) — 256x256 권장`);
      if (w != null && (w < 64 || w > 1024)) warnings.push('권장 크기 범위(64~1024px) 밖');
      return { ok: errors.length === 0, errors, warnings };
    },
    async storedToDef(sc) {
      const frames = {};
      for (const a of ACTIONS) {
        const blobs = sc.actions && sc.actions[a];
        if (!blobs || !blobs.length) continue;
        frames[a] = await Promise.all(blobs.map(decodeBlob));
      }
      const first = Object.values(frames)[0];
      return {
        id: sc.id, name: sc.name || sc.id, source: 'user',
        scale: sc.scale ?? 1, speed: sc.speed ?? 60, fps: sc.fps ?? 8, count: sc.count ?? 1,
        size: first && first[0] ? { w: first[0].width, h: first[0].height } : { w: 0, h: 0 },
        frames,
      };
    },
    applyOverrides(defs, settings) {
      const ids = settings && settings.enabledIds;
      const ov = (settings && settings.overrides) || {};
      return defs
        .filter((d) => !ids || ids.includes(d.id))
        .map((d) => Object.assign({}, d, ov[d.id] || {}));
    },
  };

  EW.store = store;
})();

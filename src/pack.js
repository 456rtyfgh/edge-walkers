// pack.js — 공유 팩 받기: fetch → 검증(절대 신뢰하지 않음) → IndexedDB 가져오기 (+ 링크 붙여넣기 폴백 UI)
(function () {
  const EW = (window.EW = window.EW || {});
  const C = () => EW.config;
  const ACTIONS = ['walk', 'idle', 'look', 'sit', 'jump', 'sleep'];
  const MSG = {
    'bad-id': '링크가 올바르지 않아요. 친구에게 링크를 다시 받아 보세요.',
    offline: '인터넷에 연결되어 있지 않아요. 연결되면 링크를 다시 열어 캐릭터를 받아 보세요.',
    'not-found': '캐릭터 팩을 찾을 수 없어요. 링크가 잘못되었거나 만료되었을 수 있어요.',
    'too-large': '캐릭터 팩이 너무 커서 받을 수 없어요.',
    'bad-json': '캐릭터 팩이 손상되었어요. 친구에게 다시 보내 달라고 해 보세요.',
    invalid: '캐릭터 팩이 올바르지 않아서 받을 수 없어요.',
    network: '캐릭터를 받아오지 못했어요. 잠시 후 다시 시도해 주세요.',
    storage: '이 기기에 저장하지 못했어요. 저장 공간을 확인해 주세요.',
  };
  const friendlyError = (code) => MSG[code] || MSG.network;
  const mkErr = (code, msg) => Object.assign(new Error(msg || MSG[code] || code), { code });

  function clamp(v, range, def, int) {
    let n = Number(v);
    if (!Number.isFinite(n)) n = def;
    n = Math.min(range[1], Math.max(range[0], n));
    return int ? Math.round(n) : n;
  }
  const CTRL_RE = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028-\\u202e\\u2066-\\u2069\\ufeff]', 'g');
  function cleanName(s) {
    const L = C().LIMITS.maxNameLen;
    let t = typeof s === 'string' ? s : '';
    t = t.replace(CTRL_RE, '').trim();
    return Array.from(t).slice(0, L).join('') || '친구의 캐릭터';
  }
  const colorOr = (v, d) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : d);

  // data:image/(png|webp);base64,... → {blob, bytes} 또는 throw
  function decodeDataUrl(u, maxBytes) {
    if (typeof u !== 'string') throw new Error('이미지가 문자열이 아니에요');
    const m = /^data:image\/(png|webp);base64,/.exec(u.slice(0, 40));
    if (!m) throw new Error('PNG/WebP 이미지만 받을 수 있어요');
    const b64 = u.slice(m[0].length);
    if ((b64.length * 3) / 4 > maxBytes + 3) throw new Error('이미지 한 장이 너무 커요');
    let bin;
    try { bin = atob(b64); } catch (e) { throw new Error('이미지 인코딩이 올바르지 않아요'); }
    if (bin.length > maxBytes) throw new Error('이미지 한 장이 너무 커요');
    const a = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    const png = a.length > 8 && a[0] === 0x89 && a[1] === 0x50 && a[2] === 0x4e && a[3] === 0x47;
    const webp = a.length > 12 && a[0] === 0x52 && a[1] === 0x49 && a[2] === 0x46 && a[3] === 0x46 && a[8] === 0x57 && a[9] === 0x45 && a[10] === 0x42 && a[11] === 0x50;
    if (m[1] === 'png' ? !png : !webp) throw new Error('이미지 내용이 선언된 형식과 달라요');
    return { blob: new Blob([a], { type: 'image/' + m[1] }), bytes: a.length };
  }
  async function dims(blob) {
    const bmp = await createImageBitmap(blob); // 디코드 실패 시 throw
    const d = { w: bmp.width, h: bmp.height };
    if (bmp.close) bmp.close();
    return d;
  }

  async function validatePack(obj, expectedId) {
    const L = C().LIMITS, K = C().CLAMP, errors = [];
    const bad = (m) => { errors.push(m); return { ok: false, errors, pack: null }; };
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return bad('팩 형식이 아니에요');
    if (obj.version !== 1) return bad('지원하지 않는 팩 버전이에요');
    if (typeof obj.packId !== 'string' || !C().PACK_ID_RE.test(obj.packId)) return bad('packId 가 올바르지 않아요');
    if (expectedId != null && obj.packId !== expectedId) return bad('packId 가 링크와 달라요');
    if (!Array.isArray(obj.characters) || obj.characters.length < 1) return bad('캐릭터가 없어요');
    if (obj.characters.length > L.maxChars) return bad('캐릭터가 너무 많아요 (최대 ' + L.maxChars + '개)');

    const chars = [];
    for (let ci = 0; ci < obj.characters.length; ci++) {
      const c = obj.characters[ci];
      const label = '캐릭터 ' + (ci + 1);
      if (!c || typeof c !== 'object' || !c.actions || typeof c.actions !== 'object') return bad(label + ': 형식이 올바르지 않아요');
      const actions = {};
      let size = null;
      for (const a of ACTIONS) {
        const arr = c.actions[a];
        if (arr == null) continue;
        if (!Array.isArray(arr) || arr.length < 1 || arr.length > L.maxFramesPerAction) return bad(label + ': ' + a + ' 프레임 수가 올바르지 않아요 (1~' + L.maxFramesPerAction + ')');
        const blobs = [];
        for (const u of arr) {
          let r;
          try { r = decodeDataUrl(u, L.maxFrameBytes); } catch (e) { return bad(label + ': ' + a + ' — ' + e.message); }
          let d;
          try { d = await dims(r.blob); } catch (e) { return bad(label + ': ' + a + ' — 이미지를 읽을 수 없어요'); }
          if (d.w < L.minDim || d.h < L.minDim || d.w > L.maxDim || d.h > L.maxDim) return bad(label + ': 프레임 크기가 허용 범위(' + L.minDim + '~' + L.maxDim + 'px)를 벗어나요');
          if (!size) size = d;
          else if (d.w !== size.w || d.h !== size.h) return bad(label + ': 프레임 크기가 서로 달라요');
          blobs.push(r.blob);
        }
        actions[a] = blobs;
      }
      if (!actions.walk || actions.walk.length < 2) return bad(label + ': walk 프레임이 최소 2장 필요해요');
      if (!actions.idle || actions.idle.length < 1) return bad(label + ': idle 프레임이 최소 1장 필요해요');
      chars.push({
        name: cleanName(c.name),
        scale: clamp(c.scale, K.scale, 1),
        speed: clamp(c.speed, K.speed, 60),
        fps: clamp(c.fps, K.fps, 8, true),
        count: clamp(c.count, K.count, 1, true),
        actions,
      });
    }

    let bg = null;
    if (obj.bg != null) {
      const b = obj.bg;
      if (typeof b !== 'object' || Array.isArray(b)) return bad('배경 형식이 올바르지 않아요');
      const type = ['color', 'gradient', 'image'].includes(b.type) ? b.type : 'gradient';
      let image = null;
      if (b.image != null) {
        try {
          const r = decodeDataUrl(b.image, L.maxBytes);
          const d = await dims(r.blob);
          if (d.w > 4096 || d.h > 4096 || d.w < 1 || d.h < 1) throw new Error('배경 이미지 크기가 허용 범위를 벗어나요');
          image = r.blob;
        } catch (e) { return bad('배경: ' + e.message); }
      }
      bg = {
        type: type === 'image' && !image ? 'gradient' : type,
        color: colorOr(b.color, '#1b1f2a'),
        color2: colorOr(b.color2, '#2c3350'),
        fit: 'cover',
        image,
      };
    }
    return { ok: true, errors, pack: { packId: obj.packId, characters: chars, bg } };
  }

  async function fetchPack(id) {
    if (typeof id !== 'string' || !C().PACK_ID_RE.test(id)) throw mkErr('bad-id');
    if (navigator.onLine === false) throw mkErr('offline');
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 20000);
    let res;
    try {
      res = await fetch(C().packUrl(id), { signal: ctl.signal });
    } catch (e) {
      clearTimeout(timer);
      throw mkErr(navigator.onLine === false ? 'offline' : 'network');
    }
    try {
      if (res.status === 404 || res.status === 400 || res.status === 403) throw mkErr('not-found');
      if (!res.ok) throw mkErr('network');
      const len = Number(res.headers.get('content-length'));
      if (len && len > C().LIMITS.maxBytes) throw mkErr('too-large');
      const text = await res.text();
      if (text.length > C().LIMITS.maxBytes) throw mkErr('too-large');
      try { return JSON.parse(text); } catch (e) { throw mkErr('bad-json'); }
    } catch (e) {
      if (e && e.code) throw e;
      throw mkErr(navigator.onLine === false ? 'offline' : 'network');
    } finally { clearTimeout(timer); }
  }

  const inflight = new Map();
  const newId = () => 'u_' + Math.random().toString(36).slice(2, 10);

  function importPack(obj, opts) {
    const onlyOnce = !opts || opts.onlyOnce !== false;
    const key = obj && typeof obj.packId === 'string' ? obj.packId : null;
    if (key && inflight.has(key)) return inflight.get(key);
    const p = doImport(obj, onlyOnce);
    if (key) { inflight.set(key, p); p.finally(() => inflight.delete(key)); }
    return p;
  }

  async function doImport(obj, onlyOnce) {
    const fail = (errors) => ({ status: 'invalid', added: [], bgApplied: false, errors });
    let v;
    try { v = await validatePack(obj, null); } catch (e) { return fail(['검증 중 오류: ' + e.message]); }
    if (!v.ok) return fail(v.errors);
    const pack = v.pack;
    let settings;
    try { await EW.store.open(); settings = await EW.store.getSettings(); } catch (e) { return fail(['storage']); }
    const imported = Array.isArray(settings.importedPacks) ? settings.importedPacks : [];
    if (onlyOnce && imported.includes(pack.packId)) return { status: 'duplicate', added: [], bgApplied: false, errors: [] };

    const existing = new Set((await EW.store.listUserChars()).map((c) => c.id));
    const saved = [];
    try {
      for (const c of pack.characters) {
        let id = newId();
        while (existing.has(id)) id = newId();
        existing.add(id);
        const sc = { id, name: c.name, scale: c.scale, speed: c.speed, fps: c.fps, count: c.count, actions: c.actions };
        const def = await EW.store.storedToDef(sc);
        const chk = EW.store.validateDef(def);
        if (!chk.ok) throw new Error(c.name + ': ' + chk.errors.join(', '));
        await EW.store.saveUserChar(sc);
        saved.push(id);
      }
      const patch = { importedPacks: onlyOnce ? imported.concat(pack.packId) : imported };
      if (Array.isArray(settings.enabledIds)) patch.enabledIds = settings.enabledIds.concat(saved);
      if (pack.bg) patch.bg = pack.bg;
      await EW.store.setSettings(patch);
      return { status: 'added', added: saved, bgApplied: !!pack.bg, errors: [] };
    } catch (e) {
      for (const id of saved) { try { await EW.store.deleteUserChar(id); } catch (_) { /* 롤백 최선 */ } }
      return fail([e && e.message ? e.message : 'storage']);
    }
  }

  // 주소/문장에서 팩 id 뽑기: 전체 URL(?pack=…) 또는 id 만
  function parseId(text) {
    const t = String(text || '').trim();
    if (!t) return null;
    try {
      const u = new URL(t);
      const id = u.searchParams.get('pack');
      return id && C().PACK_ID_RE.test(id) ? id : null;
    } catch (e) { /* URL 아님 */ }
    const m = /[?&]pack=([A-Za-z0-9_-]+)/.exec(t);
    if (m && C().PACK_ID_RE.test(m[1])) return m[1];
    return C().PACK_ID_RE.test(t) ? t : null;
  }

  async function importById(id) {
    try {
      if (typeof id !== 'string' || !C().PACK_ID_RE.test(id)) throw mkErr('bad-id');
      await EW.store.open();
      const st = await EW.store.getSettings();
      if ((st.importedPacks || []).includes(id)) return { status: 'duplicate', count: 0 };
      const obj = await fetchPack(id);
      if (obj && typeof obj === 'object' && obj.packId !== id) throw mkErr('invalid');
      const r = await importPack(obj);
      if (r.status === 'invalid') {
        console.warn('[edge-walkers] 팩 거부:', r.errors.join(' / '));
        return { status: 'error', code: r.errors[0] === 'storage' ? 'storage' : 'invalid' };
      }
      try { localStorage.setItem('ew.lastPack', id); } catch (e) { /* 무시 */ }
      return { status: r.status, count: r.added.length };
    } catch (e) {
      return { status: 'error', code: (e && e.code) || 'network' };
    }
  }

  function importFromLocation() {
    const id = new URLSearchParams(location.search).get('pack');
    if (id == null) return Promise.resolve({ status: 'none' });
    return importById(id);
  }

  // 홈 화면 앱(저장소가 비어 있음)용 최후 폴백: 링크 붙여넣기
  function showPasteDialog(onDone) {
    if (document.getElementById('ew-paste')) return;
    const css = document.createElement('style');
    css.textContent =
      '#ew-paste{position:fixed;inset:0;z-index:2147482000;background:rgba(10,12,20,.78);display:flex;align-items:center;justify-content:center;padding:24px;' +
      'font:15px/1.5 -apple-system,system-ui,"Apple SD Gothic Neo",sans-serif;color:#fff}' +
      '#ew-paste .box{width:100%;max-width:360px;background:#262b3d;border-radius:18px;padding:20px;box-shadow:0 10px 40px rgba(0,0,0,.5)}' +
      '#ew-paste h2{margin:0 0 6px;font-size:18px}#ew-paste p{margin:0 0 12px;color:#c9cfe4;font-size:14px}' +
      '#ew-paste input{width:100%;box-sizing:border-box;padding:12px;border-radius:10px;border:1px solid #4a526e;background:#171a26;color:#fff;font-size:16px;-webkit-user-select:text;user-select:text}' +
      '#ew-paste .msg{min-height:20px;margin:8px 0;color:#ff9b9b;font-size:13px}' +
      '#ew-paste .row{display:flex;gap:8px}#ew-paste button{flex:1;padding:12px;border-radius:10px;border:0;font-size:15px;font-weight:600;color:#fff;background:#4c6fff}' +
      '#ew-paste button.sub{background:#3a4058}';
    const wrap = document.createElement('div');
    wrap.id = 'ew-paste';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    const box = document.createElement('div'); box.className = 'box';
    const h = document.createElement('h2'); h.textContent = '친구가 보낸 링크가 있나요?';
    const p = document.createElement('p'); p.textContent = '홈 화면 앱은 Safari와 저장 공간이 따로예요. 받은 링크를 여기에 붙여넣으면 캐릭터를 가져와요.';
    const inp = document.createElement('input');
    inp.type = 'url'; inp.placeholder = 'https://…?pack=…'; inp.setAttribute('aria-label', '캐릭터 링크');
    inp.autocapitalize = 'off'; inp.autocomplete = 'off';
    const msg = document.createElement('div'); msg.className = 'msg'; msg.setAttribute('role', 'alert');
    const row = document.createElement('div'); row.className = 'row';
    const go = document.createElement('button'); go.type = 'button'; go.textContent = '가져오기';
    const skip = document.createElement('button'); skip.type = 'button'; skip.className = 'sub'; skip.textContent = '나중에';
    row.append(go, skip);
    box.append(h, p, inp, msg, row);
    wrap.append(css, box);
    document.body.appendChild(wrap);
    const close = () => wrap.remove();
    skip.addEventListener('click', () => { try { localStorage.setItem('ew.pasteSkipped', '1'); } catch (e) { /* 무시 */ } close(); });
    go.addEventListener('click', async () => {
      const id = parseId(inp.value);
      if (!id) { msg.textContent = '올바른 링크가 아니에요. 친구에게 받은 링크를 그대로 붙여넣어 주세요.'; return; }
      go.disabled = true; msg.style.color = '#c9cfe4'; msg.textContent = '받아오는 중…';
      const r = await importById(id);
      go.disabled = false;
      if (r.status === 'added' || r.status === 'duplicate') { close(); if (onDone) onDone(r); }
      else { msg.style.color = '#ff9b9b'; msg.textContent = friendlyError(r.code); }
    });
    setTimeout(() => inp.focus(), 50);
  }

  EW.packs = { validatePack, fetchPack, importPack, importFromLocation, importById, parseId, friendlyError, showPasteDialog };
})();

// 부팅·조립: 캐릭터 합치기(builtin < folder, + user), 설정 반영, 엔진 구동, 녹화 모드.
(function () {
  const EW = (window.EW = window.EW || {});
  const q = new URLSearchParams(location.search);
  const record = q.get('record') === '1';
  const hideUI = record || q.get('hideUI') === '1';
  const seed = Number(q.get('seed')) || 1;
  const loopDur = Number(q.get('loop')) || 0;
  const charFilter = q.get('chars') ? q.get('chars').split(',').map((s) => s.trim()).filter(Boolean) : null;
  const spritesBase = q.get('spritesBase') || 'sprites/';
  const REC = { w: 393, h: 852, dpr: 3, insets: { top: 59, right: 0, bottom: 34, left: 0 } };

  const canvas = document.getElementById('ew-canvas');
  const root = document.getElementById('ew-ui-root');
  const probe = document.getElementById('ew-probe');
  const engine = EW.engine.create(canvas, { seed, loop: loopDur ? { duration: loopDur } : null });

  let baseDefs = []; // 오버라이드 적용 전 전체 (builtin + folder + user)
  let settings = null;

  function measureInsets() {
    const cs = getComputedStyle(probe);
    return { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 };
  }
  function fit() {
    if (record) { engine.resize(REC.w, REC.h, REC.dpr); engine.setInsets(REC.insets); return; }
    engine.resize(window.innerWidth, window.innerHeight, Math.min(window.devicePixelRatio || 1, 3));
    engine.setInsets(measureInsets());
  }

  async function safe(fn, fallback) {
    try { return await fn(); } catch (e) { console.warn('[edge-walkers]', e && e.message); return fallback; }
  }

  async function gather() {
    const map = new Map();
    const demo = EW.demo ? await safe(() => EW.demo.getDemoChars(), []) : [];
    for (const d of demo) map.set(d.id, Object.assign({ source: 'builtin' }, d));
    const folder = EW.loader ? await safe(() => EW.loader.loadFolderChars(spritesBase), []) : [];
    for (const d of folder) map.set(d.id, Object.assign({}, d, { source: 'folder' })); // folder > builtin
    if (!record && EW.store) {
      const stored = await safe(() => EW.store.listUserChars(), []);
      for (const sc of stored) {
        const d = await safe(() => EW.store.storedToDef(sc), null);
        if (d) map.set(d.id, Object.assign({ source: 'user' }, d));
      }
    }
    return Array.from(map.values());
  }


  // ---- 홈 화면 앱(PWA) 지원 ------------------------------------------------
  // iOS 는 Safari 와 홈 화면 앱의 저장소가 분리돼 있어서, 시작 URL 에 ?pack 이 실려 있어야 한다.
  // 1) 현재 URL 을 start_url 로 하는 동적 매니페스트(Blob) 2) 주소의 ?pack 유지(지우지 않음) 3) SW 의 manifest.webmanifest?pack= 응답
  const isStandalone = () => window.navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  function setupManifest() {
    if (record || !/^https?:$/.test(location.protocol)) return;
    const link = document.querySelector('link[rel="manifest"]');
    if (!link) return;
    const scope = new URL('./', location.href).href;
    const packId = q.get('pack');
    const startUrl = packId && EW.config && EW.config.PACK_ID_RE.test(packId) ? scope + '?pack=' + packId : scope;
    const abs = (f) => new URL(f, scope).href;
    const m = {
      name: 'Edge Walkers', short_name: 'Edge Walkers', description: '가장자리를 걷는 캐릭터 배경화면',
      id: scope, start_url: startUrl, scope, display: 'standalone', orientation: 'portrait',
      background_color: '#1b1f2a', theme_color: '#1b1f2a',
      icons: [
        { src: abs('icons/icon-192.png'), sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: abs('icons/icon-512.png'), sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: abs('icons/icon-maskable-512.png'), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    };
    try {
      link.href = URL.createObjectURL(new Blob([JSON.stringify(m)], { type: 'application/manifest+json' }));
    } catch (e) {
      if (packId) link.href = 'manifest.webmanifest?pack=' + encodeURIComponent(packId); // SW 가 start_url 을 바꿔 응답
    }
  }
  function registerSW() {
    if (record || !('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('[edge-walkers] SW 등록 실패', e && e.message));
  }
  async function receivePack() {
    if (!EW.packs) return { status: 'none' };
    const r = await safe(() => EW.packs.importFromLocation(), { status: 'error', code: 'network' });
    if (r.status === 'added') {
      await reload();
      if (EW.ui && EW.ui.refresh) EW.ui.refresh();
      if (EW.toast) EW.toast('캐릭터 ' + r.count + '개 받았어요', 'ok');
    } else if (r.status === 'error') {
      if (EW.toast) EW.toast(EW.packs.friendlyError(r.code), 'error', 6000);
    }
    return r;
  }
  async function maybeAskForLink(r) {
    // 홈 화면 앱이 빈 저장소로 떴을 때만: 주소에 pack 없음 + 내 캐릭터·받은 팩 없음
    if (!EW.packs || !isStandalone() || q.get('pack') || r.status === 'added') return;
    try { if (localStorage.getItem('ew.pasteSkipped')) return; } catch (e) { /* 무시 */ }
    const st = await safe(() => EW.store.getSettings(), null);
    const users = await safe(() => EW.store.listUserChars(), []);
    if (st && (st.importedPacks || []).length) return;
    if (users.length) return;
    EW.packs.showPasteDialog(async () => { await reload(); if (EW.toast) EW.toast('캐릭터를 받았어요', 'ok'); });
  }

  async function reload() {
    if (!record && EW.store) settings = await safe(() => EW.store.getSettings(), null);
    baseDefs = await gather();
    let defs = baseDefs;
    if (record) {
      // 재현성: 사용자 설정·오버라이드 무시, ?chars 순서대로
      if (charFilter) defs = charFilter.map((id) => baseDefs.find((d) => d.id === id)).filter(Boolean);
    } else {
      if (EW.store && settings) defs = EW.store.applyOverrides(baseDefs, settings);
      if (charFilter) defs = defs.filter((d) => charFilter.includes(d.id));
    }
    engine.setCharacters(defs);
    if (settings && settings.bg) engine.setBackground(settings.bg);
  }

  setupManifest();

  const ready = (async function () {
    if (EW.store && !record) await safe(() => EW.store.open(), null);
    fit();
    await reload();
    if (!record) {
      new ResizeObserver(fit).observe(document.documentElement);
      window.addEventListener('orientationchange', () => setTimeout(fit, 200));
      engine.start();
    }
    return true;
  })();

  // 초기 화면을 먼저 띄운 뒤 ?pack 을 받는다 (네트워크가 느려도 앱은 바로 보임)
  const packReady = ready.then(async () => {
    if (record) return { status: 'none' };
    registerSW();
    const r = await receivePack();
    if (EW.a2hs && !hideUI) { try { EW.a2hs.init(); } catch (e) { console.warn('[edge-walkers] a2hs', e && e.message); } }
    await maybeAskForLink(r);
    return r;
  });

  window.__ew = { engine, ready, packReady, reload, getBaseDefs: () => baseDefs };

  if (hideUI) {
    root.style.display = 'none';
  } else {
    root.addEventListener('ew:tap', (e) => engine.tap(e.detail.x, e.detail.y));
    ready.then(() => {
      if (EW.ui) {
        EW.ui.init({ root, getEngine: () => engine, getAllDefs: () => baseDefs, onChange: reload });
      } else {
        // 설정 UI 가 없는 빌드에서도 탭 점프는 동작
        root.addEventListener('pointerup', (e) => engine.tap(e.clientX, e.clientY));
      }
    });
  }
})();

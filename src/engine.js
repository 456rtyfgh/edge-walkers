// 엔진: 개체 관리, 경로 위 배치, 프레임 선택·회전·반전 렌더, 배경, 탭 점프.
(function () {
  const EW = (window.EW = window.EW || {});
  const FOOT = 224 / 256; // 프레임 캔버스 높이 대비 발 기준선 (규격)
  const SIZE_RATIO = 0.16; // 화면 너비 대비 캐릭터 높이 (scale 1)
  const MAX_WALKERS = 16;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);

  function create(canvas, opts) {
    opts = opts || {};
    const B = EW.behavior, PATH = EW.path;
    const ctx = canvas.getContext('2d');
    const seed = opts.seed == null ? 1 : opts.seed;
    const loop = opts.loop && opts.loop.duration > 0 ? opts.loop : null;
    let W = 390, H = 844, dpr = opts.dpr || 1;
    let insets = { top: 0, right: 0, bottom: 0, left: 0 };
    let defs = [], walkers = [], path = null, rand = B.rng(seed);
    let t = 0, running = false, rafId = 0, lastTs = 0;
    let bg = { type: 'color', color: '#1b1f2a' }, bgImg = null, bgCache = null, bgToken = 0;

    // ---------- 배경 ----------
    function rebuildBg() {
      bgCache = null;
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(W * dpr)); c.height = Math.max(1, Math.round(H * dpr));
      const g = c.getContext('2d');
      g.scale(dpr, dpr);
      if (bg.type === 'image' && bgImg) {
        g.fillStyle = bg.color || '#1b1f2a'; g.fillRect(0, 0, W, H);
        const iw = bgImg.width, ih = bgImg.height;
        const k = bg.fit === 'contain' ? Math.min(W / iw, H / ih) : Math.max(W / iw, H / ih);
        g.drawImage(bgImg, (W - iw * k) / 2, (H - ih * k) / 2, iw * k, ih * k);
      } else if (bg.type === 'gradient') {
        const gr = g.createLinearGradient(0, 0, W * 0.45, H);
        gr.addColorStop(0, bg.color || '#1b1f2a'); gr.addColorStop(1, bg.color2 || bg.color || '#2c3350');
        g.fillStyle = gr; g.fillRect(0, 0, W, H);
      } else {
        g.fillStyle = bg.color || '#1b1f2a'; g.fillRect(0, 0, W, H);
      }
      bgCache = c;
    }
    function setBackground(next) {
      bg = Object.assign({ type: 'color', color: '#1b1f2a' }, next || {});
      bgImg = null;
      const token = ++bgToken;
      rebuildBg();
      if (bg.type === 'image' && bg.image) {
        createImageBitmap(bg.image).then((bmp) => {
          if (token !== bgToken) return;
          bgImg = bmp; rebuildBg(); if (!running) render();
        }).catch(() => {});
      }
      document.documentElement.style.background = bg.color || '#1b1f2a';
    }

    // ---------- 레이아웃 ----------
    function layout() {
      const oldP = path ? path.P : 0;
      path = PATH.make({ W, H, insets, margin: 3, radius: clamp(W * 0.15, 14, 90) });
      for (const w of walkers) {
        w.dh = W * SIZE_RATIO * w.scale;
        w.dw = (w.dh * w.def.size.w) / w.def.size.h;
        w.v = (w.def.speed * W / 390) * w.vMul;
      }
      if (loop) buildLoop();
      else if (oldP) for (const w of walkers) w.s *= path.P / oldP;
    }

    function buildLoop() {
      const n = walkers.length;
      const spots = [path.cornerS[0], path.cornerS[2], path.cornerS[1], path.cornerS[3], ...path.edgeMidS];
      const homes = walkers.map((_, i) => spots[i % spots.length]);
      let minD = path.P / 2;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        let d = Math.abs(homes[i] - homes[j]); d = Math.min(d, path.P - d);
        if (d > 1) minD = Math.min(minD, d);
      }
      const hw = Math.min(220 * W / 390, minD * 0.4);
      const r = B.rng(seed * 7919 + 13);
      walkers.forEach((w, i) => {
        w.plan = B.buildPlan({ rng: r, def: w.def, v: w.v, D: loop.duration, home: homes[i], hw });
      });
      applyPlans();
    }
    function applyPlans() {
      for (const w of walkers) {
        const e = B.evalPlan(w.plan, t);
        w.s = e.s; w.dir = e.dir; w.pose = e.pose; w.animT = e.animT; w.action = e.pose; w.blocked = false;
      }
    }

    // ---------- 개체 ----------
    function setCharacters(next) {
      defs = (next || []).filter((d) => d && d.frames && d.frames.walk && d.frames.walk.length && d.frames.idle && d.frames.idle.length);
      rand = B.rng(seed);
      walkers = [];
      t = 0;
      for (const d of defs) {
        const def = Object.assign({}, d, {
          scale: num(d.scale, 1) > 0 ? d.scale : 1, speed: num(d.speed, 60), fps: num(d.fps, 8) > 0 ? d.fps : 8,
          size: d.size || { w: 256, h: 256 },
        });
        const cnt = clamp(Math.round(num(d.count, 1)), 1, 8);
        for (let k = 0; k < cnt && walkers.length < MAX_WALKERS; k++) {
          walkers.push({
            def, id: def.id, scale: def.scale, vMul: loop ? 1 : 0.9 + rand() * 0.2,
            s: 0, dir: 1, action: 'walk', pose: 'walk', aT: 0, animT: 0, dur: 0, walkLeft: 0,
            waitT: 0, waitLimit: 1, blocked: false, dh: 0, dw: 0, v: 0, lastPose: '', plan: null,
          });
        }
      }
      layout();
      if (!loop) {
        const n = walkers.length;
        walkers.forEach((w, i) => {
          w.s = ((i + 0.15 + rand() * 0.7) / n) * path.P;
          B.spawn(w, rand);
          w.pose = w.action; w.lastPose = w.pose;
        });
      } else {
        walkers.forEach((w) => { w.lastPose = w.pose; });
      }
      if (!running) render();
    }

    function resize(cssW, cssH, ratio) {
      W = Math.max(1, cssW); H = Math.max(1, cssH); dpr = ratio || dpr || 1;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      rebuildBg();
      if (bgImg === null && bg.type === 'image') setBackground(bg);
      layout();
      if (!running) render();
    }
    function setInsets(i) {
      insets = { top: num(i && i.top, 0), right: num(i && i.right, 0), bottom: num(i && i.bottom, 0), left: num(i && i.left, 0) };
      layout();
      if (!running) render();
    }

    // ---------- 진행 ----------
    function step(dt) {
      if (!(dt > 0)) return;
      t += dt;
      if (loop) { applyPlans(); return; }
      for (const w of walkers) {
        B.liveStep(w, dt, walkers, path.P, rand);
        if (w.pose !== w.lastPose) { w.animT = 0; w.lastPose = w.pose; } else w.animT += dt;
      }
    }
    // 녹화용: loop 모드에서 임의 시각으로 이동. live 모드에선 dt 단위로 앞으로만 감는다.
    function seek(target) {
      if (loop) { t = target; applyPlans(); return; }
      while (t < target - 1e-9) step(Math.min(1 / 60, target - t));
    }

    function frameIndex(w) {
      const frames = B.framesFor(w.def, w.pose === 'jump' ? 'jump' : w.pose);
      const n = frames.length;
      if (w.pose === 'jump') {
        if (!B.has(w.def, 'jump')) return 0;
        const p = clamp(w.aT / B.JUMP_DUR, 0, 0.999);
        if (n >= 3) return p < 0.18 ? 0 : p < 0.75 ? 1 + Math.floor(((p - 0.18) / 0.57) * (n - 2)) : n - 1;
        return n === 2 ? (p < 0.75 ? 0 : 1) : 0;
      }
      const rate = w.def.fps * (B.RATE[w.pose] || 1);
      return Math.floor(w.animT * rate) % n;
    }

    // ---------- 렌더 ----------
    function render() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (bgCache) ctx.drawImage(bgCache, 0, 0, canvas.width, canvas.height);
      else { ctx.fillStyle = '#1b1f2a'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      for (const w of walkers) {
        const p = path.at(w.s);
        const frames = B.framesFor(w.def, w.pose);
        const img = frames[frameIndex(w) % frames.length];
        let hop = 0;
        if (w.pose === 'jump' || w.action === 'jump') hop = Math.sin(Math.PI * clamp(w.aT / B.JUMP_DUR, 0, 1)) * w.dh * 0.7;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.theta);
        if (w.dir < 0) ctx.scale(-1, 1); // 반대로 걸으면 좌우반전 (몸통 위쪽은 화면 안쪽 유지)
        ctx.translate(0, -hop);
        ctx.drawImage(img, -w.dw / 2, -FOOT * w.dh, w.dw, w.dh);
        ctx.restore();
      }
    }

    function tick(ts) {
      if (!running) return;
      const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0;
      lastTs = ts;
      step(dt); render();
      rafId = requestAnimationFrame(tick);
    }
    function start() { if (running) return; running = true; lastTs = 0; rafId = requestAnimationFrame(tick); }
    function stop() { running = false; cancelAnimationFrame(rafId); }

    // ---------- 입력 ----------
    function tap(x, y) {
      if (loop) return;
      let best = null, bd = Infinity;
      for (const w of walkers) {
        const p = path.at(w.s);
        const cx = p.x + Math.sin(p.theta) * w.dh * 0.4, cy = p.y - Math.cos(p.theta) * w.dh * 0.4;
        const d = Math.hypot(x - cx, y - cy);
        if (d < bd) { bd = d; best = w; }
      }
      if (best && bd <= Math.max(best.dh * 1.2, 56)) B.jump(best, rand);
    }

    function getState() {
      return {
        t,
        walkers: walkers.map((w) => ({
          id: w.id, edge: path.at(w.s).edge, s: w.s, dir: w.dir,
          action: w.pose, frame: frameIndex(w),
        })),
      };
    }
    // 테스트용: i 번째 개체를 경로 위 s 로 옮기고 걷기 상태로 고정
    function _place(i, s, dir) {
      const w = walkers[i];
      if (!w || loop) return;
      w.s = s; if (dir) w.dir = dir;
      B.startAction(w, 'walk', rand); w.walkLeft = 1e9; w.pose = 'walk';
      if (!running) render();
    }
    function _info() { return { W, H, dpr, P: path.P, rect: path.rect, cornerS: path.cornerS, edgeMidS: path.edgeMidS, n: walkers.length }; }

    setBackground(bg);
    return { setCharacters, setBackground, resize, setInsets, start, stop, step, seek, render, tap, getState, _place, _info };
  }

  EW.engine = { create };
})();

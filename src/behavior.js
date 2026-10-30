// 행동 상태머신(live) + 주기 스케줄(loop). 모든 난수는 시드 PRNG 로만 뽑는다.
(function () {
  const EW = (window.EW = window.EW || {});

  function rng(seed) {
    let a = (seed >>> 0) || 1; // mulberry32
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const range = (r, lo, hi) => lo + (hi - lo) * r();

  const PAUSE_DUR = { idle: [1.5, 3.5], look: [2, 3.5], sit: [3, 6], sleep: [5, 9] };
  const PAUSE_W = [['idle', 0.45], ['look', 0.2], ['sit', 0.2], ['sleep', 0.15]];
  const JUMP_DUR = 0.7;
  // 액션별 프레임 재생 속도 배율 (walk 는 def.fps 그대로)
  const RATE = { walk: 1, idle: 0.4, look: 0.25, sit: 0.3, sleep: 0.2, jump: 1 };
  // 선택 액션이 없을 때의 대체 순서
  const FALLBACK = { look: ['look', 'idle'], sit: ['sit', 'idle'], sleep: ['sleep', 'sit', 'idle'], jump: ['jump', 'idle'], idle: ['idle'], walk: ['walk'] };

  function has(def, a) { return !!(def.frames[a] && def.frames[a].length); }
  function framesFor(def, action) {
    const list = FALLBACK[action] || [action];
    for (const a of list) if (has(def, a)) return def.frames[a];
    return def.frames.idle;
  }
  function pickPause(def, r) {
    const opts = PAUSE_W.filter((p) => has(def, p[0]));
    let sum = 0;
    for (const p of opts) sum += p[1];
    let x = r() * sum;
    for (const p of opts) { x -= p[1]; if (x <= 0) return p[0]; }
    return 'idle';
  }

  // ---------- live ----------
  function startAction(w, a, r) {
    w.action = a; w.aT = 0;
    if (a === 'walk') w.walkLeft = range(r, 4, 12);
    else if (a === 'jump') w.dur = JUMP_DUR;
    else w.dur = range(r, PAUSE_DUR[a][0], PAUSE_DUR[a][1]);
  }

  // 진행 방향 앞쪽에서 막고 있는 개체. 마주 오는 개체이거나, 같은 방향이지만 멈췄거나 더 느린 개체.
  function blockerOf(w, all, P) {
    for (const o of all) {
      if (o === w) continue;
      let d = ((o.s - w.s) * w.dir) % P;
      if (d < 0) d += P;
      const gap = (w.dw + o.dw) * 0.5 * 0.7;
      if (d >= gap) continue;
      const oMoving = o.action === 'walk' && !o.blocked;
      const approaching = oMoving && o.dir !== w.dir;
      const slower = !oMoving || (o.dir === w.dir && o.v < w.v * 0.97);
      if (approaching || slower) return { o, approaching };
    }
    return null;
  }

  function spawn(w, r) {
    w.dir = r() < 0.8 ? 1 : -1;
    w.waitT = 0; w.waitLimit = range(r, 0.9, 2);
    w.blocked = false;
    if (r() < 0.25) startAction(w, pickPause(w.def, r), r);
    else startAction(w, 'walk', r);
    w.aT = r() * 1.5;
  }

  function liveStep(w, dt, all, P, r) {
    w.aT += dt;
    w.blocked = false;
    w.pose = w.action;
    if (w.action === 'jump') {
      if (w.aT >= w.dur) startAction(w, 'walk', r);
      return;
    }
    if (w.action === 'walk') {
      const b = blockerOf(w, all, P);
      if (b) {
        w.blocked = true;
        w.pose = b.approaching && has(w.def, 'look') ? 'look' : 'idle';
        w.waitT += dt;
        if (w.waitT > w.waitLimit) { // 오래 막히면 돌아선다
          w.dir = -w.dir; w.waitT = 0; w.waitLimit = range(r, 0.9, 2);
        }
        return;
      }
      w.waitT = 0;
      w.s = (((w.s + w.dir * w.v * dt) % P) + P) % P;
      w.walkLeft -= dt;
      if (w.walkLeft <= 0) startAction(w, pickPause(w.def, r), r);
    } else if (w.aT >= w.dur) {
      if (r() < 0.2) w.dir = -w.dir;
      startAction(w, 'walk', r);
    }
  }

  function jump(w, r) {
    startAction(w, 'jump', r);
    w.blocked = false;
  }

  // ---------- loop (주기 D 스케줄) ----------
  // 한 개체의 타임라인: [걷기 → 멈춤] x3 이 정확히 D 초에 닫힌다 (w0→w1→w2→w0).
  // 상태는 시각 τ 만의 함수라서 t=0 과 t=D 가 항상 동일하다.
  function buildPlan(o) {
    const r = o.rng, D = o.D, v = o.v;
    const budget = v * D * 0.6; // 걷는 총 거리 상한
    const hw = Math.max(20, Math.min(o.hw, budget / 4));
    let a = 0, b = 0, c = 0, ok = false;
    for (let i = 0; i < 30 && !ok; i++) {
      a = (r() * 2 - 1) * hw; b = (r() * 2 - 1) * hw; c = (r() * 2 - 1) * hw;
      const span = Math.max(a, b, c) - Math.min(a, b, c);
      ok = span >= hw * 0.9 && Math.abs(b - a) > 25 && Math.abs(c - b) > 25 && Math.abs(a - c) > 25;
    }
    if (!ok) { a = -hw * 0.8; b = hw * 0.8; c = hw * 0.1; }
    const pts = [o.home + a, o.home + b, o.home + c, o.home + a];
    const legs = [];
    let walkTotal = 0;
    for (let i = 0; i < 3; i++) {
      const d = pts[i + 1] - pts[i];
      legs.push({ from: pts[i], d, dur: Math.abs(d) / v });
      walkTotal += Math.abs(d) / v;
    }
    const pauseTotal = D - walkTotal;
    const wts = [0.6 + r() * 0.8, 0.6 + r() * 0.8, 0.6 + r() * 0.8];
    const wsum = wts[0] + wts[1] + wts[2];
    const pick = (list) => list[Math.floor(r() * list.length)];
    const avail = (list) => list.filter((x) => has(o.def, x));
    const slotActs = [
      pick(avail(['idle', 'look', 'look'])),
      null,
      'idle',
    ];
    const pauses = wts.map((x) => (pauseTotal * x) / wsum);
    slotActs[1] = pick(avail(pauses[1] > 3 ? ['sit', 'sit', 'sleep', 'idle'] : ['sit', 'idle', 'look']));
    const segs = [];
    let tt = 0;
    for (let i = 0; i < 3; i++) {
      const dir = legs[i].d >= 0 ? 1 : -1;
      segs.push({ t0: tt, dur: legs[i].dur, type: 'walk', from: legs[i].from, d: legs[i].d, dir });
      tt += legs[i].dur;
      segs.push({ t0: tt, dur: pauses[i], type: 'pause', action: slotActs[i], at: pts[i + 1], dir });
      tt += pauses[i];
    }
    return { D, segs, phase: r() * D };
  }

  // 사다리꼴 속도 프로파일(가속·감속 15%)로 u∈[0,1] → 진행 비율
  function ease(u) {
    const rr = 0.15, vn = 1 / (1 - rr);
    if (u <= 0) return 0;
    if (u >= 1) return 1;
    if (u < rr) return (0.5 * vn * u * u) / rr;
    if (u > 1 - rr) return 1 - (0.5 * vn * (1 - u) * (1 - u)) / rr;
    return vn * (u - rr / 2);
  }

  function evalPlan(p, t) {
    const tau = (((t + p.phase) % p.D) + p.D) % p.D;
    let seg = p.segs[p.segs.length - 1];
    for (const s of p.segs) if (tau < s.t0 + s.dur) { seg = s; break; }
    const el = Math.min(Math.max(tau - seg.t0, 0), seg.dur);
    if (seg.type === 'walk') {
      return { s: seg.from + seg.d * ease(seg.dur > 0 ? el / seg.dur : 1), dir: seg.dir, pose: 'walk', animT: el, moving: true };
    }
    return { s: seg.at, dir: seg.dir, pose: seg.action, animT: el, moving: false };
  }

  EW.behavior = { rng, range, has, framesFor, RATE, JUMP_DUR, spawn, liveStep, jump, buildPlan, evalPlan, startAction, pickPause };
})();

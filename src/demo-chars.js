// demo-chars.js — 오리지널 데모 캐릭터 2종(말랑 떡 슬라임, 꼬마 유령)을 Canvas 로 직접 그려 프레임 생성
// 규격: 256x256, 옆모습·오른쪽을 바라봄, 발(바닥)은 y=224, 가운데 x=128
(function () {
  const EW = (window.EW = window.EW || {});
  const S = 256, FOOT = 224, CX = 128;

  function make(draw) {
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    g.lineJoin = g.lineCap = 'round';
    draw(g);
    return c;
  }

  // 잠자는 표시 'z'
  function drawZ(g, x, y, s) {
    g.save();
    g.strokeStyle = '#ffffff'; g.lineWidth = 5; g.globalAlpha = 0.9;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + s, y); g.lineTo(x, y + s); g.lineTo(x + s, y + s); g.stroke();
    g.restore();
  }

  function eyes(g, ex, ey, o, gap, color) {
    g.fillStyle = g.strokeStyle = color;
    const ox = (o.look || 0) * 6, oy = o.lookUp ? -6 : 0;
    for (let i = 0; i < 2; i++) {
      const x = ex + i * gap + ox, y = ey + oy;
      if (o.eye === 'closed') {
        g.lineWidth = 4; g.beginPath(); g.arc(x, y, 7, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
      } else {
        const r = o.eye === 'wide' ? 10 : 8;
        g.beginPath(); g.ellipse(x, y, r - 1, r + 2, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(x + 2 + (o.look || 0) * 1.5, y - 4, 2.6, 0, Math.PI * 2); g.fill();
        g.fillStyle = color;
      }
    }
  }

  // ───────── 말랑 떡 슬라임 ─────────
  function drawSlime(g, o) {
    const w = o.w || 150, h = o.h || 105, lift = o.lift || 0, dx = o.dx || 0, sk = o.skew || 0;
    const b = FOOT - lift, cx = CX + dx, top = b - h;
    // 바닥 그림자 (공중일 때 작아짐)
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.beginPath(); g.ellipse(CX, FOOT, (w / 2) * (1 - lift / 160), 5, 0, 0, Math.PI * 2); g.fill();
    g.beginPath();
    g.moveTo(cx - w / 2, b);
    g.bezierCurveTo(cx - w / 2 - 8, b - h * 0.55, cx - w * 0.28 + sk, top, cx + sk, top);
    g.bezierCurveTo(cx + w * 0.28 + sk, top, cx + w / 2 + 8, b - h * 0.55, cx + w / 2, b);
    g.quadraticCurveTo(cx, b + 2, cx - w / 2, b);
    g.closePath();
    const gr = g.createLinearGradient(0, top, 0, b);
    gr.addColorStop(0, '#b4f0d4'); gr.addColorStop(1, '#63cfa4');
    g.fillStyle = gr; g.fill();
    g.lineWidth = 5; g.strokeStyle = '#2f9272'; g.stroke();
    // 윤기
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath(); g.ellipse(cx - w * 0.2 + sk, top + h * 0.28, w * 0.1, h * 0.09, -0.6, 0, Math.PI * 2); g.fill();
    // 머리 위 새싹
    const sx = cx + sk - 6;
    g.strokeStyle = '#2f9272'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(sx, top + 2); g.quadraticCurveTo(sx - 2, top - 14, sx + 8, top - 20); g.stroke();
    g.fillStyle = '#8be08a';
    g.beginPath(); g.ellipse(sx + 14, top - 20, 11, 6, -0.4, 0, Math.PI * 2); g.fill(); g.stroke();
    // 얼굴 (오른쪽으로 치우침)
    const ex = cx + w * 0.12 + sk * 0.5, ey = b - h * 0.52;
    eyes(g, ex, ey, o, 30, '#1f3b38');
    g.fillStyle = 'rgba(255,130,150,0.55)';
    g.beginPath(); g.ellipse(ex + 40, ey + 14, 8, 5, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#1f3b38'; g.lineWidth = 3.5;
    g.beginPath(); g.arc(ex + 15 + (o.look || 0) * 4, ey + 12, 6, 0.1 * Math.PI, 0.9 * Math.PI); g.stroke();
  }

  // ───────── 꼬마 유령 ─────────
  function drawGhost(g, o) {
    const w = o.w || 104, h = o.h || 124, lift = o.lift || 0, tilt = o.tilt || 0, wave = o.wave || 0;
    const b = FOOT - lift, top = b - h, r = w / 2;
    g.fillStyle = 'rgba(0,0,0,0.16)';
    g.beginPath(); g.ellipse(CX, FOOT, r * 0.8 * (1 - lift / 160), 5, 0, 0, Math.PI * 2); g.fill();
    g.save();
    g.translate(CX, b); g.rotate(tilt); g.translate(-CX, -b);
    // 팔
    const armUp = o.armUp ? 1 : 0;
    g.fillStyle = '#f1edff'; g.strokeStyle = '#7b6cc0'; g.lineWidth = 5;
    for (const side of [1, -1]) {
      if (side === -1 && !o.armUp) continue; // 옆모습: 평소엔 앞팔 하나만
      g.save();
      g.translate(CX + side * (r - 2) * (armUp ? 1 : 0.55), top + h * 0.52);
      g.rotate(side * (armUp ? -2.2 : 0.7));
      g.beginPath(); g.ellipse(0, 14, 9, 17, 0, 0, Math.PI * 2); g.fill(); g.stroke();
      g.restore();
    }
    // 몸통: 돔 + 물결 바닥(발 번갈아 닿음)
    g.beginPath();
    g.moveTo(CX - r, b - 14);
    g.arc(CX, top + r, r, Math.PI, 0);
    g.lineTo(CX + r, b - 14);
    const n = 3, seg = w / n;
    for (let k = 0; k < n; k++) {
      const xr = CX + r - k * seg, xl = xr - seg;
      const depth = (k % 2 === (wave ? 1 : 0)) ? 14 : 5; // 바닥(b)까지 내려오는 정도
      g.bezierCurveTo(xr - 3, b - 14 + depth, xl + 3, b - 14 + depth, xl, b - 14);
    }
    g.closePath();
    const gr = g.createLinearGradient(0, top, 0, b);
    gr.addColorStop(0, '#fbf9ff'); gr.addColorStop(1, '#d9d0f7');
    g.fillStyle = gr; g.fill(); g.stroke();
    // 얼굴
    const ex = CX + r * 0.1, ey = top + h * 0.38;
    eyes(g, ex, ey, o, 28, '#2b2450');
    g.fillStyle = 'rgba(255,140,170,0.55)';
    g.beginPath(); g.ellipse(ex + 38, ey + 16, 8, 5, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#2b2450'; g.lineWidth = 3.5;
    g.beginPath(); g.ellipse(ex + 14 + (o.look || 0) * 4, ey + 18, 5, o.open ? 6 : 3.5, 0, 0, Math.PI * 2);
    o.open ? g.fill() : g.stroke();
    g.restore();
  }

  function slimeFrames() {
    return {
      walk: [
        { w: 150, h: 105 },
        { w: 138, h: 118, skew: 10, dx: 3 },
        { w: 162, h: 94, dx: 2 },
        { w: 144, h: 112, skew: -5 },
      ].map((o) => make((g) => drawSlime(g, o))),
      idle: [{ w: 152, h: 104 }, { w: 146, h: 111 }].map((o) => make((g) => drawSlime(g, o))),
      look: [{ w: 144, h: 112, look: -1.5 }, { w: 144, h: 114, look: -1.5, lookUp: true, eye: 'wide' }]
        .map((o) => make((g) => drawSlime(g, o))),
      sit: [{ w: 170, h: 82 }].map((o) => make((g) => drawSlime(g, o))),
      jump: [
        { w: 172, h: 76 },
        { w: 124, h: 130, lift: 50, skew: 6, eye: 'wide' },
        { w: 164, h: 86 },
      ].map((o) => make((g) => drawSlime(g, o))),
      sleep: [
        { w: 168, h: 88, eye: 'closed' },
        { w: 172, h: 84, eye: 'closed' },
      ].map((o, i) => make((g) => { drawSlime(g, o); drawZ(g, 180 + i * 6, 96 - i * 14, 14 + i * 4); })),
    };
  }

  function ghostFrames() {
    return {
      walk: [
        { wave: 0, tilt: -0.05 }, { wave: 1, tilt: 0, h: 128 },
        { wave: 0, tilt: 0.05 }, { wave: 1, tilt: 0, h: 128 },
      ].map((o) => make((g) => drawGhost(g, o))),
      idle: [{ h: 124 }, { h: 130, armUp: true }].map((o) => make((g) => drawGhost(g, o))),
      look: [{ look: -1.5, tilt: -0.08 }, { look: -1.5, lookUp: true, tilt: -0.12, eye: 'wide' }]
        .map((o) => make((g) => drawGhost(g, o))),
      sit: [{ h: 92, w: 112 }].map((o) => make((g) => drawGhost(g, o))),
      jump: [
        { h: 96, w: 112 },
        { h: 134, lift: 52, armUp: true, open: true, eye: 'wide', wave: 1 },
        { h: 102, w: 110 },
      ].map((o) => make((g) => drawGhost(g, o))),
      sleep: [
        { h: 108, tilt: 0.12, eye: 'closed' },
        { h: 112, tilt: 0.16, eye: 'closed' },
      ].map((o, i) => make((g) => { drawGhost(g, o); drawZ(g, 178 + i * 6, 84 - i * 14, 14 + i * 4); })),
    };
  }

  const DEFS = [
    { id: 'slime', name: '말랑 떡 슬라임', speed: 58, fps: 8, scale: 1, count: 1, make: slimeFrames },
    { id: 'ghost', name: '꼬마 유령', speed: 50, fps: 6, scale: 1, count: 1, make: ghostFrames },
  ];

  EW.demo = {
    DEFS,
    async getDemoChars() {
      return DEFS.map((d) => ({
        id: d.id, name: d.name, source: 'builtin',
        scale: d.scale, speed: d.speed, fps: d.fps, count: d.count,
        size: { w: S, h: S }, frames: d.make(),
      }));
    },
  };
})();

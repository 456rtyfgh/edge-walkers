// 화면 둘레를 도는 둥근 사각형 경로. 발 접지점이 이 선 위를 따라간다.
// 진행 방향: 화면 기준 반시계 (바닥→오른쪽 벽(위로)→천장(왼쪽으로)→왼쪽 벽(아래로)).
// theta = 진행 방향 접선 각도(canvas rotate 에 그대로 사용) → 바닥 0, 오른쪽 벽 -90°, 천장 180°, 왼쪽 벽 90°.
// 모서리 호를 따라 theta 가 연속으로 변하므로 별도 보간 없이 부드럽게 회전한다.
(function () {
  const EW = (window.EW = window.EW || {});
  const PI = Math.PI;

  function make(o) {
    const W = o.W, H = o.H, ins = o.insets || { top: 0, right: 0, bottom: 0, left: 0 };
    const m = o.margin == null ? 3 : o.margin;
    const L = ins.left + m, R = W - ins.right - m, T = ins.top + m, B = H - ins.bottom - m;
    const w = Math.max(10, R - L), h = Math.max(10, B - T);
    const r = Math.max(1, Math.min(o.radius || 30, w / 2 - 1, h / 2 - 1));
    const segs = [];
    let acc = 0;
    function add(seg) { seg.s0 = acc; acc += seg.len; segs.push(seg); }
    const arcLen = (PI * r) / 2;
    add({ k: 'l', x: L + r, y: B, dx: 1, dy: 0, len: w - 2 * r, th: 0, e0: 'bottom', e1: 'bottom' });
    add({ k: 'a', cx: R - r, cy: B - r, a0: PI / 2, len: arcLen, e0: 'bottom', e1: 'right' });
    add({ k: 'l', x: R, y: B - r, dx: 0, dy: -1, len: h - 2 * r, th: -PI / 2, e0: 'right', e1: 'right' });
    add({ k: 'a', cx: R - r, cy: T + r, a0: 0, len: arcLen, e0: 'right', e1: 'top' });
    add({ k: 'l', x: R - r, y: T, dx: -1, dy: 0, len: w - 2 * r, th: PI, e0: 'top', e1: 'top' });
    add({ k: 'a', cx: L + r, cy: T + r, a0: -PI / 2, len: arcLen, e0: 'top', e1: 'left' });
    add({ k: 'l', x: L, y: T + r, dx: 0, dy: 1, len: h - 2 * r, th: PI / 2, e0: 'left', e1: 'left' });
    add({ k: 'a', cx: L + r, cy: B - r, a0: PI, len: arcLen, e0: 'left', e1: 'bottom' });
    const P = acc;

    function at(s) {
      s = ((s % P) + P) % P;
      let seg = segs[segs.length - 1];
      for (let i = 0; i < segs.length; i++) {
        if (s < segs[i].s0 + segs[i].len) { seg = segs[i]; break; }
      }
      const u = s - seg.s0;
      if (seg.k === 'l') {
        return { x: seg.x + seg.dx * u, y: seg.y + seg.dy * u, theta: seg.th, edge: seg.e0 };
      }
      const a = seg.a0 - u / r;
      return {
        x: seg.cx + r * Math.cos(a), y: seg.cy + r * Math.sin(a), theta: a - PI / 2,
        edge: u < seg.len / 2 ? seg.e0 : seg.e1,
      };
    }

    // 모서리 호 가운데 s (BR, TR, TL, BL 순) 와 변 가운데 s (bottom, right, top, left 순)
    const cornerS = [1, 3, 5, 7].map((i) => segs[i].s0 + segs[i].len / 2);
    const edgeMidS = [0, 2, 4, 6].map((i) => segs[i].s0 + segs[i].len / 2);
    return { P, r, rect: { L, R, T, B }, at, cornerS, edgeMidS };
  }

  EW.path = { make };
})();

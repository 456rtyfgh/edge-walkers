// 엔진 검증: node tests/engine.spec.mjs  (먼저 node build.mjs)
// 1) 390x844 에서 네 변·네 모서리 위치에 개체를 놓고 스크린샷 → tests/shots/
// 2) edge 값·접지 위치·회전 확인 3) loop 모드 t=0 vs t=D 픽셀 동일 4) 콘솔 에러 0
process.env.PLAYWRIGHT_BROWSERS_PATH = '0';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import('playwright');
const { startServer } = await import('../scripts/serve.mjs');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'tests', 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

let failed = 0;
const check = (name, ok, extra) => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : '')); if (!ok) failed++; };

const { server, url } = await startServer({ port: 0, root: ROOT });
const browser = await chromium.launch({ args: ['--in-process-gpu'] });
const errors = [];
async function open(query, vp, dpr) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: dpr });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(url + '/index.html' + query);
  await page.evaluate(() => window.__ew.ready);
  return page;
}

// ---- 1,2: 네 변·모서리 (390x844, 라이브 모드, 슬라임 1마리) ----
{
  const page = await open('?chars=slime&seed=3&hideUI=1', { width: 390, height: 844 }, 2);
  const info = await page.evaluate(() => window.__ew.engine._info());
  check('개체 1마리 생성', info.n === 1);
  const spots = [
    ['bottom', info.edgeMidS[0], 'edge-bottom'], ['right', info.edgeMidS[1], 'edge-right'],
    ['top', info.edgeMidS[2], 'edge-top'], ['left', info.edgeMidS[3], 'edge-left'],
    ['corner-br', info.cornerS[0], 'corner-bottom-right'], ['corner-tr', info.cornerS[1], 'corner-top-right'],
    ['corner-tl', info.cornerS[2], 'corner-top-left'], ['corner-bl', info.cornerS[3], 'corner-bottom-left'],
  ];
  for (const [want, s, file] of spots) {
    await page.evaluate((s) => { const e = window.__ew.engine; e.stop(); e._place(0, s, 1); e.step(0.001); e.render(); }, s);
    const st = await page.evaluate(() => window.__ew.engine.getState().walkers[0]);
    if (!want.startsWith('corner')) check('변 ' + want, st.edge === want, 'edge=' + st.edge);
    await page.locator('#ew-canvas').screenshot({ path: path.join(SHOTS, file + '.png') });
  }
  // 연속 이동 중 네 변을 모두 거친다 + 가운데 영역은 비어 있다
  const seen = new Set();
  let centerHit = false;
  await page.evaluate(() => { const e = window.__ew.engine; e.stop(); e._place(0, 0, 1); });
  for (let i = 0; i < 1600; i++) {
    const r = await page.evaluate(() => { const e = window.__ew.engine; e.step(1 / 30); const w = e.getState().walkers[0]; return w.edge; });
    seen.add(r);
    if (i % 100 === 0) {
      await page.evaluate(() => window.__ew.engine.render());
      const px = await page.evaluate(() => {
        const e = window.__ew.engine, c = document.getElementById('ew-canvas'), g = c.getContext('2d');
        const sample = () => g.getImageData(c.width * 0.3, c.height * 0.3, c.width * 0.4, c.height * 0.4).data;
        const withChars = sample();
        // 캐릭터를 잠시 빼고 같은 영역을 읽어 배경(그라디언트 포함)과 비교
        const defs = window.__ew.getBaseDefs();
        const st = e.getState().walkers[0];
        e.setCharacters([]); e.render();
        const bare = sample();
        e.setCharacters(defs.filter((d) => d.id === 'slime')); e._place(0, st.s, st.dir);
        for (let k = 0; k < withChars.length; k++) if (withChars[k] !== bare[k]) return true;
        return false;
      });
      if (px) { centerHit = true; await page.locator('#ew-canvas').screenshot({ path: path.join(SHOTS, 'center-debug.png') }); }
    }
  }
  check('연속 걷기 중 네 변 모두 방문', seen.size === 4, [...seen].join(','));
  check('가운데 영역 비어 있음', !centerHit);
  // 탭 → jump
  await page.evaluate(() => { const e = window.__ew.engine; e._place(0, e._info().edgeMidS[0], 1); e.step(0.01); });
  const pos = await page.evaluate(() => { const e = window.__ew.engine; e.render(); return { x: 195, y: e._info().rect.B - 20 }; });
  await page.evaluate((p) => { const e = window.__ew.engine; e.tap(p.x, p.y); e.step(0.01); }, pos);
  const act = await page.evaluate(() => window.__ew.engine.getState().walkers[0].action);
  check('탭 시 jump', act === 'jump', 'action=' + act);
  await page.close();
}

// ---- 3: loop 이음새 (record 모드, 393x852@3) ----
{
  const D = 12;
  const page = await open('?record=1&seed=7&loop=' + D + '&chars=slime,ghost&hideUI=1', { width: 393, height: 852 }, 3);
  const grab = async (t) => {
    await page.evaluate((t) => { const e = window.__ew.engine; e.seek(t); e.render(); }, t);
    return page.evaluate(() => document.getElementById('ew-canvas').toDataURL('image/png'));
  };
  const a = await grab(0), b = await grab(D);
  check('loop: t=0 과 t=D 프레임 동일', a === b);
  const st0 = await page.evaluate(() => { window.__ew.engine.seek(0); return JSON.stringify(window.__ew.engine.getState().walkers); });
  const stD = await page.evaluate((D) => { window.__ew.engine.seek(D); return JSON.stringify(window.__ew.engine.getState().walkers); }, D);
  check('loop: 상태(변·위치·행동·프레임) 동일', st0 === stD);
  // 연속성: 한 프레임 사이 이동량이 비정상적으로 크지 않다 (순간이동 없음)
  const jump = await page.evaluate((D) => {
    const e = window.__ew.engine, P = e._info().P; let worst = 0, prev = null;
    for (let i = 0; i <= D * 30; i++) {
      e.seek(i / 30);
      const s = e.getState().walkers.map((w) => w.s);
      if (prev) s.forEach((v, k) => { let d = Math.abs(v - prev[k]); d = Math.min(d, P - d); worst = Math.max(worst, d); });
      prev = s;
    }
    return worst;
  }, D);
  check('loop: 프레임 간 최대 이동 < 12px (순간이동 없음)', jump < 12, jump.toFixed(2) + 'px');
  // 결정론: 같은 시드 → 같은 상태
  const page2 = await open('?record=1&seed=7&loop=' + D + '&chars=slime,ghost&hideUI=1', { width: 393, height: 852 }, 3);
  const again = await page2.evaluate(() => { window.__ew.engine.seek(5.5); return JSON.stringify(window.__ew.engine.getState().walkers); });
  const mine = await page.evaluate(() => { window.__ew.engine.seek(5.5); return JSON.stringify(window.__ew.engine.getState().walkers); });
  check('시드 고정 재현', again === mine);
  await page.close(); await page2.close();
}

await browser.close();
server.close();
check('콘솔 에러 0', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(failed ? failed + ' 실패' : '모두 통과');
process.exit(failed ? 1 : 0);

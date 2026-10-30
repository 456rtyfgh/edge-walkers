// 공유 팩 받기 E2E — Playwright WebKit + 아이폰 뷰포트. 실행: node tests/pack.spec.mjs  (index.html 이 빌드돼 있어야 함)
// (a) 테스트 팩 업로드 → (b) 빈 컨텍스트에서 ?pack 열기 → (c) 중복 없음 → (d) 오프라인 재실행 → (e) 매니페스트 start_url
process.env.PLAYWRIGHT_BROWSERS_PATH ??= '0';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const { webkit, devices } = await import('playwright');
import { startServer } from '../scripts/serve.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shots = path.join(root, 'tests/shots-pack');
fs.mkdirSync(shots, { recursive: true });
const SB = 'https://vrszlmkrfsqctqxzcsjh.supabase.co';
const KEY = 'sb_publishable_fykX8dyjJEtzBkelZHyRYA_UsYBtOdm';
const BUCKET = 'edge-walkers-packs';

let failed = 0;
const check = (name, ok, extra = '') => { if (!ok) failed++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : '')); };

// ---- 팩 만들기/업로드 (Node) ----
const fx = path.join(root, 'tests/fixtures/shapes');
const dataUrl = (f) => 'data:image/png;base64,' + fs.readFileSync(path.join(fx, f)).toString('base64');
const rid = () => 'test' + crypto.randomBytes(8).toString('base64url').replace(/[^A-Za-z0-9]/g, 'x').slice(0, 10);
const makePack = (id, over = {}) => Object.assign({
  version: 1, packId: id, createdAt: new Date().toISOString(),
  characters: [{ id: 'u_zzz', name: '테스트 친구', scale: 1, speed: 70, fps: 4, count: 2,
    actions: { walk: [dataUrl('walk_1.png'), dataUrl('walk_2.png')], idle: [dataUrl('idle_1.png')] } }],
  bg: { type: 'color', color: '#336699', color2: '#224466', fit: 'cover', image: null },
}, over);
async function upload(pack) {
  const res = await fetch(`${SB}/storage/v1/object/${BUCKET}/packs/${pack.packId}.json`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(pack),
  });
  return { status: res.status, text: await res.text() };
}

const { server, url } = await startServer({ port: 0, root });
// Playwright 의 WebKit 은 임시(incognito) 컨텍스트에서 IndexedDB 에 Blob 저장이 막혀 있어서(실제 Safari 는 정상),
// 매번 비어 있는 새 프로필 폴더로 persistent context 를 띄워 "저장소가 빈 새 컨텍스트"를 만든다.
const iphone = devices['iPhone 14'];
const profRoot = path.join(root, 'tests/.profiles');
fs.rmSync(profRoot, { recursive: true, force: true });
fs.mkdirSync(profRoot, { recursive: true });
const opened = [];
let profN = 0;
const newCtx = async (extra = {}) => {
  const c = await webkit.launchPersistentContext(path.join(profRoot, 'p' + profN++), { ...iphone, serviceWorkers: 'allow', ...extra });
  opened.push(c);
  return c;
};
const hook = (page, errs, ignore = []) => {
  page.on('console', (m) => { if (m.type() === 'error' && !ignore.some((r) => r.test(m.text()))) errs.push(m.text()); });
  page.on('pageerror', (e) => { if (!ignore.some((r) => r.test(e.message))) errs.push('pageerror: ' + e.message); });
};
const toastText = (page) => page.evaluate(() => (document.getElementById('ew-toast2') || {}).textContent || '');
const stateOf = (page) => page.evaluate(async () => {
  const st = await EW.store.getSettings();
  const users = await EW.store.listUserChars();
  return {
    users: users.map((u) => u.name), imported: st.importedPacks || [], bg: st.bg,
    walkers: [...new Set(__ew.engine.getState().walkers.map((w) => w.id))],
    userDefs: __ew.getBaseDefs().filter((d) => d.source === 'user').length,
  };
});

try {
  // (a) 업로드 + 공개 GET 으로 동일 내용
  const id = rid();
  const pack = makePack(id);
  const up = await upload(pack);
  check('(a) 테스트 팩 업로드', up.status === 200, up.status + ' ' + up.text.slice(0, 120));
  const got = await (await fetch(`${SB}/storage/v1/object/public/${BUCKET}/packs/${id}.json`)).json();
  check('(a) 공개 GET 내용 동일', got.packId === id && got.characters.length === 1 && got.bg.color === '#336699');

  const link = `${url}/index.html?pack=${id}`;

  // (b) 저장소가 빈 새 컨텍스트에서 링크 열기
  const ctx1 = await newCtx();
  const p1 = await ctx1.newPage();
  const errs1 = [];
  hook(p1, errs1);
  await p1.goto(link);
  await p1.evaluate(() => window.__ew.packReady);
  await p1.waitForTimeout(500);
  const s1 = await stateOf(p1);
  check('(b) 캐릭터 1개 가져옴', s1.users.length === 1 && s1.users[0] === '테스트 친구', JSON.stringify(s1.users));
  check('(b) 엔진에 표시(count 2)', s1.userDefs === 1 && s1.walkers.some((w) => w.startsWith('u_')), JSON.stringify(s1.walkers));
  check('(b) 배경 적용', s1.bg.type === 'color' && s1.bg.color === '#336699', JSON.stringify(s1.bg));
  check('(b) 토스트 "캐릭터 1개 받았어요"', (await toastText(p1)).includes('캐릭터 1개 받았어요'), await toastText(p1));
  check('(b) 주소의 ?pack 유지', new URL(p1.url()).searchParams.get('pack') === id);
  await p1.screenshot({ path: path.join(shots, 'b-received.png') });

  // (c) 다시 열어도 중복 없음
  await p1.reload();
  await p1.evaluate(() => window.__ew.packReady);
  await p1.waitForTimeout(400);
  const p1b = await ctx1.newPage();
  await p1b.goto(link);
  await p1b.evaluate(() => window.__ew.packReady);
  const s2 = await stateOf(p1b);
  check('(c) 재방문 중복 없음', s2.users.length === 1 && s2.imported.length === 1 && s2.imported[0] === id, JSON.stringify(s2.imported));
  check('(c) 재방문 시 토스트 없음', !(await toastText(p1b)).includes('받았어요'));
  // 직접 두 번 가져오기 호출해도 한 번만
  const dup = await p1b.evaluate(async (i) => { const o = await EW.packs.fetchPack(i); const r = await EW.packs.importPack(o); return r.status; }, id);
  check('(c) importPack 재호출은 duplicate', dup === 'duplicate', dup);

  // (e) 매니페스트 start_url, 메타
  const man = await p1.evaluate(async () => {
    const href = document.querySelector('link[rel="manifest"]').href;
    const m = await (await fetch(href)).json();
    const meta = (n) => (document.querySelector(`meta[name="${n}"]`) || {}).content;
    const ti = document.querySelector('link[rel="apple-touch-icon"]');
    const im = new Image(); im.src = ti.href; await im.decode();
    return { href: href.slice(0, 5), m, cap: meta('apple-mobile-web-app-capable'), bar: meta('apple-mobile-web-app-status-bar-style'), icon: [im.naturalWidth, im.naturalHeight] };
  });
  check('(e) 동적 매니페스트 start_url 에 ?pack 유지', man.m.start_url.endsWith('/?pack=' + id), man.m.start_url);
  check('(e) display standalone, scope, 아이콘', man.m.display === 'standalone' && man.m.icons.length >= 2 && !!man.m.scope);
  check('(e) apple-mobile-web-app-capable / black-translucent', man.cap === 'yes' && man.bar === 'black-translucent');
  check('(e) apple-touch-icon 180x180', man.icon[0] === 180 && man.icon[1] === 180, man.icon.join('x'));
  const swMan = await p1.evaluate(async (i) => {
    await navigator.serviceWorker.ready;
    const r = await fetch('manifest.webmanifest?pack=' + i, { cache: 'no-store' });
    return (await r.json()).start_url;
  }, id);
  check('(e) SW 생성 매니페스트도 start_url 에 ?pack 유지', swMan.endsWith('/?pack=' + id), swMan);
  const staticMan = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
  check('(e) 정적 매니페스트 standalone + start_url', staticMan.display === 'standalone' && staticMan.start_url === './');

  // (d) 오프라인 재실행 (서비스 워커가 페이지를 제어하도록 한 번 더 로드한 뒤)
  await p1.reload();
  await p1.evaluate(() => window.__ew.packReady);
  await p1.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 8000 }).catch(() => {});
  check('(d) 서비스 워커 제어 중', await p1.evaluate(() => !!navigator.serviceWorker.controller));
  await ctx1.setOffline(true);
  const p1c = await ctx1.newPage();
  const errs1c = [];
  hook(p1c, errs1c, [/Failed to load resource.*(offline|connection)/i]);
  await p1c.goto(link);
  await p1c.evaluate(() => window.__ew.packReady);
  await p1c.waitForTimeout(600);
  const s3 = await stateOf(p1c);
  check('(d) 오프라인 재실행: 받은 캐릭터 유지·표시', s3.users.length === 1 && s3.walkers.some((w) => w.startsWith('u_')), JSON.stringify(s3.walkers));
  check('(d) 오프라인 재실행: 오류 토스트 없음', !(await toastText(p1c)).includes('인터넷'));
  await p1c.screenshot({ path: path.join(shots, 'd-offline.png') });
  // 오프라인 + 새 컨텍스트가 아닌 상태에서 다른 팩 링크 → 친절한 안내
  const p1d = await ctx1.newPage();
  await p1d.goto(`${url}/index.html?pack=testOffline12345`);
  await p1d.evaluate(() => window.__ew.packReady);
  check('(d) 오프라인에서 새 팩 → 한국어 안내', (await toastText(p1d)).includes('인터넷'), await toastText(p1d));
  await ctx1.setOffline(false);
  check('(b)(c)(d) 콘솔 에러 0', errs1.length === 0 && errs1c.length === 0, errs1.concat(errs1c).join(' | '));
  await ctx1.close();

  // 없는 팩 → 친절한 안내 (리소스 404 로그는 예상됨)
  const ctx2 = await newCtx({ serviceWorkers: 'block' });
  const p2 = await ctx2.newPage();
  const errs2 = [];
  hook(p2, errs2, [/Failed to load resource/i]);
  await p2.goto(`${url}/index.html?pack=testNoSuchPack99`);
  await p2.evaluate(() => window.__ew.packReady);
  check('없는 팩 → "찾을 수 없어요" 안내', (await toastText(p2)).includes('찾을 수 없'), await toastText(p2));
  check('없는 팩: 앱은 정상 동작(데모 캐릭터)', (await stateOf(p2)).walkers.length > 0 && errs2.length === 0, errs2.join('|'));
  const badLink = await p2.evaluate(() => EW.packs.parseId('https://x.github.io/edge-walkers/?pack=abcdEFGH_-12') + '|' + EW.packs.parseId('zz') + '|' + EW.packs.parseId('abcdEFGH_-12'));
  check('링크/ID 파싱', badLink === 'abcdEFGH_-12|null|abcdEFGH_-12', badLink);

  // 악성/손상 팩 거부 (validatePack 직접)
  const tiny = dataUrl('walk_1.png');
  const reject = async (label, mut, expectedId) => {
    const p = makePack('testbad' + crypto.randomBytes(4).toString('hex'));
    mut(p);
    const r = await p2.evaluate(([o, e]) => EW.packs.validatePack(o, e).then((x) => ({ ok: x.ok, errors: x.errors })), [p, expectedId === undefined ? p.packId : expectedId]);
    check('거부: ' + label, r.ok === false && r.errors.length > 0, r.errors.join(' / '));
  };
  await reject('SVG data URL', (p) => { p.characters[0].actions.walk[0] = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64'); });
  await reject('JPEG data URL', (p) => { p.characters[0].actions.walk[0] = 'data:image/jpeg;base64,/9j/4AAQ'; });
  await reject('PNG 로 선언했지만 내용이 다름', (p) => { p.characters[0].actions.walk[0] = 'data:image/png;base64,' + Buffer.from('not an image at all').toString('base64'); });
  await reject('http 이미지 URL', (p) => { p.characters[0].actions.idle[0] = 'https://example.com/a.png'; });
  await reject('packId 불일치', () => {}, 'testotherid12345');
  await reject('잘못된 packId', (p) => { p.packId = '../etc'; }, null);
  await reject('version 2', (p) => { p.version = 2; });
  await reject('캐릭터 21개', (p) => { p.characters = Array.from({ length: 21 }, () => p.characters[0]); });
  await reject('프레임 9장', (p) => { p.characters[0].actions.walk = Array.from({ length: 9 }, () => tiny); });
  await reject('walk 1장', (p) => { p.characters[0].actions.walk = [tiny]; });
  await reject('idle 없음', (p) => { delete p.characters[0].actions.idle; });
  {
    const png = (w) => p2.evaluate((w) => { const c = document.createElement('canvas'); c.width = c.height = w; c.getContext('2d').fillRect(0, 0, w, w); return c.toDataURL('image/png'); }, w);
    const a = await png(24), b = await png(32);
    await reject('프레임 크기 불일치', (p) => { p.characters[0].actions.walk = [a, b]; });
  }
  await reject('배경 이미지가 SVG', (p) => { p.bg = { type: 'image', color: '#000000', image: 'data:image/svg+xml;base64,PHN2Zy8+' }; });
  const big = 'data:image/png;base64,' + Buffer.alloc(2 * 1024 * 1024, 65).toString('base64');
  await reject('프레임 1.5MB 초과', (p) => { p.characters[0].actions.walk[0] = big; });

  // 이름의 HTML 은 텍스트로만 — 설정 패널을 열어도 실행·주입 없음
  const xssPack = makePack('testxss' + crypto.randomBytes(4).toString('hex'));
  xssPack.characters[0].name = '<img src=x onerror="window.__xss=1"><b>굵게</b>';
  const imp = await p2.evaluate(async (o) => { window.__xss = 0; const r = await EW.packs.importPack(o); await __ew.reload(); EW.ui.open(); return r.status; }, xssPack);
  await p2.waitForTimeout(600);
  const dom = await p2.evaluate(() => ({ xss: window.__xss, imgs: document.querySelectorAll('img[onerror]').length, bold: document.querySelectorAll('.ew-panel b').length }));
  check('HTML 이름 → 가져오기는 되지만 주입 없음', imp === 'added' && dom.xss === 0 && dom.imgs === 0 && dom.bold === 0, JSON.stringify(dom));
  await p2.screenshot({ path: path.join(shots, 'xss-panel.png') });
  await ctx2.close();

  // 콘솔·file:// 점검: file:// 에서도 에러 0 (SW 등록 안 함)
  const ctx3 = await newCtx({ serviceWorkers: 'block' });
  const p3 = await ctx3.newPage();
  const errs3 = [];
  hook(p3, errs3, [/Failed to load resource|manifest|icon|access control|Cross origin|Origin null/i]); // file:// 에선 WebKit 자체가 fetch/manifest 접근을 막고 로그를 냄(폴더 방식은 http 필요 — README)
  await p3.goto('file://' + path.join(root, 'index.html'));
  await p3.evaluate(() => window.__ew.packReady);
  check('file:// 열기: 에러 0', errs3.length === 0, errs3.join(' | '));
  await ctx3.close();
} catch (e) {
  failed++;
  console.log('FAIL 예외: ' + (e && e.stack || e));
} finally {
  for (const c of opened) await c.close().catch(() => {});
  fs.rmSync(profRoot, { recursive: true, force: true });
  server.close();
}
console.log(failed ? `\n${failed}개 실패` : '\n모두 통과');
process.exit(failed ? 1 : 0);

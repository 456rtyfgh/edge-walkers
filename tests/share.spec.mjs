// 공유 링크 만들기 UI 흐름 검증. 실행: node tests/share.spec.mjs  (인터넷 필요 — test 로 시작하는 팩 1개를 업로드한다)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './launch.mjs';
import { startServer } from '../scripts/serve.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fx = path.join(root, 'tests/fixtures/shapes');
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : '')); };

const { server, url } = await startServer({ port: 0, root });
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

const b64 = (f) => fs.readFileSync(path.join(fx, f)).toString('base64');
try {
  await page.goto(url + '/' + (process.argv[2] || 'index.html'));
  await page.evaluate(() => window.__ew.ready);

  // 사용자 캐릭터가 없을 때: 안내 + 버튼 비활성
  await page.locator('.ew-gear').click();
  await page.getByRole('button', { name: '공유 링크 만들기' }).click();
  check('캐릭터 0개: 한국어 안내', await page.getByText('공유할 내 캐릭터가 없어요').isVisible());
  check('캐릭터 0개: 링크 만들기 버튼 비활성', await page.getByRole('button', { name: '링크 만들기' }).isDisabled());

  // 사용자 캐릭터 심기 (픽스처 PNG) + 사용자 배경색
  await page.evaluate(async ({ w1, w2, i1 }) => {
    const blob = (b) => new Blob([Uint8Array.from(atob(b), (c) => c.charCodeAt(0))], { type: 'image/png' });
    await window.EW.store.saveUserChar({ id: 'u_shape01', name: '도형 친구', scale: 1, speed: 60, fps: 8, count: 1, actions: { walk: [blob(w1), blob(w2)], idle: [blob(i1)] } });
    await window.EW.store.setSettings({ bg: { type: 'color', color: '#335577' } });
    await window.__ew.reload?.();
  }, { w1: b64('walk_1.png'), w2: b64('walk_2.png'), i1: b64('idle_1.png') });
  await page.reload(); await page.evaluate(() => window.__ew.ready);
  await page.evaluate(() => { window.EW.share.idPrefix = 'test'; });

  await page.locator('.ew-gear').click();
  const shareBtn = page.getByRole('button', { name: '공유 링크 만들기' });
  check('공유 버튼 활성', await shareBtn.isEnabled());
  await shareBtn.click();
  check('시트: 캐릭터 체크리스트(기본 체크) + 배경 포함 체크', (await page.locator('.ew-share-list input:checked, .ew-check input:checked').count()) >= 2);

  // 진행 메시지 수집
  await page.evaluate(() => {
    window.__msgs = [];
    new MutationObserver(() => { const t = document.querySelector('.ew-progress')?.textContent; if (t && window.__msgs.at(-1) !== t) window.__msgs.push(t); })
      .observe(document.querySelector('.ew-panel'), { subtree: true, childList: true, characterData: true });
  });
  await page.getByRole('button', { name: '링크 만들기' }).click();
  const linkInput = page.locator('input.ew-share-link');
  await page.locator('input.ew-share-link, .ew-err').first().waitFor({ timeout: 40000 });
  if (await page.locator('.ew-err').count()) throw new Error('링크 만들기 실패: ' + (await page.locator('.ew-err').innerText()));
  await linkInput.waitFor({ timeout: 5000 });
  const link = await linkInput.inputValue();
  const m = /^https:\/\/456rtyfgh\.github\.io\/edge-walkers\/\?pack=(test[A-Za-z0-9_-]{12})$/.exec(link);
  check('링크 형식 (SHARE_BASE?pack=test+12자)', !!m, link);
  const msgs = await page.evaluate(() => window.__msgs);
  check('진행 메시지 순서 (팩 만드는 중… → 올리는 중… → 완료!)', msgs.join('|').includes('올리는 중…') && msgs.at(-1) === '완료!', msgs.join(' > '));
  check('결과: 공유하기·링크 복사 버튼', (await page.getByRole('button', { name: '공유하기' }).count()) === 1 && (await page.getByRole('button', { name: '링크 복사' }).count()) === 1);

  // 공개 GET 으로 내려받아 검증
  const id = m && m[1];
  const res = await fetch(`https://vrszlmkrfsqctqxzcsjh.supabase.co/storage/v1/object/public/edge-walkers-packs/packs/${id}.json`);
  check('공개 GET 200', res.status === 200, String(res.status));
  const pack = await res.json();
  check('팩: version 1, packId 일치, 캐릭터 1개, walk2+idle1', pack.version === 1 && pack.packId === id && pack.characters.length === 1
    && pack.characters[0].actions.walk.length === 2 && pack.characters[0].actions.idle.length === 1);
  check('팩: 이미지 모두 data:image/png|webp', Object.values(pack.characters[0].actions).flat().every((u) => /^data:image\/(png|webp);base64,/.test(u)));
  check('팩: 배경 포함(color #335577)', pack.bg && pack.bg.type === 'color' && pack.bg.color === '#335577' && pack.bg.image === null);
  const v = await page.evaluate(async (p) => (window.EW.packs ? await window.EW.packs.validatePack(p, p.packId) : { ok: true, skipped: true }), pack);
  check('EW.packs.validatePack 통과' + (v.skipped ? ' (pack.js 없어 건너뜀)' : ''), v.ok, (v.errors || []).join(','));

  // 배경 빼기 → 팩의 bg 는 null
  await page.getByRole('button', { name: '‹ 뒤로' }).click();
  await page.getByRole('button', { name: '공유 링크 만들기' }).click();
  await page.locator('#ew-share-bg').uncheck();
  const built = await page.evaluate(async () => (await window.EW.share.buildPack(null, document.querySelector('#ew-share-bg')?.checked ?? false, { idPrefix: 'test' })).pack.bg);
  check('배경 제외 시 bg=null', built === null);

  // 8MB 초과는 업로드 전 거부 (네트워크 호출 없음)
  const big = await page.evaluate(async () => {
    let called = 0; const f = window.fetch; window.fetch = (...a) => { called++; return f(...a); };
    try { await window.EW.share.uploadPack({ packId: 'testAAAAAAAAAAAA', characters: ['x'.repeat(8.5 * 1024 * 1024)] }); return { ok: true, called }; }
    catch (e) { return { ok: false, msg: e.message, code: e.code, called }; } finally { window.fetch = f; }
  });
  check('8MB 초과: 업로드 전 한국어 오류, fetch 0회', !big.ok && big.code === 'too-large' && /용량이 너무 커요/.test(big.msg) && big.called === 0, big.msg);

  // 오프라인: 한국어 오류
  await ctx.setOffline(true);
  await page.getByRole('button', { name: '링크 만들기' }).click();
  await page.locator('.ew-err').waitFor({ timeout: 15000 });
  const offMsg = await page.locator('.ew-err').innerText();
  check('오프라인: 한국어 오류 메시지', /인터넷|연결/.test(offMsg), offMsg);
  await ctx.setOffline(false);

  check('콘솔 에러 0', errors.length === 0, errors.join(' | '));
} catch (e) {
  check('예외 없이 완료', false, e.stack || e.message);
} finally {
  await browser.close();
  server.close();
}
const fails = results.filter((r) => !r).length;
console.log(fails ? `\n${fails}개 실패` : `\n전부 통과 (${results.length})`);
process.exit(fails ? 1 : 0);

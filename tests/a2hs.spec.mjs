// iOS "홈 화면에 추가" 안내 오버레이 검증 (WebKit + 아이폰). 실행: node tests/a2hs.spec.mjs
process.env.PLAYWRIGHT_BROWSERS_PATH ??= '0';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../scripts/serve.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { webkit, devices } = await import('playwright'); // import 호이스팅 때문에 환경변수 설정 뒤에 동적 로드
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : '')); };

const { server, url } = await startServer({ port: 0, root });
const browser = await webkit.launch();
const errors = [];
const newPage = async (ctxOpts = {}) => {
  const ctx = await browser.newContext({ ...devices['iPhone 14'], ...ctxOpts });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  return { ctx, page };
};
const overlay = (page) => page.locator('.ew-a2hs');
const open = async (page, q = '') => { await page.goto(url + '/' + (process.argv[2] || 'index.html') + q); await page.evaluate(() => window.__ew.ready); };

try {
  // 1) 첫 방문 → 지연 후 오버레이
  let { ctx, page } = await newPage();
  await open(page);
  check('첫 방문 직후엔 토스트와 겹치지 않게 아직 안 뜸', (await overlay(page).count()) === 0);
  await overlay(page).waitFor({ timeout: 8000 });
  const txt = await overlay(page).innerText();
  check('오버레이: 한국어 안내(공유 → 홈 화면에 추가)', /홈 화면에 추가/.test(txt) && /공유/.test(txt), txt.replace(/\s+/g, ' ').slice(0, 80));

  // 2) 닫기 → 같은 세션 새로고침에도 안 뜸, 다시 안 보기 아님
  await page.getByRole('button', { name: '안내 닫기' }).click();
  check('닫기로 사라짐', (await overlay(page).count()) === 0);
  await page.reload(); await page.evaluate(() => window.__ew.ready); await page.waitForTimeout(4500);
  check('닫은 뒤 같은 세션 재방문엔 안 뜸', (await overlay(page).count()) === 0);
  check('닫기만으로는 영구 차단 아님', (await page.evaluate(() => localStorage.getItem('ew.a2hs.dismissed'))) === null);
  await ctx.close();

  // 3) 다시 안 보기 → 새 세션(같은 localStorage 는 새 컨텍스트라 직접 심어 검증)
  ({ ctx, page } = await newPage());
  await open(page);
  await overlay(page).waitFor({ timeout: 8000 });
  await page.getByRole('button', { name: '다시 안 보기' }).click();
  check('다시 안 보기 → localStorage 기록', (await page.evaluate(() => localStorage.getItem('ew.a2hs.dismissed'))) === '1');
  await page.evaluate(() => sessionStorage.clear());
  await page.reload(); await page.evaluate(() => window.__ew.ready); await page.waitForTimeout(4500);
  check('다시 안 보기 후 재방문 미노출', (await overlay(page).count()) === 0);
  await ctx.close();

  // 4) standalone 모의 → 미노출
  ({ ctx, page } = await newPage());
  await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
  await open(page);
  check('shouldShow() false (standalone)', (await page.evaluate(() => window.EW.a2hs.shouldShow())) === false);
  await page.waitForTimeout(4500);
  check('standalone 에선 미노출', (await overlay(page).count()) === 0);
  await ctx.close();

  // 5) record / hideUI 에선 미노출
  ({ ctx, page } = await newPage());
  await open(page, '?hideUI=1');
  check('hideUI=1 → shouldShow() false', (await page.evaluate(() => window.EW.a2hs.shouldShow())) === false);
  await ctx.close();

  // 6) 인앱 브라우저(카카오톡) → "Safari 로 열어 주세요" 변형
  ({ ctx, page } = await newPage({ userAgent: devices['iPhone 14'].userAgent.replace('Safari/', 'KAKAOTALK 10.0 ') }));
  await open(page);
  await overlay(page).waitFor({ timeout: 8000 });
  check('인앱 브라우저: Safari 로 열기 안내', /Safari 로 열어 주세요/.test(await overlay(page).innerText()));
  await ctx.close();

  // 7) 데스크톱 UA → 미노출
  ({ ctx, page } = await newPage({ ...devices['Desktop Safari'] }));
  await open(page);
  check('iOS 가 아니면 shouldShow() false', (await page.evaluate(() => window.EW.a2hs.shouldShow())) === false);
  await ctx.close();

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

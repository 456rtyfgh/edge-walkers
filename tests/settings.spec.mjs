// 설정 패널·폴더 방식·저장·내보내기/가져오기 검증. 실행: node tests/settings.spec.mjs  (index.html 이 빌드돼 있어야 함)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './launch.mjs';
import { startServer } from '../scripts/serve.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shots = path.join(root, 'tests/shots-settings');
const fx = path.join(root, 'tests/fixtures/shapes');
fs.mkdirSync(shots, { recursive: true });

const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : '')); };

const { server, url } = await startServer({ port: 0, root });
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: false, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text() + ' @' + m.location().url); });
page.on('response', (r) => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
const external = [];
page.on('request', (r) => { if (!r.url().startsWith(url) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) external.push(r.url()); });

const APP = url + '/index.html?spritesBase=tests/fixtures/';
const boot = async () => { await page.goto(APP); await page.evaluate(() => window.__ew.ready); await page.waitForTimeout(300); };
const ids = () => page.evaluate(() => window.__ew.getBaseDefs().map((d) => d.id + ':' + d.source));
const shot = (n) => page.screenshot({ path: path.join(shots, n + '.png') });
const longPress = async (x, y) => { await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(800); await page.mouse.up(); };

try {
  // 1) 폴더 방식
  await boot();
  let list = await ids();
  check('폴더 방식: tests/fixtures/shapes 로드', list.includes('shapes:folder'), list.join(','));
  check('내장 데모 2종 존재', list.includes('slime:builtin') && list.includes('ghost:builtin'));
  const st = await page.evaluate(() => window.__ew.engine.getState().walkers.map((w) => w.id));
  check('폴더 캐릭터 마릿수(count 2) 엔진에 반영', st.filter((i) => i === 'shapes').length === 2, st.join(','));
  await shot('01-folder');

  // 2) 탭 / 길게 누르기 충돌 없음
  await page.evaluate(() => { window.__taps = 0; document.getElementById('ew-ui-root').addEventListener('ew:tap', () => window.__taps++); });
  await page.mouse.click(200, 400);
  await page.waitForTimeout(150);
  check('짧은 탭 → ew:tap, 패널 안 열림', (await page.evaluate(() => window.__taps)) === 1 && (await page.locator('.ew-panel').isHidden()));
  await longPress(200, 400);
  check('길게 누르기 → 패널 열림', await page.locator('.ew-panel').isVisible());
  check('길게 누르기는 ew:tap 을 내지 않음', (await page.evaluate(() => window.__taps)) === 1);
  await shot('02-panel');

  // 3) 패널 방식: 파일 선택으로 캐릭터 추가
  await page.getByText('+ 캐릭터 추가').click();
  await page.locator('input.ew-text').fill('패널 도형');
  await page.locator('input[data-action=walk]').setInputFiles([path.join(fx, 'walk_1.png'), path.join(fx, 'walk_2.png')]);
  await page.locator('input[data-action=idle]').setInputFiles([path.join(fx, 'idle_1.png')]);
  await page.waitForFunction(() => !document.querySelector('.ew-panel .ew-btn.primary:disabled'));
  check('규격 검증 통과 메시지', await page.locator('.ew-ok').count() > 0 || await page.locator('.ew-warn').count() > 0);
  await shot('03-editor');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await page.waitForTimeout(500);
  list = await ids();
  const userId = list.find((s) => s.endsWith(':user'));
  check('패널 방식: 사용자 캐릭터 로드', !!userId, list.join(','));
  const st2 = await page.evaluate(() => window.__ew.engine.getState().walkers.map((w) => w.id));
  check('사용자 캐릭터가 엔진에 등장', !!userId && st2.includes(userId.split(':')[0]));
  await shot('04-saved');

  // 4) 잘못된 규격(walk 1장)은 저장 불가
  await page.getByText('+ 캐릭터 추가').click();
  await page.locator('input[data-action=walk]').setInputFiles([path.join(fx, 'walk_1.png')]);
  await page.locator('input[data-action=idle]').setInputFiles([path.join(fx, 'idle_1.png')]);
  await page.waitForTimeout(400);
  check('walk 1장이면 저장 버튼 비활성', await page.getByRole('button', { name: '저장', exact: true }).isDisabled());
  await page.getByText('‹ 뒤로').click();

  // 5) 새로고침 후 유지
  await boot();
  list = await ids();
  check('새로고침 후 사용자 캐릭터 유지(IndexedDB)', list.some((s) => s.endsWith(':user')));

  // 6) 내보내기 → 삭제 → 가져오기
  await longPress(200, 400);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByText('내보내기 (JSON)').click()]);
  const exp = path.join(shots, 'export.json');
  await dl.saveAs(exp);
  const json = JSON.parse(fs.readFileSync(exp, 'utf8'));
  check('내보내기 JSON 형식', json.version === 1 && json.characters.length === 1 && json.characters[0].actions.walk[0].startsWith('data:image/png'));
  await page.locator('.ew-row', { hasText: '패널 도형' }).getByText('설정').click();
  await page.getByText('삭제', { exact: true }).click();
  await page.getByText('정말 삭제?').click();
  await page.waitForTimeout(500);
  check('삭제 후 사용자 캐릭터 없음', !(await ids()).some((s) => s.endsWith(':user')));
  await page.locator('input[type=file][accept*="json"]').setInputFiles(exp);
  await page.waitForTimeout(700);
  check('가져오기로 복원', (await ids()).some((s) => s.endsWith(':user')));
  await shot('05-imported');

  // 7) 배경 변경
  await page.locator('select[aria-label="배경 종류"]').selectOption('gradient');
  await page.waitForTimeout(300);
  const bg = await page.evaluate(async () => (await EW.store.getSettings()).bg.type);
  check('배경 종류 저장', bg === 'gradient');

  const real = errors.filter((e) => !e.includes('/favicon.ico'));
  check('콘솔 에러 0 (favicon 404 제외 — shell.html 에 <link rel=icon href="data:,"> 필요, Dev-B 몫)', real.length === 0, real.join(' | '));
  check('외부 네트워크 요청 0', external.length === 0, external.join(' | '));
} catch (e) {
  console.error(e);
  check('예외 없이 완료', false, e.message);
  try { await shot('zz-failure'); } catch {}
} finally {
  await browser.close();
  server.close();
}
const failed = results.filter((x) => !x).length;
console.log(failed ? failed + '개 실패' : '전부 통과 (' + results.length + ')');
process.exit(failed ? 1 : 0);

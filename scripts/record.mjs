// 데모 영상 녹화: node scripts/record.mjs [--seed 7] [--dur 12] [--fps 30] [--chars slime,ghost] [--out out/demo.mp4] [--ext] [--keep]
// 헤드리스 Chromium 으로 ?record=1 페이지를 열고 engine.seek(t) → 캔버스 스크린샷(1179x2556) → ffmpeg.
// 루프: 프레임 0..N-1 (t=i/fps) 만 저장한다. 프레임 N(=t=D)은 프레임 0 과 같으므로 넣지 않아 이음새가 없다.
process.env.PLAYWRIGHT_BROWSERS_PATH = '0';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

const { chromium } = await import('playwright'); // env 설정 뒤에 로드해야 프로젝트 안 브라우저를 찾는다
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith('--')) continue;
  const next = argv[i + 1];
  args[argv[i].slice(2)] = next && !next.startsWith('--') ? next : '1';
}
const seed = Number(args.seed || 7), dur = Number(args.dur || 12), fps = Number(args.fps || 30);
const chars = args.chars || 'slime,ghost';
const out = path.resolve(ROOT, args.out || 'out/demo.mp4');
const N = Math.round(dur * fps);
const frames = path.join(ROOT, 'out', 'frames');

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.rmSync(frames, { recursive: true, force: true });
fs.mkdirSync(frames, { recursive: true });

const { server, url } = await startServer({ port: 0, root: ROOT });
const browser = await chromium.launch({ args: ['--in-process-gpu'] });
const page = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url + '/index.html?record=1&seed=' + seed + '&loop=' + dur + '&chars=' + chars + '&hideUI=1');
await page.evaluate(() => window.__ew.ready);
const n = await page.evaluate(() => window.__ew.engine.getState().walkers.length);
if (!n) throw new Error('캐릭터가 로드되지 않았습니다');
console.log(n + ' walkers, ' + N + ' frames');
for (let i = 0; i < N; i++) {
  await page.evaluate((t) => { const e = window.__ew.engine; e.seek(t); e.render(); }, i / fps);
  await page.locator('#ew-canvas').screenshot({ path: path.join(frames, String(i).padStart(5, '0') + '.png') });
  if (i % 60 === 0) console.log('frame', i);
}
await browser.close();
server.close();
if (errors.length) { console.error('콘솔 에러:', errors); process.exit(1); }

// 1179 는 홀수라 yuv420p 불가. 기본은 정확히 1179x2556 (yuv444p). --ext 면 1180 으로 패딩해 yuv420p (재생 호환성 우선).
const fmt = args.ext ? ['-vf', 'pad=1180:2556:0:0:color=black', '-pix_fmt', 'yuv420p'] : ['-pix_fmt', 'yuv444p'];
const r = spawnSync('ffmpeg', ['-y', '-framerate', String(fps), '-i', path.join(frames, '%05d.png'),
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', ...fmt, '-movflags', '+faststart', '-r', String(fps), out], { stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status || 1);
if (!args.keep) fs.rmSync(frames, { recursive: true, force: true });
console.log('wrote', out);

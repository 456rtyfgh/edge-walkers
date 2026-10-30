// 오리지널 데모 슬라임(EW.demo, 코드로 그린 것)으로 앱 아이콘을 만든다. 실행: node scripts/make-icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from '../tests/launch.mjs';
import { startServer } from './serve.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'icons');
fs.mkdirSync(out, { recursive: true });
const { server, url } = await startServer({ port: 0, root });
const browser = await launch();
const page = await browser.newPage();
await page.goto(url + '/index.html?hideUI=1');
await page.evaluate(() => window.__ew.ready);
// [파일, 한 변 px, 캐릭터가 차지하는 비율]  maskable 은 안전영역(가운데 80%) 안에 넣는다
const jobs = [['apple-touch-icon.png', 180, 0.78], ['icon-192.png', 192, 0.78], ['icon-512.png', 512, 0.78], ['icon-maskable-512.png', 512, 0.58]];
for (const [name, size, frac] of jobs) {
  const b64 = await page.evaluate(async ([size, frac]) => {
    const demo = await EW.demo.getDemoChars();
    const slime = demo.find((d) => d.id === 'slime');
    const img = slime.frames.idle[0];
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, size, size);
    bg.addColorStop(0, '#2c3350'); bg.addColorStop(1, '#1b1f2a');
    g.fillStyle = bg; g.fillRect(0, 0, size, size); // iOS 가 모서리를 마스크하므로 꽉 채운 불투명 배경
    const s = size * frac;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, (size - s) / 2, (size - s) / 2 - size * 0.1, s, s);
    return c.toDataURL('image/png').split(',')[1];
  }, [size, frac]);
  fs.writeFileSync(path.join(out, name), Buffer.from(b64, 'base64'));
  console.log('wrote icons/' + name);
}
await browser.close();
server.close();

// 내장 데모(demo-chars.js)를 PNG 로 저장 → sprites/slime, sprites/ghost (+character.json) 후 gen-manifest 실행.
// 사용: node scripts/export-demo-sprites.mjs   (먼저 `node scripts/install-browser.mjs` 로 Chromium 설치)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { launch } from '../tests/launch.mjs';
import { startServer } from './serve.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { server, url } = await startServer({ port: 0, root });
const browser = await launch();
try {
  const page = await browser.newPage();
  await page.goto(url + '/tests/ui-harness.html');
  await page.waitForFunction(() => window.ready === true);
  const data = await page.evaluate(async () => {
    const out = [];
    for (const d of await EW.demo.getDemoChars()) {
      const files = {};
      for (const a of Object.keys(d.frames)) files[a] = d.frames[a].map((c) => c.toDataURL('image/png'));
      out.push({ id: d.id, name: d.name, scale: d.scale, speed: d.speed, fps: d.fps, count: d.count, files });
    }
    return out;
  });
  for (const c of data) {
    const dir = path.join(root, 'sprites', c.id);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    for (const [a, list] of Object.entries(c.files)) {
      list.forEach((u, i) => fs.writeFileSync(path.join(dir, a + '_' + (i + 1) + '.png'), Buffer.from(u.split(',')[1], 'base64')));
    }
    fs.writeFileSync(path.join(dir, 'character.json'),
      JSON.stringify({ name: c.name, scale: c.scale, speed: c.speed, fps: c.fps, count: c.count }, null, 2) + '\n');
    console.log('sprites/' + c.id + ': ' + Object.values(c.files).flat().length + '장');
  }
} finally {
  await browser.close();
  server.close();
}
const r = spawnSync('node', [path.join(root, 'scripts/gen-manifest.mjs')], { stdio: 'inherit' });
process.exit(r.status ?? 0);

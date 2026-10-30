// 사용: node scripts/make-fixtures.mjs → tests/fixtures/shapes/{walk_1,walk_2,idle_1}.png, character.json, tests/fixtures/manifest.json
// 단순 도형(주황 사각 몸통 + 눈) 테스트 캐릭터. 256x256, 발 y=224.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { canvas, fillRect, fillEllipse, toPNG } from './png.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fx = path.join(root, 'tests', 'fixtures');
const dir = path.join(fx, 'shapes');
fs.mkdirSync(dir, { recursive: true });

function frame(file, { bodyH, legShift }) {
  const c = canvas(256, 256);
  fillRect(c, 78, 224 - bodyH, 178, 224, [255, 140, 40, 255]);           // 몸통
  fillRect(c, 70 + legShift, 214, 100 + legShift, 224, [150, 70, 10, 255]); // 발
  fillRect(c, 156 - legShift, 214, 186 - legShift, 224, [150, 70, 10, 255]);
  fillEllipse(c, 150, 224 - bodyH + 30, 9, 11, [20, 20, 20, 255]);       // 눈 (오른쪽을 봄)
  fs.writeFileSync(path.join(dir, file), toPNG(c));
}
frame('walk_1.png', { bodyH: 90, legShift: -8 });
frame('walk_2.png', { bodyH: 84, legShift: 8 });
frame('idle_1.png', { bodyH: 90, legShift: 0 });
fs.writeFileSync(path.join(dir, 'character.json'), JSON.stringify({ name: '테스트 도형', scale: 1, speed: 70, fps: 4, count: 2 }, null, 2) + '\n');
execFileSync('node', [path.join(root, 'scripts', 'gen-manifest.mjs'), fx, path.join(fx, 'manifest.json')], { stdio: 'inherit' });

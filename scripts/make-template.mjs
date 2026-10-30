// 사용: node scripts/make-template.mjs  → sprites/_template/guide.png (256x256 투명, 발 기준선 y=224, 중심선 x=128)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canvas, fillRect, toPNG } from './png.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'sprites', '_template');
fs.mkdirSync(dir, { recursive: true });

const c = canvas(256, 256);
const FOOT = 224, CX = 128;
const line = [255, 70, 70, 230], mid = [60, 140, 255, 200], box = [120, 120, 120, 120];
// 발 기준선(가로, 점선 느낌 없이 실선 2px) — 여기에 발바닥을 맞춘다
fillRect(c, 0, FOOT, 256, FOOT + 2, line);
// 중심선(세로 점선): 몸 가운데
for (let y = 0; y < 256; y += 8) fillRect(c, CX - 1, y, CX + 1, y + 4, mid);
// 권장 몸 영역 테두리(1px, 연한 회색 점선)
for (let x = 16; x < 240; x += 6) { fillRect(c, x, 16, x + 3, 17, box); fillRect(c, x, 239, x + 3, 240, box); }
for (let y = 16; y < 240; y += 6) { fillRect(c, 16, y, 17, y + 3, box); fillRect(c, 239, y, 240, y + 3, box); }
// 바라보는 방향(오른쪽) 화살표
for (let i = 0; i < 12; i++) { fillRect(c, 196 + i, 40 - i, 197 + i, 41 - i, mid); fillRect(c, 196 + i, 40 + i, 197 + i, 41 + i, mid); }
fillRect(c, 160, 40, 208, 42, mid);

fs.writeFileSync(path.join(dir, 'guide.png'), toPNG(c));
fs.writeFileSync(path.join(dir, 'README.txt'),
  '256x256 투명 PNG 에 그리세요. 빨간 가로선(y=224)에 발바닥, 파란 세로선(x=128)에 몸 중심을 맞추고 오른쪽을 바라보게 그립니다. guide.png 는 참고용이니 캐릭터 폴더에 넣지 마세요 (walk_1.png … 파일명 규칙은 README.md 참고).\n');
console.log('wrote', path.relative(root, path.join(dir, 'guide.png')));

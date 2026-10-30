// 사용: node scripts/gen-manifest.mjs [스캔폴더=sprites] [출력파일=<스캔폴더>/manifest.json]
// <폴더>/<캐릭터>/<action>_<n>.(png|webp) 를 스캔해 manifest.json 생성. '_' 로 시작하는 폴더는 제외.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.resolve(process.argv[2] || path.join(root, 'sprites'));
const out = path.resolve(process.argv[3] || path.join(dir, 'manifest.json'));
const ACTIONS = ['walk', 'idle', 'look', 'sit', 'jump', 'sleep'];
const re = /^([a-z]+)_(\d+)\.(png|webp)$/i;

const characters = [];
for (const d of fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
  if (d.name.startsWith('_') || d.name.startsWith('.')) continue;
  const byAction = {};
  for (const f of fs.readdirSync(path.join(dir, d.name))) {
    const m = re.exec(f);
    if (!m || !ACTIONS.includes(m[1].toLowerCase())) continue;
    (byAction[m[1].toLowerCase()] ||= []).push({ n: +m[2], f });
  }
  const files = {};
  for (const a of Object.keys(byAction)) {
    const list = byAction[a].sort((x, y) => x.n - y.n);
    const seq = [];
    for (let i = 0; i < list.length; i++) {
      if (list[i].n !== i + 1) { console.warn(`! ${d.name}/${a}: ${i + 1}번 프레임이 없어 ${list[i].f} 부터 무시`); break; }
      seq.push(list[i].f);
    }
    if (seq.length) files[a] = seq;
  }
  if (!files.walk || files.walk.length < 2 || !files.idle) { console.warn(`! ${d.name}: walk(2장↑)·idle(1장↑) 필수 — 건너뜀`); continue; }
  let config = null;
  const cj = path.join(dir, d.name, 'character.json');
  if (fs.existsSync(cj)) {
    try { config = JSON.parse(fs.readFileSync(cj, 'utf8')); } catch (e) { console.warn(`! ${d.name}/character.json 파싱 실패: ${e.message}`); }
  }
  characters.push({ dir: d.name, files, config });
}
fs.writeFileSync(out, JSON.stringify({ characters }, null, 2) + '\n');
console.log(`manifest: ${characters.length}개 캐릭터 → ${path.relative(root, out)}`);

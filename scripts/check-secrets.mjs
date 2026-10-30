// 커밋 대상 파일에 비밀값(토큰 파일 내용, GitHub 토큰, Supabase secret/service_role 키)이 없는지 검사.
// publishable 키(sb_publishable_…)는 공개용이라 허용. 실행: node scripts/check-secrets.mjs  (발견 시 종료코드 1)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['node_modules', '.git', '.watch']);
const TEXT_EXT = new Set(['.js', '.mjs', '.json', '.html', '.css', '.md', '.txt', '.webmanifest', '.svg', '.yml', '.yaml', '']);

const PATTERNS = [
  ['GitHub 토큰', /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/],
  ['GitHub fine-grained 토큰', /\bgithub_pat_[A-Za-z0-9_]{20,}/],
  ['Supabase secret 키', /\bsb_secret_[A-Za-z0-9_-]{10,}/],
  ['개인 키', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
];

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    const rel = path.relative(ROOT, p);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) || /^tests\/shots/.test(rel.split(path.sep).join('/'))) continue;
      yield* walk(p);
    } else if (e.isFile()) {
      if (e.name === '.DS_Store' || e.name.endsWith('.token') || e.name.startsWith('.plan-')) continue;
      if (/^out\/.*\.mp4$/.test(rel.split(path.sep).join('/'))) continue;
      yield p;
    }
  }
}

export function scan() {
  const found = [];
  let tokenText = '';
  try { tokenText = fs.readFileSync(path.join(os.homedir(), 'Documents/.tools/secrets/github.token'), 'utf8').trim(); } catch { /* 없으면 패턴 검사만 */ }
  let n = 0;
  for (const file of walk(ROOT)) {
    if (!TEXT_EXT.has(path.extname(file).toLowerCase())) continue;
    const text = fs.readFileSync(file, 'utf8');
    n++;
    const rel = path.relative(ROOT, file);
    if (tokenText.length >= 8 && text.includes(tokenText)) found.push(rel + ': 토큰 파일 내용이 들어 있음');
    for (const [name, re] of PATTERNS) if (re.test(text)) found.push(rel + ': ' + name + ' 패턴');
    // JWT 형태의 키 중 role 이 service_role 인 것
    for (const m of text.matchAll(/eyJ[A-Za-z0-9_-]{8,}\.([A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]{8,}/g)) {
      try {
        if (JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8')).role === 'service_role') found.push(rel + ': service_role JWT');
      } catch { /* JWT 아님 */ }
    }
  }
  return { found, scanned: n };
}

if (import.meta.url === 'file://' + process.argv[1]) {
  const { found, scanned } = scan();
  if (found.length) {
    console.error('비밀값 의심 항목 ' + found.length + '건 (내용은 출력하지 않음):\n - ' + found.join('\n - '));
    process.exit(1);
  }
  console.log('check-secrets: 텍스트 파일 ' + scanned + '개 검사, 비밀값 없음');
}

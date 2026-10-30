// GitHub Pages 배포: check-secrets → build → git 커밋 → repo 생성/푸시 → Pages 켜기 → 200 확인.
// 토큰은 ~/Documents/.tools/secrets/github.token 에서 읽어 메모리/자식 프로세스 환경변수로만 쓴다
// (로그·.git/config·원격 URL·프로세스 인자에 남기지 않는다). Pages 활성화 실패 시 우회 없이 응답을 출력하고 중단.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OWNER = '456rtyfgh', REPO = 'edge-walkers';
const SITE = `https://${OWNER}.github.io/${REPO}/`;
const TOKEN = fs.readFileSync(path.join(os.homedir(), 'Documents/.tools/secrets/github.token'), 'utf8').trim();
const B64 = Buffer.from('x-access-token:' + TOKEN).toString('base64');

const mask = (s) => String(s).split(TOKEN).join('***').split(B64).join('***');
const log = (...a) => console.log(...a.map(mask));
const die = (msg, code = 1) => { console.error(mask(msg)); process.exit(code); };

function run(cmd, args, { auth = false, allowFail = false } = {}) {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
  if (auth) {
    // 인자가 아닌 환경변수로 일회성 헤더 전달 → ps/.git/config 에 남지 않음
    env.GIT_CONFIG_COUNT = '1';
    env.GIT_CONFIG_KEY_0 = 'http.extraHeader';
    env.GIT_CONFIG_VALUE_0 = 'Authorization: Basic ' + B64;
  }
  const r = spawnSync(cmd, args, { cwd: ROOT, env, encoding: 'utf8' });
  if (r.status !== 0 && !allowFail) die(`명령 실패: ${cmd} ${args.join(' ')}\n${r.stdout || ''}${r.stderr || ''}`);
  return r;
}

async function gh(method, url, body) {
  const res = await fetch('https://api.github.com' + url, {
    method,
    headers: { Authorization: 'Bearer ' + TOKEN, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'edge-walkers-deploy', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* 본문이 JSON 이 아님 */ }
  return { status: res.status, text, json };
}

// 1) 비밀값 검사 + 빌드 + 필수 파일
log('1/6 비밀값 검사');
run('node', ['scripts/check-secrets.mjs']);
log('2/6 빌드');
run('node', ['build.mjs']);
const REQUIRED = ['index.html', 'manifest.webmanifest', 'sw.js', 'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png', 'sprites/manifest.json', 'sprites/slime', 'sprites/ghost'];
const missing = REQUIRED.filter((f) => !fs.existsSync(path.join(ROOT, f)));
if (missing.length) die('필수 파일이 없어 배포를 중단합니다 (Dev-B 산출물 미완?): ' + missing.join(', '));

// 2) 로컬 커밋
log('3/6 커밋');
if (!fs.existsSync(path.join(ROOT, '.git'))) run('git', ['init', '-b', 'main']);
run('git', ['add', '-A']);
if (run('git', ['status', '--porcelain']).stdout.trim()) {
  run('git', ['-c', 'user.name=' + OWNER, '-c', `user.email=${OWNER}@users.noreply.github.com`, 'commit', '-m', 'Edge Walkers: 공유 링크 + 홈 화면 앱 + Pages 배포']);
} else log('  (변경 없음)');

// 3) repo 생성
log('4/6 repo 확인/생성');
const me = await gh('GET', '/user');
if (me.status !== 200) die(`토큰 확인 실패: HTTP ${me.status}\n${me.text}`);
if (me.json.login !== OWNER) die(`토큰 계정이 ${me.json.login} 입니다 (기대: ${OWNER})`);
let repo = await gh('GET', `/repos/${OWNER}/${REPO}`);
if (repo.status === 404) {
  repo = await gh('POST', '/user/repos', { name: REPO, description: 'Edge Walkers — 가장자리를 걷는 폰 배경화면', private: false, has_issues: false, has_wiki: false });
  if (repo.status !== 201) die(`repo 생성 실패: HTTP ${repo.status}\n${repo.text}`);
  log('  생성됨');
} else if (repo.status !== 200) die(`repo 조회 실패: HTTP ${repo.status}\n${repo.text}`);
else log('  기존 repo 재사용');
if (repo.json.private) die('repo 가 비공개입니다. Pages(무료)는 공개 repo 가 필요해요.');

// 4) 푸시 (원격 URL 에 토큰 없음)
log('5/6 푸시');
const remotes = run('git', ['remote']).stdout.split('\n');
if (!remotes.includes('origin')) run('git', ['remote', 'add', 'origin', `https://github.com/${OWNER}/${REPO}.git`]);
run('git', ['push', '-u', 'origin', 'main'], { auth: true });
const cfg = fs.readFileSync(path.join(ROOT, '.git/config'), 'utf8');
if (cfg.includes(TOKEN) || cfg.includes(B64) || /x-access-token|extraheader/i.test(cfg)) die('.git/config 에 인증 정보가 있어요! 중단합니다.');
if (run('git', ['remote', '-v']).stdout.includes(TOKEN)) die('원격 URL 에 토큰이 있어요! 중단합니다.');
log('  푸시 완료, .git/config·원격 URL 에 토큰 없음 확인');

// 5) Pages
log('6/6 Pages 켜기');
const pages = await gh('POST', `/repos/${OWNER}/${REPO}/pages`, { source: { branch: 'main', path: '/' } });
if (pages.status === 201) log('  Pages 활성화됨');
else if (pages.status === 409) log('  Pages 가 이미 켜져 있어요 (HTTP 409)');
else {
  console.error(mask(`Pages 활성화 실패 — HTTP ${pages.status}\n${pages.text}\n(우회 시도 없이 여기서 멈춥니다. 토큰 권한(Pages: write / repo) 또는 계정 설정을 확인하세요.)`));
  process.exit(2);
}

// 6) 200 확인 (최대 약 10분)
const targets = [SITE, SITE + 'manifest.webmanifest', SITE + 'sw.js'];
log('배포 확인 중… (최대 10분)');
const deadline = Date.now() + 10 * 60 * 1000;
let ok = false;
while (Date.now() < deadline) {
  const codes = [];
  for (const u of targets) {
    try { codes.push((await fetch(u + '?t=' + Date.now(), { headers: { 'cache-control': 'no-cache' } })).status); } catch { codes.push(0); }
  }
  log('  ' + codes.join(' / '));
  if (codes.every((c) => c === 200)) { ok = true; break; }
  await new Promise((r) => setTimeout(r, 15000));
}
if (!ok) die('시간 안에 200 이 되지 않았어요. 잠시 뒤 ' + SITE + ' 를 다시 확인하세요.', 3);
log('배포 완료: ' + SITE);

// 브라우저를 이 프로젝트의 node_modules 안에만 설치한다 (PLAYWRIGHT_BROWSERS_PATH=0).
// 사용: node scripts/install-browser.mjs [chromium|webkit ...]  (기본 chromium)
// record.mjs / tests 도 같은 설정으로 브라우저를 찾는다.
import { spawnSync } from 'node:child_process';
const names = process.argv.slice(2);
const r = spawnSync('npx', ['playwright', 'install', ...(names.length ? names : ['chromium'])], {
  stdio: 'inherit',
  env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: '0' },
});
process.exit(r.status ?? 1);

// 브라우저 실행 헬퍼. 이 맥(macOS 26)에서는 playwright 기본 headless-shell 이 GPU 프로세스 크래시로 죽어서,
// 프로젝트 안에 설치된 Chrome for Testing 을 --headless=new 로 직접 띄운다. 없으면 기본 chromium.launch 로 폴백.
process.env.PLAYWRIGHT_BROWSERS_PATH ??= '0';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import('playwright');

export function chromePath() {
  const lb = path.join(root, 'node_modules/playwright-core/.local-browsers');
  if (!fs.existsSync(lb)) return null;
  for (const d of fs.readdirSync(lb).filter((x) => x.startsWith('chromium-'))) {
    const exe = path.join(lb, d, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
    if (fs.existsSync(exe)) return exe;
  }
  return null;
}

export function launch(opts = {}) {
  const exe = chromePath();
  return exe
    ? chromium.launch({ executablePath: exe, args: ['--headless=new', ...(opts.args || [])] })
    : chromium.launch(opts);
}

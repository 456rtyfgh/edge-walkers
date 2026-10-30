// src/shell.html 의 <!--CSS-->, <!--JS--> 자리에 src/*.css, src/*.js 를 인라인해 index.html 생성.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, 'src');
const JS = ['config', 'toast', 'store', 'loader', 'io', 'pack', 'share', 'demo-chars', 'path', 'behavior', 'engine', 'a2hs', 'ui', 'main'];
const CSS = ['ui'];

function read(name, ext) {
  const f = path.join(SRC, name + '.' + ext);
  if (!fs.existsSync(f)) { console.warn('[build] 건너뜀(없음): src/' + name + '.' + ext); return ''; }
  return '/* ---- ' + name + '.' + ext + ' ---- */\n' + fs.readFileSync(f, 'utf8');
}

let html = fs.readFileSync(path.join(SRC, 'shell.html'), 'utf8');
const css = CSS.map((n) => read(n, 'css')).filter(Boolean).join('\n');
// 인라인 <script> 안의 "</script" 가 태그를 조기에 닫지 않도록 이스케이프
const js = JS.map((n) => read(n, 'js')).filter(Boolean).join('\n').replace(/<\/script/gi, '<\\/script');
// replace 콜백을 써서 코드 안의 "$&" 같은 패턴이 치환되지 않게 한다
html = html
  .replace('<!--CSS-->', () => '<style>\n' + css + '\n</style>')
  .replace('<!--JS-->', () => '<script>\n' + js + '\n</script>');
fs.writeFileSync(path.join(ROOT, 'index.html'), html);
console.log('[build] index.html ' + (html.length / 1024).toFixed(1) + ' KB');

# PLAN.md — Edge Walkers (가장자리 걷는 폰 배경화면)

## 1. 목표
작은 캐릭터들이 폰 화면 가장자리·모서리를 따라 돌아다니는 배경화면 웹앱 + 영상 내보내기.
- 엔진은 **규격만 맞으면 어떤 캐릭터 프레임이든** 동작 (사용자 이미지 프레임이 핵심).
- 영상(참고: 인스타 DfHKoudzdgL)은 **움직임만** 참고 (가장자리 걷기, 모서리 회전, 멈춰서 두리번/앉기, 여러 마리). 캐릭터 디자인은 절대 참고/모방 금지.
- **저작권**: 기존 작품 캐릭터(치이카와 등) 금지. 내장 데모는 오리지널 2종(말랑 떡 슬라임 `slime`, 꼬마 유령 `ghost`)을 Canvas/SVG 코드로 직접 그린다. 웹에서 이미지 다운로드 금지.
- 결과물: ① `index.html` (단일 파일·외부 의존성 0·오프라인) ② 영상 내보내기 스크립트 + 데모 MP4(1179x2556, 30fps, 10~15초, 무이음 루프) ③ `sprites/_template/` 가이드 PNG ④ `README.md`(한국어).

## 2. 소스 구조 / 빌드 방식 (파일 겹침 방지)
`index.html` 은 **직접 편집하지 않는 빌드 산출물**. `node build.mjs` 가 `src/shell.html` 안의 `<!--CSS-->`, `<!--JS-->` 자리에 `src/*.css`, `src/*.js` 를 아래 순서로 인라인해 단일 파일을 만든다.
JS 순서: `store.js → loader.js → io.js → demo-chars.js → path.js → behavior.js → engine.js → ui.js → main.js`. CSS: `ui.css`, 그리고 shell 내 기본 스타일.
모든 모듈은 전역 네임스페이스 `window.EW` 에 붙는다 (`EW.store`, `EW.loader`, `EW.io`, `EW.demo`, `EW.engine`, `EW.ui`). ES module/외부 import 금지(단일 파일 인라인 + file:// 호환).

## 3. 공통 인터페이스 (두 파트가 맞물리는 계약 — 바꾸려면 상대와 합의 후 이 문서 수정)

### 3.1 액션/프레임 규격 (README에도 동일하게)
| 액션 | 필수 | 권장 프레임 | 최소 | 대체(없을 때) |
|---|---|---|---|---|
| walk | 필수 | 4 | 2 | — |
| idle | 필수 | 2 | 1 | — |
| look | 선택 | 2 | 1 | idle |
| sit | 선택 | 1~2 | 1 | idle |
| jump | 선택 | 3 (웅크림·공중·착지) | 1 | idle (walk 첫 프레임 위로 이동 연출) |
| sleep | 선택 | 2 | 1 | sit → idle |
이미지: 투명 PNG(WebP 허용), 한 캐릭터 전 프레임 동일 캔버스 크기(권장 256x256), 옆모습·**오른쪽을 바라봄**, 발 접지점은 캔버스 아래쪽 같은 높이·가운데. 엔진이 좌우반전/벽·천장 회전/모서리 보간 처리.

### 3.2 `CharacterDef` (런타임 캐릭터 정의 — 로더/스토어 → 엔진)
```js
{
  id: 'slime',            // 고유 문자열
  name: '말랑 떡 슬라임',
  source: 'builtin'|'folder'|'user',
  scale: 1.0,             // 기본 표시 크기 배율 (기준 높이는 엔진이 정함: 화면 너비의 약 16% * scale)
  speed: 60,              // 걷기 속도 px/s (CSS px, 390폭 기준; 엔진이 화면폭 비례 보정)
  fps: 8,                 // 프레임 애니메이션 fps
  count: 1,               // 마릿수
  size: { w:256, h:256 }, // 프레임 캔버스 크기
  frames: {               // 액션별 그릴 수 있는 이미지 (디코드 완료된 것)
    walk:[CanvasImageSource,...], idle:[...],
    look?:[...], sit?:[...], jump?:[...], sleep?:[...]   // 없으면 키 자체 없음
  }
}
```
검증 규칙(`EW.store.validateDef(def)` → `{ok:boolean, errors:string[], warnings:string[]}`): walk≥2, idle≥1, 프레임 크기 모두 동일, frames 값은 비어있지 않은 배열.

### 3.3 Part A가 제공하는 API (`EW.*`, 모두 Promise 기반)
```js
// store.js — IndexedDB (DB 'edge-walkers', stores: 'characters', 'settings')
EW.store.open() -> Promise<void>
EW.store.listUserChars() -> Promise<StoredChar[]>
EW.store.saveUserChar(StoredChar) -> Promise<void>
EW.store.deleteUserChar(id) -> Promise<void>
EW.store.getSettings() -> Promise<Settings>       // 없으면 기본값
EW.store.setSettings(partial) -> Promise<Settings> // 머지 저장
EW.store.validateDef(def) -> {ok,errors,warnings}
EW.store.storedToDef(StoredChar) -> Promise<CharacterDef>   // Blob → ImageBitmap/Image 디코드
EW.store.applyOverrides(defs:CharacterDef[], settings) -> CharacterDef[]  // enabledIds 필터 + overrides 적용(새 객체 반환, 원본 불변). main.js 가 setCharacters 직전에 호출
// StoredChar = {id,name,scale,speed,fps,count, actions:{walk:[Blob,...], idle:[Blob,...], ...}}
// Settings = { enabledIds:string[]|null(null=전부), bg:{type:'color'|'gradient'|'image', color:'#1b1f2a', color2:'#2c3350', image:Blob|null, fit:'cover'}, showSafeArea:boolean, overrides:{[id]:{scale?,speed?,fps?,count?}} }  // builtin/folder 캐릭터는 원본 수정 불가 → 설정 패널에서 바꾼 값은 overrides 에 저장

// loader.js — 폴더 방식
EW.loader.loadFolderChars(baseUrl='sprites/') -> Promise<CharacterDef[]>
//  baseUrl+'manifest.json' 을 fetch (scripts/gen-manifest.mjs 가 생성). 실패/없으면 [] (에러 아님, 콘솔 에러 0 유지: try/catch로 조용히).
//  manifest 형식: { "characters":[ { "dir":"slime", "files":{"walk":["walk_1.png",...],"idle":[...]}, "config":{...character.json 내용 또는 null} } ] }
//  파일명 규칙: <action>_<n>.(png|webp), n은 1부터 연속. '_' 로 시작하는 폴더(_template)는 제외.
//  character.json: {"name","scale","speed","fps","count"} 모두 선택.
EW.loader.parseFolderEntry(entry, baseUrl) -> Promise<CharacterDef>

// io.js — 내보내기/가져오기
EW.io.exportChars(ids:string[]) -> Promise<Blob>   // 단일 JSON 파일: {version:1, characters:[{...meta, actions:{walk:["data:image/png;base64,..."]}}]} (base64 JSON; zip 불필요)
EW.io.importChars(fileOrText) -> Promise<{added:string[], errors:string[]}>   // id 충돌 시 새 id 부여

// ui.js — 설정 패널
EW.ui.init({ root:HTMLElement, getEngine:()=>engine, getAllDefs:()=>CharacterDef[] /*builtin+folder+user 전부(오버라이드 전 원본)*/, onChange:()=>Promise<void> }) -> void
//  - 화면 길게 누르기(600ms, 이동 10px 이내) 또는 우하단 작은 톱니(opacity 낮게) → 패널 열기. 
//  - 열린 동안 엔진은 계속 돌며 미리보기 역할. 패널 안에 캐릭터별 미리보기 <canvas>(액션 선택해 재생).
//  - 변경 시 store 저장 후 onChange() 호출 → main.js 가 엔진 재구성.
```
탭/길게 누르기 소유권: **포인터 이벤트는 ui.js 만 처리**한다 (`root` 위 `pointerdown/move/up`). 600ms·10px 이내 유지 → 패널 열고 `pointerup` 소비(탭 아님). 그 외 짧은 탭 → `root` 에 `CustomEvent('ew:tap', {detail:{x,y}})` (CSS px, 캔버스 좌표계) dispatch. main.js 는 `ew:tap` 만 듣고 `engine.tap(x,y)` 호출. 패널이 열려 있는 동안은 `ew:tap` 을 내지 않는다. 톱니 버튼 클릭도 ew:tap 을 내지 않는다. 녹화 모드(`hideUI=1`)에서는 main.js 가 `EW.ui.init` 을 호출하지 않는다.

### 3.3b 캐릭터 id / 합치기 규칙 (main.js 구현, A 의 loader/store 는 이를 따름)
- 폴더 캐릭터 id = 폴더명, 내장 데모 id = `slime`,`ghost`, 사용자 캐릭터 id = `u_<랜덤>`.
- 같은 id 가 겹치면 **folder > builtin** (folder 가 builtin 을 대체). user id 는 `u_` 접두라 충돌 없음.
- 데모 캐릭터는 `sprites/slime/`, `sprites/ghost/` PNG 로도 저장해 둔다(A 의 `scripts/export-demo-sprites.mjs`). 녹화는 이 폴더 캐릭터를 사용 (`?chars=slime,ghost` 는 최종 합쳐진 목록에서 id 로 필터).
- 폴더 방식은 `fetch` 필요 → `file://` 에선 manifest 로드 실패(조용히 [] 처리), 내장 데모+사용자 캐릭터만 동작. README 에 로컬 서버 필요성 명시.

### 3.4 Part B가 제공하는 API
```js
// engine.js
const engine = EW.engine.create(canvas, opts?)   // opts: {seed:number=1, loop:null|{duration:number(sec)}, dpr?:number}
engine.setCharacters(defs:CharacterDef[])        // count 만큼 개체 생성, 기존 상태 리셋
engine.setBackground(bg)                         // Settings.bg 형식 그대로. image 는 Blob
engine.resize(cssW, cssH, dpr)                   // 캔버스 크기 갱신 (main.js 가 ResizeObserver 로 호출)
engine.setInsets({top,right,bottom,left})        // CSS px safe-area. main.js 가 env(safe-area-inset-*) 를 측정해 전달. 걷는 경로는 이 안쪽 + 캐릭터 접지 여백
engine.start() / engine.stop()                   // requestAnimationFrame 루프
engine.step(dtSec)                               // 고정 dt 한 틱 진행 (결정론적, 영상 녹화용)
engine.render()                                  // 현재 상태 그리기
engine.tap(x, y)                                 // 가까운 개체 jump (선택 액션 없으면 대체 연출)
engine.getState() -> {t, walkers:[{id,edge:'bottom'|'right'|'top'|'left', s, action, frame}]}  // 테스트/스크린샷 검증용
// EW.demo.getDemoChars() -> Promise<CharacterDef[]>   // demo-chars.js: 슬라임·유령을 OffscreenCanvas/canvas로 프레임 생성 (256x256, 규격 준수)
// window.__ew = { engine, ready:Promise }  // main.js 가 노출. 테스트/녹화 스크립트가 사용
// 녹화용 URL 파라미터(main.js): ?record=1&seed=7&loop=12&chars=slime,ghost&hideUI=1  → 자동재생 대신 외부에서 __ew.engine.step() 구동
//   record 모드: 뷰포트 393x852 CSS px @ dpr3 (=1179x2556), insets 고정 {top:59,bottom:34,left:0,right:0}, IndexedDB 사용자 캐릭터·overrides 무시(재현성)
```
엔진 동작 요구: 네 변 모두 걷기. **진행 방향 확정: 화면 기준 반시계** — 바닥(오른쪽으로)→오른쪽 벽(위로, 머리는 화면 안쪽=왼쪽)→천장(왼쪽으로, 거꾸로)→왼쪽 벽(아래로). 개체마다 가끔 방향 반전(좌우 flip) 허용. 접지 변 쪽이 발, 접지점이 화면 가장자리(safe-area 안쪽 inset)에 닿음, 모서리에서 접선 각도를 보간(약 0.3~0.5초)하며 부드럽게 회전, 가운데 영역 비움, 개체끼리 근접 시 멈추거나(대기 후 재출발) 비켜감(속도/방향 조정), 랜덤하게 idle/look/sit/sleep 후 재출발, 탭하면 jump.
`loop` 옵션: 지정 시 모든 개체의 경로·행동 스케줄을 시드 기반으로 **주기 D 로 미리 생성**해 t=0 과 t=D 의 상태(위치·행동·프레임 인덱스)가 동일하도록 한다 (정수 바퀴 이동 + 정지 구간 포함, 프레임 인덱스도 D*fps 정합).

## 4. 파트 분담 (B ≈ 55%, A ≈ 45% — 사용량 기준. gen-manifest·템플릿 생성은 B 소유) — 파일 소유권은 겹치지 않는다

### 파트 B (Dev-B) — "엔진·렌더·앱 조립·영상" (JS 순서에서 demo-chars 는 A 소유, 위치 불변)
| 파일 | 내용 |
|---|---|
| `src/shell.html` | 뼈대 HTML(viewport-fit=cover, 100dvh, safe-area, `<canvas>`, 톱니 버튼 자리 `#ew-ui-root`) + 기본 CSS |
| `src/path.js` | 둘레 경로(시계/반시계), 4변 + 모서리 매핑, 위치→(x,y,회전,flip), 모서리 각도 보간, safe-area inset |
| `src/behavior.js` | 상태머신(walk/idle/look/sit/sleep/jump), 시드 PRNG, 충돌 회피(정지/비켜가기), loop 모드 스케줄 생성 |
| `src/engine.js` | `EW.engine.create`, 렌더(프레임 선택·flip·회전·scale), 배경 그리기, step/tap/getState |
| `src/main.js` | 부팅: store.open → settings → (demo + folder + user) 합쳐 setCharacters, resize, 길게누르기/탭 연결, 녹화 모드, `window.__ew` |
| `build.mjs` | 인라인 빌드 → `index.html` 생성 |
| `index.html` | 빌드 산출물(커밋 대상) |
| `package.json` | 개발 의존성(playwright 등, 이 프로젝트 폴더 내 설치만). scripts: build/serve/record/test |
| `scripts/serve.mjs` | 의존성 없는 정적 서버(기본 포트 5173, 프로젝트 루트). A 의 테스트·export 스크립트도 사용 → **BUILD 첫 단계에서 먼저 제공** |
| `scripts/record.mjs` | 헤드리스 Chromium 으로 `?record=1` 구동, 1179x2556·30fps 프레임 캡처 → ffmpeg 로 MP4 |
| `scripts/gen-manifest.mjs` | `sprites/` 스캔 → `sprites/manifest.json` 생성 (`_` 시작 폴더 제외) |
| `scripts/make-template.mjs` | 템플릿 PNG 생성(의존성 없이 순수 JS PNG 인코더 또는 playwright canvas) |
| `sprites/_template/guide.png` | 256x256 투명, 발 기준선(예: y=224)·중심선(x=128)만 표시 + `README.txt` 한 줄 안내 |
| `scripts/png.mjs`, `scripts/make-fixtures.mjs`, `scripts/install-browser.mjs` | (이미 존재) PNG 인코더·픽스처 생성·브라우저 설치 보조 — 소유권 B (A 는 읽기/실행만) |
| `out/demo.mp4` | 데모 영상 (10~15초, 루프 이음새 없음) |
| `tests/engine.spec.mjs`, `tests/shots/` | 390x844 스크린샷(네 변·모서리) 검증, 루프 첫/마지막 프레임 픽셀 비교, 콘솔 에러 0 확인 |

### 파트 A (Dev-A) — "스프라이트 규격·저장·설정 UI·문서"
| 파일 | 내용 |
|---|---|
| `src/demo-chars.js` | 오리지널 데모 2종(슬라임·유령) 프레임 Canvas 생성(walk4/idle2/look2/sit1/jump3/sleep2, 256x256, 발 기준선 y=224·x=128). `EW.demo.getDemoChars()` |
| `scripts/export-demo-sprites.mjs` | headless 로 demo-chars 를 PNG 로 저장 → `sprites/slime/`, `sprites/ghost/` (+character.json) 후 gen-manifest 실행 |
| `src/store.js` | IndexedDB 래퍼, Settings 기본값, validateDef, storedToDef, applyOverrides |
| `src/loader.js` | 폴더 방식 로더(manifest fetch, 파일명 규칙 파싱, character.json 병합) |
| `src/io.js` | base64 JSON 내보내기/가져오기 |
| `src/ui.js`, `src/ui.css` | 길게 누르기·톱니·설정 패널(캐릭터 추가/액션별 다중 이미지 선택/이름·크기·속도·마릿수·fps/미리보기/삭제, 내보내기·가져오기, 배경 색/그라디언트/이미지, 마릿수 반영) |
| `tests/fixtures/` | 단순 도형 PNG: `shapes/walk_1.png, walk_2.png, idle_1.png` (폴더 방식 테스트용) 와 `character.json` |
| `tests/settings.spec.mjs` | 폴더 방식 로드, 설정 패널 방식(파일 업로드) 로드, 새로고침 후 유지, 내보내기→삭제→가져오기 왕복 검증 |
| `README.md` | 한국어: 규격표(§3.1), 폴더 넣는 법(manifest 생성 포함), 앱 안 추가법, 내보내기/가져오기, 영상 만드는 법(B의 record 사용법 참조), 아이폰·안드로이드 배경화면 사용법(영상→Live/동영상 배경화면 한계 정직하게, 호스팅한 웹앱은 홈화면 추가·화면 녹화 방식 등) |

테스트용 `sprites/shapes` 같은 파일은 `sprites/` 에 두지 않고 `tests/fixtures/` 에만 둔다 (테스트가 `?spritesBase=` 파라미터 또는 정적서버 루트 설정으로 이를 읽음 — `loadFolderChars` 가 baseUrl 을 받으므로 main.js 가 `?spritesBase=` 쿼리를 `loadFolderChars` 에 전달; fixtures 용 manifest 는 `gen-manifest.mjs <dir> <out>` 인자로 생성).

## 5. 작업 순서 / 협업 규칙
1. [BUILD] 시작 시 B 가 먼저 `package.json`, `scripts/serve.mjs`, `src/shell.html`, `build.mjs` 뼈대를 만든다(A 가 빌드·테스트 가능하도록). A 는 그동안 store/loader/io 부터.
2. 인터페이스 변경이 필요하면 이 문서 §3 를 수정하고 상대 리뷰에서 알린다. 상대 파일은 수정하지 않는다.
3. 통합 점검은 B 가 `node build.mjs` 후 수행, 발견한 A 쪽 문제는 [REVIEW] 에서 지적.

## 5b. 이어서 하기 (재부팅으로 BUILD 중단, 2026-10-31 확정)
- 이미 존재(재작성 금지, 검토 후 부족분만 보완): `src/*` 전부, `build.mjs`, `index.html`, `package.json`, `scripts/{serve,png,make-template,gen-manifest,install-browser,make-fixtures}.mjs`, `sprites/_template/`, `tests/fixtures/`, `tests/ui-harness.html`.
- 아직 없음 → 담당이 만든다: **A** `scripts/export-demo-sprites.mjs`, `sprites/slime|ghost/`(+`sprites/manifest.json`), `tests/settings.spec.mjs`, `README.md`. **B** `scripts/record.mjs`, `tests/engine.spec.mjs`, `tests/shots/`, `out/demo.mp4`.
- 시작 시 각자 `node build.mjs` 로 index.html 을 재생성하고 `?`-없이 열어 콘솔 에러 0 부터 확인한다. 소유권·인터페이스(§3, §4)는 변경 없음.

## 6. 완료 기준
- [ ] 390x844 모바일 뷰포트 스크린샷: 데모 캐릭터가 바닥/오른쪽 벽/천장/왼쪽 벽 모두에서 보이고 모서리 회전이 자연스럽다 (연속 프레임 확인).
- [ ] `tests/fixtures` 의 walk2+idle1 도형 캐릭터가 (a) 폴더 방식 (b) 설정 패널 파일 선택 방식 모두 로드·표시된다 (스크린샷).
- [ ] 새로고침/오프라인 후 사용자 추가 캐릭터·배경 설정이 유지된다 (IndexedDB). 내보내기→삭제→가져오기 왕복 성공.
- [ ] 배경 색/그라디언트/이미지 변경 반영, 가운데 영역은 비어 있다.
- [ ] 탭 시 jump, 길게 누르기 시 설정 패널(탭과 충돌 없음).
- [ ] `out/demo.mp4`: 1179x2556, 30fps, 10~15초, 첫·마지막 프레임 이음새 없음(ffprobe + 픽셀 비교로 확인), 시드 고정 재현 가능.
- [ ] `index.html` 단일 파일(외부 요청 0, 오프라인 동작), 콘솔 에러/경고성 에러 0.
- [ ] `sprites/_template/guide.png` 256x256 투명 + 기준선, README.md 한국어 완비, 저작권 제약 준수(기존 캐릭터 모방·웹 이미지 다운로드 없음).

---
---
# PHASE 2 — 공유 링크 + 아이폰 홈 화면 앱 + GitHub Pages 배포 (2026-10-31 시작)

> 위 §1~§6 은 1단계(완료·승인) 기록이며 **그대로 유효**하다 (구조 `src/ → build.mjs → index.html`, 직접 편집 금지, `window.EW` 전역 네임스페이스, 기존 테스트 유지). 아래는 2단계 추가분. 1단계 소유권(§4)은 같은 파일에 대해 그대로 이어진다 (ui.js/ui.css/io.js/store.js/README.md = A, main.js/shell.html/build.mjs/package.json/engine 계열 = B). 충돌 시 이 2단계 표가 우선.
> **분량: Dev-B ≈ 60% / Dev-A ≈ 40%** (남은 사용량 기준). A 파트도 혼자 완결: "만들고 보내는 쪽 + 안내 + 배포 + 문서", B 파트: "받고 가져오는 쪽 + 앱 설치(PWA) + 오프라인 + E2E".

## P2-1. 목표
폰에서 넣은 캐릭터를 링크 하나로 아이폰 친구에게 준다. 받는 사람은 링크를 누르면 즉시 캐릭터(+배경)가 들어간 상태로 앱이 돌아가고, "홈 화면에 추가" 한 번이면 전체화면 앱이 된다(홈 화면 아이콘으로 열어도 캐릭터가 있다).
저작권 제약 유지: 기존 작품 캐릭터 그리기·모방·웹 이미지 다운로드 금지. repo 에는 오리지널 데모(slime, ghost)만. 아이콘도 데모 캐릭터를 코드로 렌더해서 만든다.
`index.html` 단일 파일 원칙은 "앱 본체는 단일 파일, 설치용 부속(sw.js, manifest, icons)만 별도 파일"로 완화한다. `file://` 에서 열어도 콘솔 에러 0 (SW 등록은 http(s) 에서만 시도).

## P2-2. 외부 서비스 상수 (B 가 `src/config.js` 로 제공 — 공개용 키라 코드에 넣어도 됨)
```js
EW.config = {
  SUPABASE_URL: 'https://vrszlmkrfsqctqxzcsjh.supabase.co',
  SUPABASE_KEY: 'sb_publishable_fykX8dyjJEtzBkelZHyRYA_UsYBtOdm',   // apikey + Authorization: Bearer 둘 다
  BUCKET: 'edge-walkers-packs',
  PACK_ID_RE: /^[A-Za-z0-9_-]{8,32}$/,
  SHARE_BASE: 'https://456rtyfgh.github.io/edge-walkers/',          // 링크 = SHARE_BASE + '?pack=' + id
  LIMITS: { maxBytes: 8*1024*1024, maxChars: 20, maxFramesPerAction: 8, minDim: 16, maxDim: 1024, maxFrameBytes: 1.5*1024*1024, maxNameLen: 40 },
  CLAMP: { scale:[0.3,3], speed:[10,300], fps:[1,30], count:[1,6] },
  packUrl(id)   // SUPABASE_URL+'/storage/v1/object/public/'+BUCKET+'/packs/'+id+'.json'
  uploadUrl(id) // SUPABASE_URL+'/storage/v1/object/'+BUCKET+'/packs/'+id+'.json'
}
```
Storage 규칙(이미 설정됨): 업서트 없음·덮어쓰기/삭제 불가·json 만·최대 8MB·`POST` 업로드(Content-Type: application/json). **테스트 팩 id 는 반드시 `test` 로 시작.** 서비스 롤/secret 키는 어디에도 쓰지 않는다.

## P2-3. 팩 형식 (A 가 만들고 B 가 검증·가져온다 — 1단계 내보내기 형식의 상위 호환)
```jsonc
{
  "version": 1,                 // 필수, 정수 1
  "packId": "k3J9xQ2mPz7A",     // 필수, PACK_ID_RE, 파일명 id 와 동일해야 함
  "createdAt": "2026-10-31T...Z",
  "characters": [               // 1단계 EW.io.exportChars 의 characters 항목과 동일 (그 외 키 무시)
    { "id":"u_ab12cd34", "name":"...", "scale":1, "speed":60, "fps":8, "count":1,
      "actions": { "walk":["data:image/png;base64,..."], "idle":[...], "look":[...] /* 선택 액션은 없으면 키 생략 */ } }
  ],
  "bg": null | { "type":"color|gradient|image", "color":"#rrggbb", "color2":"#rrggbb", "fit":"cover", "image": null | "data:image/(png|webp);base64,..." }
}
```
- 이미지는 **data:image/png 또는 data:image/webp(base64)만** 허용 (jpeg 등은 A 가 업로드 전 canvas 로 PNG/WebP 재인코딩).
- 그리는 쪽(A)은 항상 위 규격으로, 읽는 쪽(B)은 **절대 신뢰하지 않고** 검증한다 (HTML 주입 금지: 이름 등 텍스트는 `textContent` 만, 받은 값을 innerHTML 에 넣지 않는다).

## P2-4. 공통 인터페이스

### 4.1 B 제공 (A 가 사용)
```js
// src/config.js : EW.config (위)                    ← BUILD 첫 단계에서 B 가 먼저 제공
// src/toast.js  : EW.toast(msg:string, kind?:'info'|'ok'|'error', ms?=3500) -> void   // textContent 만 사용, 최상위 z-index, 스타일은 toast.js 가 자체 주입(ui.css 안 건드림)
// src/pack.js   : EW.packs = {
//   validatePack(obj, expectedId?) -> { ok:boolean, errors:string[], pack:NormalizedPack|null }   // 스키마·한도·data URL MIME·매직바이트·클램프 (async 필요하면 Promise 로 — 호출측은 await 로 통일)
//   fetchPack(id) -> Promise<object>                  // 실패 시 Error.code: 'bad-id'|'offline'|'not-found'|'too-large'|'bad-json'|'network'
//   importPack(obj, {onlyOnce=true}) -> Promise<{status:'added'|'duplicate'|'invalid', added:string[], bgApplied:boolean, errors:string[]}>
//   importFromLocation() -> Promise<{status:'none'|'added'|'duplicate'|'error', count?:number, code?:string}>   // main.js 부팅 시 호출
//   friendlyError(code) -> string                     // 한국어 안내문
// }
```
### 4.2 A 제공 (B 가 사용)
```js
// src/share.js : EW.share = {
//   buildPack(ids:string[]|null, includeBg:boolean, opts?:{idPrefix?:string}) -> Promise<{pack:object, id:string, bytes:number}>
//        // ids null = 사용자 캐릭터 전부. 비PNG/WebP 재인코딩. id = idPrefix + crypto 랜덤 12자 (총 8~32자, PACK_ID_RE 통과)
//   uploadPack(pack, onProgress?) -> Promise<void>     // POST EW.config.uploadUrl(pack.packId), apikey+Authorization 헤더. 8MB 초과는 업로드 전 Error, 409(중복)이면 id 재생성 후 1회 재시도, 오류 메시지 한국어
//   createLink({ids, includeBg, idPrefix, onProgress:(msg)=>void}) -> Promise<{id:string, url:string, bytes:number}>   // build → self-check(EW.packs.validatePack, 있을 때) → upload. url = EW.config.SHARE_BASE+'?pack='+id
//   shareUrl(url, text?) -> Promise<'shared'|'copied'|'cancelled'|'manual'>   // navigator.share → 실패 시 clipboard.writeText → 그것도 실패면 'manual'(UI 가 링크를 표시)
// }
// src/a2hs.js  : EW.a2hs = { init():void, shouldShow():boolean }   // main.js 가 (!record && !hideUI) 일 때 부팅 후 호출
```
### 4.3 저장 키 (충돌 방지)
- `Settings.importedPacks: string[]` — IndexedDB `settings` 에 저장 (B 가 `EW.store.setSettings({importedPacks})` 사용). A 는 `store.js` 의 `getSettings`/`setSettings` 가 **알 수 없는 키를 보존**하고 기본값 `importedPacks: []` 를 갖도록 보장 (필요 시 최소 수정). 가져온 뒤 사용자가 캐릭터를 지워도 같은 팩은 다시 안 들어온다(의도).
- `localStorage['ew.a2hs.dismissed']='1'` (A 소유, "다시 안 보기"). `localStorage['ew.lastPack']` (B 소유).

### 4.4 UI 훅 (A 의 ui.js 가 구현)
설정 패널의 내보내기/가져오기 근처에 **"공유 링크 만들기"** 버튼 → 시트: 사용자 캐릭터 체크리스트(기본 전부 체크, 0개면 안내+버튼 비활성) + "현재 배경 포함" 체크 → "링크 만들기" → 진행 메시지(`팩 만드는 중…` / `올리는 중…` / `완료!`) → 결과에 **링크 텍스트 표시 + [공유하기] [링크 복사]**.
**iOS 주의**: `navigator.share` 는 사용자 제스처가 필요한데 업로드 `await` 뒤엔 만료될 수 있다. 완료 후 자동 시도 → 실패(NotAllowedError)하면 [공유하기] 버튼(새 제스처)으로 `shareUrl` 재호출. 모든 사용자 노출 문구 한국어. `ew:tap` 규칙(§3.3) 불변 — 시트 위 터치가 엔진 탭으로 새지 않게.

## P2-5. 파트별 담당 파일 (겹치지 않음)

### 파트 B (Dev-B, ≈60%) — "받기·가져오기·PWA·오프라인·E2E"
| 파일 | 내용 |
|---|---|
| `src/config.js`, `src/toast.js` | §P2-2, §4.1. **BUILD 첫 단계에서 A 가 쓸 수 있게 먼저** (+ build.mjs 순서 반영) |
| `src/pack.js` | 팩 fetch(타임아웃 20s, 오프라인/404/용량 구분), 검증(스키마, version, packId=URL id, 캐릭터·프레임 수 한도, PNG/WebP 매직바이트 + `createImageBitmap` 로 프레임 크기 동일, `store.validateDef`, 이름 길이·제어문자 정리, 숫자 CLAMP), 가져오기(중복 packId 확인 → `store.saveUserChar` 새 `u_` id 부여 → 배경 `setSettings({bg})`, `enabledIds` 가 null 이 아니면 새 id 추가 → **마지막에** importedPacks 기록), 부분 실패 시 롤백 |
| `src/main.js` | 부팅 시 `?pack` 처리(`EW.packs.importFromLocation()` → 성공하면 `reload()` 후 토스트 "캐릭터 N개 받았어요", 중복이면 조용히 또는 "이미 받은 팩이에요", 오프라인·없음·손상은 친절한 한국어 토스트), 동적 매니페스트 갱신(§P2-6), SW 등록(http/https 한정), `EW.a2hs.init()` 호출, **주소의 `?pack` 을 지우지 않는다**, 홈 화면 앱인데 캐릭터·pack 이 전혀 없으면 "링크 붙여넣기" 입력 폴백 |
| `src/shell.html` | `<link rel="manifest">`, `apple-touch-icon`(180), `apple-mobile-web-app-title`, theme-color, 기존 `apple-mobile-web-app-capable` / `black-translucent` 유지, safe-area 처리 유지 |
| `build.mjs` | JS 순서: `config → toast → store → loader → io → pack → share → demo-chars → path → behavior → engine → a2hs → ui → main` (share/a2hs 가 아직 없으면 기존처럼 경고 후 건너뜀). index.html 재생성 |
| `manifest.webmanifest` | name/short_name, `display:"standalone"`, `start_url:"./"`, `scope:"./"`, `id`, background/theme `#1b1f2a`, icons(192/512, maskable 포함) |
| `sw.js` | 앱 셸(`./`, index.html, manifest, icons, sprites/manifest.json + sprites PNG) precache, 내비게이션은 **쿼리(`?pack`)를 무시하고 index.html 캐시 응답**(오프라인 재실행), 팩 JSON 별도 런타임 캐시, Supabase POST 는 가로채지 않음, 버전 문자열로 구캐시 정리, `manifest.webmanifest?pack=` 요청에 start_url 을 바꿔 응답 |
| `icons/apple-touch-icon.png`(180x180), `icons/icon-192.png`, `icons/icon-512.png`, `scripts/make-icons.mjs` | 오리지널 데모 슬라임을 EW.demo 코드로 렌더(Playwright canvas → PNG), 단색 배경, 모서리 둥글림 없음(iOS 가 마스크) |
| `tests/pack.spec.mjs` | **Playwright WebKit + iPhone 뷰포트** E2E: (a) Node 에서 픽스처 팩을 `test…` id 로 업로드 → (b) 빈 새 컨텍스트에서 `?pack` 열기 → 캐릭터 표시 → (c) 재방문 중복 없음 → (d) `context.setOffline(true)` 재실행 동작 → (e) 매니페스트 start_url 에 pack 유지, 콘솔 에러 0. 악성 팩(jpeg·svg data URL, `<img onerror>` 이름, 초대형, packId 불일치, 없는 id) 거부 케이스 포함 |
| `package.json` | scripts 에 `test:pack`, `icons`; `npm test` 가 기존 + pack 테스트까지 수행 |
| `scripts/install-browser.mjs` | WebKit 설치 지원 추가(필요 시) |
| `docs/ios-pwa-notes.md` | iOS 홈 화면 앱 저장소 분리·start_url 동작 **조사 결과, 채택한 방법과 한계**(실기기 미검증 부분은 그렇다고 명시) |

### 파트 A (Dev-A, ≈40%) — "보내기·안내·배포·문서"
| 파일 | 내용 |
|---|---|
| `src/share.js` | §4.2 전부. 팩 빌드(비PNG/WebP 재인코딩, 배경 Blob→dataURL), 8MB 사전 검사(초과 시 "용량이 너무 커요: 캐릭터를 줄이거나 배경을 빼 보세요"), Supabase 업로드(`fetch` POST, 두 헤더), 진행 콜백, 한국어 오류(오프라인·401/403·413·409·네트워크), `crypto.getRandomValues` 로 12자 id |
| `src/ui.js`, `src/ui.css` | §4.4 공유 UI (버튼·선택 시트·진행/결과·복사/공유). 접근성(버튼 라벨, 포커스), 기존 패널 동작·`ew:tap` 불변 |
| `src/a2hs.js` | iOS Safari(비 standalone: `navigator.standalone !== true`, iPadOS 의 MacIntel+touch 포함) 첫 방문 "공유 버튼 → 홈 화면에 추가" 오버레이(그림은 인라인 SVG/CSS, 한국어), 닫기 + "다시 안 보기"(localStorage), 인앱 브라우저(카카오톡·인스타 등)면 "Safari 로 열어 주세요" 변형, 토스트와 겹치지 않게 지연 표시, `file://`·record·hideUI 에선 안 뜸 |
| `src/store.js` | §4.3 unknown 키 보존 + `importedPacks` 기본값 (최소 수정, 기존 테스트 통과 유지) |
| `src/io.js` | (필요 시) share.js 가 재사용할 `blobToDataUrl` 등 헬퍼 노출. 내보내기 형식 불변 |
| `tests/share.spec.mjs` | 설정 패널에서 픽스처 캐릭터로 "공유 링크 만들기" UI 흐름 → `idPrefix:'test'` 로 업로드 → 공개 GET 으로 내려받아 `EW.packs.validatePack` 통과, 링크 형식(`?pack=` + 정규식), 오프라인 시 한국어 오류, 8MB 초과 거부 |
| `tests/a2hs.spec.mjs` | iPhone UA(WebKit) 비 standalone 에서 오버레이 노출, 닫기/다시 안 보기 후 재방문 미노출, standalone 모의 시 미노출 |
| `.gitignore`, `scripts/check-secrets.mjs` | `node_modules/`, `out/*.mp4`, `tests/shots*/`, `.watch/`, `*.token`, `.DS_Store`, `.plan-*`. 커밋 대상 전체를 스캔해 토큰 파일 내용·`ghp_`/`github_pat_`/`sb_secret`/`service_role` 패턴 발견 시 실패 (publishable 키는 허용) |
| `scripts/deploy.mjs` | check-secrets → build → 로컬 git init/커밋 → API 로 공개 repo `456rtyfgh/edge-walkers` 생성(있으면 재사용) → **토큰은 `~/Documents/.tools/secrets/github.token` 에서 읽어 메모리에서만 사용, 로그·git config·원격 URL 에 저장 금지**(`git -c http.extraHeader=… push` 일회성) → `POST /repos/456rtyfgh/edge-walkers/pages {"source":{"branch":"main","path":"/"}}` → 403 등 실패 시 **다른 우회 없이 정확한 상태·응답 본문을 출력하고 중단** → 성공 시 `https://456rtyfgh.github.io/edge-walkers/` 200 폴링(최대 약 10분) |
| `README.md` | "친구에게 공유하기" 섹션(보내는 법·받는 법·홈 화면에 추가·팩은 링크를 아는 누구나 볼 수 있고 삭제 불가·용량 한도), "폰 배경화면으로 쓰기"의 호스팅/홈 화면 설명 갱신(iOS 저장소 분리 한계 정직하게), 개발 섹션에 새 명령 |

## P2-6. iOS 홈 화면 앱 + `?pack` 유지 전략 (B 소유, 조사 후 확정 — 근거는 `docs/ios-pwa-notes.md`)
iOS 는 Safari 와 홈 화면 앱의 저장소(IndexedDB·localStorage·쿠키)가 분리되어 있어 **홈 화면 앱 첫 실행은 빈 저장소**다. 그래서 ① 시작 URL 에 pack 을 실어 두거나 ② 앱 안에서 다시 받을 수 있어야 한다. 확실성 순으로 다층 적용:
1. 페이지 로드 직후 `<link rel="manifest">` 를 **현재 URL(`?pack` 포함)을 `start_url` 로 하는 동적 매니페스트(Blob URL)** 로 교체 (iOS 16.4+ 는 홈 화면 추가 시 매니페스트 사용). 아이콘·scope 는 절대 URL.
2. `?pack` 을 주소창에서 지우지 않는다 → 매니페스트를 안 읽는 경로에서도 "현재 페이지 URL" 이 시작 URL 이 된다.
3. SW 가 `manifest.webmanifest?pack=<id>` 요청에 start_url 을 바꾼 응답을 생성 (SW 제어 이후 경로).
4. 빈 상태 홈 화면 앱 최후 폴백: "친구가 준 링크 붙여넣기" 입력 → `?pack` 파싱 → 가져오기.
→ B 는 WebSearch 로 실제 iOS(16.4~18) 동작(Blob 매니페스트 허용 여부, start_url 무시 여부)을 조사해 1~4 중 효과 없는 층을 정직하게 표시한다. Playwright 로 검증 가능한 것(완료기준 (e))은 테스트하고, 실기기에서만 확인 가능한 것은 "실기기 미검증"으로 적는다.

## P2-7. 작업 순서
1. **[BUILD, B 먼저]** `src/config.js`, `src/toast.js`, `build.mjs` 순서 갱신, `shell.html` 메타 → `node build.mjs` 확인. A 는 그동안 `.gitignore`, `check-secrets`, `store.js` 수정, `share.js` 착수 (config 는 §P2-2 계약대로 가정).
2. B: `pack.js` → `main.js` 연동 → manifest/sw/icons → `pack.spec`. A: `share.js` → `ui.js` 공유 UI → `a2hs.js` → `share.spec`/`a2hs.spec` → `README.md`.
3. 통합: B 가 `node build.mjs` 후 전체 테스트(`engine`, `settings`, `pack`, `share`, `a2hs`) 실행.
4. **배포는 마지막**: 양쪽 리뷰 승인 후 A 가 `scripts/deploy.mjs` 실행. Pages 활성화가 권한 문제로 실패하면 정확한 에러를 최종 보고에 적고 멈춘다. 배포 후 B 가 실제 Pages URL 로 `?pack` 왕복(WebKit)을 1회 확인.
5. 인터페이스 변경은 이 문서 P2 절을 고치고 상대 리뷰에서 알린다. 상대 파일은 수정하지 않는다.

## P2-8. 완료 기준
- [ ] (a) 테스트 팩(`test…` id)을 만들어 Supabase 에 업로드, 공개 GET 으로 동일 내용 확인.
- [ ] (b) Playwright **WebKit + 아이폰 뷰포트**의 **저장소가 빈 새 컨텍스트**에서 `?pack=<id>` 를 열면 캐릭터가 엔진에 표시되고 "캐릭터 N개 받았어요" 토스트가 뜬다. 배경도 적용.
- [ ] (c) 같은 링크를 다시 열어도(새로고침/재방문) 캐릭터가 중복되지 않는다.
- [ ] (d) 오프라인(`setOffline(true)`) 재실행에서도 앱·받은 캐릭터가 동작하고 콘솔 에러 0.
- [ ] (e) 매니페스트(`standalone`) `start_url` 에 `?pack=<id>` 가 유지된다, apple-touch-icon 180x180·`apple-mobile-web-app-capable`·`black-translucent` 존재.
- [ ] 악성/손상 팩(비허용 MIME, SVG, 이름에 HTML, 초대형, packId 불일치, 없는 id, 오프라인)은 거부되고 한국어 안내, 받은 값이 HTML 로 주입되지 않음.
- [ ] 공유 UI: 선택·배경 포함 → 링크 생성 → 공유/복사/표시 폴백, 모든 메시지 한국어. iOS 안내 오버레이 닫기·다시 안 보기 동작.
- [ ] 기존 테스트(`engine.spec`, `settings.spec`) 전부 통과, 모든 페이지 콘솔 에러 0, `file://` 에서도 에러 0.
- [ ] repo `456rtyfgh/edge-walkers` 공개 생성·푸시(비밀값 0, `.git/config` 에 토큰 없음), Pages 활성화(권한 문제 시 정확한 에러 기록 후 중단), `https://456rtyfgh.github.io/edge-walkers/` 200 확인.
- [ ] README "친구에게 공유하기" 섹션, `docs/ios-pwa-notes.md`, repo 에는 오리지널 캐릭터만(저작권 제약 준수).

## P2-9. PLAN-REVIEW 확정 보정 (A, 2026-10-31) — 위 표와 충돌하면 이 절이 우선
분량 60/40 및 파일 소유권은 그대로 유지. 아래는 모호함 제거용 계약 보강.
1. **토스트 유실 방지(B)**: 가져오기 성공 후 `reload()` 하면 토스트가 사라지고, 재로드 시 `?pack` 때문에 다시 'duplicate' 판정 → "이미 받은 팩이에요"가 덮어쓴다. 규약: 성공 시 `sessionStorage['ew.toast']='캐릭터 N개 받았어요'` 저장 후 reload, 부팅 때 이 값을 1회 표시·삭제하고 그 부팅의 duplicate 토스트는 생략. (reload 없이 `onChange()` 로 엔진 재구성해도 됨 — 어느 쪽이든 토스트는 정확히 1번.) "이미 받은 팩이에요"는 세션당 1회만.
2. **업로드 중복 응답(A)**: Supabase Storage 는 중복 객체에 HTTP 400 + 본문 `{"statusCode":"409",...,"error":"Duplicate"}` 를 줄 수 있다. share.js 는 status 409 **또는** (400 이고 본문에 `Duplicate`/`409`) 를 중복으로 보고 새 id 로 1회 재시도. 401/403 은 "업로드 권한이 없어요" 계열 한국어 문구.
3. **config 의존(A)**: share.js·a2hs.js 는 `EW.config` 가 없으면 조용히 비활성(콘솔 에러 0), 공유 버튼은 `disabled`. `EW.packs` 없을 때 self-check 는 건너뛴다. 테스트 id 접두 `test` + 12자 = 16자(정규식 통과).
4. **share ↔ ui 계약(A 내부)**: `createLink` 의 `onProgress` 메시지는 정확히 `팩 만드는 중…` → `올리는 중…` → `완료!`. 결과 링크는 `<input readonly>` 또는 `textContent` 로 표시(innerHTML 금지).
5. **SW/배포 경로(B↔A)**: Pages 는 `/edge-walkers/` 하위 경로이므로 모든 URL(SW 등록, manifest `start_url/scope/id`, 아이콘, precache 목록)은 **상대경로**(`./`)만 쓰고 `/` 절대경로 금지. 동적 매니페스트(Blob)만 `location.origin+pathname` 기반 절대 URL 사용. `SHARE_BASE` 는 배포 URL 고정이며 로컬 테스트에서도 링크 문자열만 생성(이동하지 않음). 테스트의 `?pack` 열기는 로컬 서버 `http://localhost:5173/?pack=<id>` 사용.
6. **배포 선행 조건(A deploy.mjs)**: 푸시 전 필수 파일 존재 확인 — `index.html, manifest.webmanifest, sw.js, icons/apple-touch-icon.png, icons/icon-192.png, icons/icon-512.png, sprites/manifest.json, sprites/slime/, sprites/ghost/`; 없으면 B 산출물 미완으로 중단. `out/*.mp4`·`tests/shots*`·`node_modules` 는 커밋 제외(README 의 영상 링크는 repo 에 없는 파일을 가리키지 않게 "직접 생성" 안내). Pages 응답 200 폴링은 `index.html` 외에 `manifest.webmanifest`·`sw.js` 도 200 확인.
7. **토큰 취급(A)**: 토큰은 어떤 출력·에러 메시지·`ps` 인자에도 노출되지 않게 한다(헤더는 환경변수/stdin 경유, 에러 로그는 토큰 마스킹). 푸시 후 `.git/config` 와 `git remote -v` 에 토큰 없음을 스크립트가 grep 으로 검증.
8. **iOS 인앱/standalone 판별 공유(A)**: `EW.a2hs.shouldShow()` 는 `navigator.standalone === true` 또는 `matchMedia('(display-mode: standalone)')` 이면 false. B 의 "링크 붙여넣기 폴백"은 standalone 이고 캐릭터·`?pack` 모두 없을 때만 표시(A 오버레이와 상호 배타).
9. **테스트 정리**: 네트워크 테스트(`share/pack/a2hs.spec`)는 업로드한 `test…` 팩을 지울 수 없으므로 실행당 업로드 수를 최소화(공용 픽스처 팩 1개 재사용 가능, 8MB 초과 테스트는 업로드 없이 사전 검사에서 거부 확인). `npm test` 는 순차 실행.

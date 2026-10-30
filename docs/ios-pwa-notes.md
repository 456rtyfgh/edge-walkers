# iOS 홈 화면 앱 + `?pack` 유지 — 조사 결과와 채택한 방법

## 문제
iOS 의 홈 화면 앱(standalone)은 Safari 와 **저장소(IndexedDB·localStorage·쿠키)가 분리**되어 있다. 친구가 Safari 에서 `?pack=…` 링크로 캐릭터를 받아도, 홈 화면 아이콘으로 처음 실행하면 저장소가 비어 있다. 따라서 (1) 시작 URL 에 `?pack` 이 실려 있어서 앱이 첫 실행 때 다시 받거나, (2) 앱 안에서 직접 받을 수 있어야 한다.

## 조사 요약 (WebSearch, 2026-10-31)
| 사실 | 근거 | 확실성 |
|---|---|---|
| Safari 와 홈 화면 앱의 저장소는 분리 | PWA 가이드 글, Stack Overflow (쿠키 비공유) | 높음 |
| iOS Safari 는 오래전부터 "홈 화면에 추가" 시 **현재 페이지 URL** 을 시작 URL 로 저장하고 매니페스트 `start_url` 을 무시한다는 보고 (2017 Stack Overflow) | 해결책으로 "추가 전에 주소를 원하는 URL 로 바꿔 두기"가 제시됨 | 구버전 기준, 최신 iOS 에서 바뀌었을 수 있음 |
| iOS 16.4+ 는 매니페스트(`start_url`, `scope`)를 읽는다는 2023 보고 | naildrivin5 블로그 | 중간 |
| 쿼리를 `start_url` 에 넣은 **Blob 매니페스트** 방식이 Android/iOS 에서 된다는 글 | limehome 엔지니어링 블로그 (버전 미기재) | 낮음~중간 |
| iOS 17.4(EU) 에서 standalone 이 무시되는 보고 | 단일 블로그 | 낮음, EU 한정 가능성 |

Apple 공식 문서나 WebKit 버그로 "Blob 매니페스트의 start_url 을 홈 화면 추가 시 사용한다"를 **확정하는 자료는 찾지 못했다.** 그래서 어느 한 가지에 의존하지 않고, 어느 쪽 동작이든 `?pack` 이 살아남도록 겹겹이 대비했다.

## 채택한 방법 (모두 `src/main.js`, `sw.js`, `src/pack.js`)
1. **동적 매니페스트(Blob)** — 페이지 로드 직후 `<link rel="manifest">` 를 `start_url = <앱 주소>/?pack=<id>` 인 Blob URL 매니페스트로 교체. iOS 가 매니페스트를 읽는 경우(16.4+) 이 값이 쓰인다. Blob 생성이 안 되면 `manifest.webmanifest?pack=<id>` 로 폴백.
2. **주소의 `?pack` 을 지우지 않음** — iOS 가 매니페스트를 무시하고 "현재 페이지 URL" 을 저장하는 경우에도 `?pack` 이 시작 URL 에 포함된다. (`history.replaceState` 로 정리하지 않는다.)
3. **서비스 워커의 `manifest.webmanifest?pack=` 응답** — SW 가 제어하는 상태에서 쿼리에 맞춘 `start_url` 을 돌려준다 (정적 매니페스트는 `./`).
4. **"링크 붙여넣기" 최후 폴백** — 홈 화면 앱(`navigator.standalone` 또는 `display-mode: standalone`)이 빈 저장소(내 캐릭터·받은 팩 없음)에 `?pack` 도 없이 열리면, 링크(또는 팩 ID)를 붙여넣는 창을 띄워 가져온다. "나중에" 를 누르면 다시 묻지 않는다.

받은 팩은 `Settings.importedPacks` 에 기록되어 같은 링크로 다시 열어도 중복되지 않는다. 오프라인에서는 서버 요청 전에 기록을 먼저 확인하므로, 이미 받은 팩 링크는 오프라인에서도 조용히 열린다.

## 자동 테스트로 확인한 것 (Playwright WebKit, iPhone 14 프로필) — `tests/pack.spec.mjs`
- 빈 프로필에서 `?pack=<id>` → 캐릭터·배경 적용, 토스트, 재방문 중복 없음.
- 동적 매니페스트와 SW 생성 매니페스트 모두 `start_url` 에 `?pack=<id>` 유지, `display: standalone`.
- `apple-mobile-web-app-capable=yes`, `status-bar-style=black-translucent`, `apple-touch-icon` 180x180.
- 서비스 워커 제어 상태에서 `setOffline(true)` 후 재실행 시 앱·받은 캐릭터 동작.
- 악성 팩(SVG/JPEG/외부 URL/MIME 위조/크기 불일치/초과/packId 불일치/이름의 HTML) 거부 또는 무해 처리.

## 실기기 미검증 (정직하게)
- iPhone 에서 **"홈 화면에 추가" 후 아이콘 실행 시 실제로 `?pack` 으로 시작하는지**는 시뮬레이터/실기기가 없어 확인하지 못했다. 1~3 중 어느 층이 iOS 버전별로 먹히는지는 직접 확인이 필요하다. 안 먹히는 경우에도 4번 폴백으로 링크를 붙여넣어 받을 수 있다.
- Playwright WebKit 은 임시 컨텍스트에서 IndexedDB 에 Blob 저장이 막혀 있어(실제 Safari 는 정상), 테스트는 비어 있는 새 프로필 폴더(persistent context)를 매번 만들어 "빈 저장소"를 재현한다.
- 홈 화면 앱은 설치 시점의 매니페스트/URL 을 저장하므로, 이미 설치한 뒤에는 갱신이 안 될 수 있다 (삭제 후 다시 추가).

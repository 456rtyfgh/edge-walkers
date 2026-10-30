// a2hs.js — iOS Safari 첫 방문 시 "공유 버튼 → 홈 화면에 추가" 안내 오버레이
(function () {
  const EW = (window.EW = window.EW || {});
  const KEY = 'ew.a2hs.dismissed';
  const DELAY_MS = 3500; // 가져오기 토스트와 겹치지 않게 늦게 띄운다
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 무시 */ } },
  };
  const ss = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* 무시 */ } },
  };
  const ua = () => navigator.userAgent || '';
  const isIOS = () => /iPhone|iPad|iPod/.test(ua()) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = () => navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  // 카카오톡·인스타·페이스북·라인·네이버 등 인앱 브라우저는 "홈 화면에 추가"가 없다 (UA 에 Safari/ 토큰도 없음)
  const isInApp = () => /KAKAOTALK|Instagram|FBAN|FBAV|FB_IAB|Line\/|NAVER\(|DaumApps|Snapchat|; wv\)/i.test(ua()) || (isIOS() && !/Safari\//.test(ua()));
  const params = () => new URLSearchParams(location.search);

  function shouldShow() {
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return false;
    const p = params();
    if (p.get('record') === '1' || p.get('hideUI') === '1') return false;
    if (!isIOS() || isStandalone()) return false;
    if (ls.get(KEY) === '1' || ss.get('ew.a2hs.closed') === '1') return false;
    return true;
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';
  function shareIcon() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '22'); svg.setAttribute('height', '22');
    svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('class', 'ew-a2hs-ico');
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', 'M12 3v12M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1');
    p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor'); p.setAttribute('stroke-width', '2');
    p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
    svg.append(p);
    return svg;
  }
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  let shown = null;
  function hide(forever) {
    if (forever) ls.set(KEY, '1');
    ss.set('ew.a2hs.closed', '1');
    if (shown) { shown.remove(); shown = null; }
  }

  function show() {
    if (shown) return;
    const inApp = isInApp();
    const box = el('div', 'ew-a2hs-box');
    box.append(el('h2', 'ew-a2hs-title', inApp ? 'Safari 로 열어 주세요' : '홈 화면에 추가하면 앱처럼 써요'));
    if (inApp) {
      box.append(el('p', 'ew-a2hs-p', '지금 보고 있는 앱 안의 브라우저에서는 홈 화면에 추가할 수 없어요. 오른쪽 위(또는 아래) 메뉴에서 “Safari 로 열기”를 눌러 주세요.'));
    } else {
      const ol = el('ol', 'ew-a2hs-steps');
      const s1 = el('li'); s1.append('아래(또는 위) 막대의 ', shareIcon(), el('b', null, ' 공유'), ' 버튼을 누르고');
      const s2 = el('li'); s2.append(el('b', null, '“홈 화면에 추가”'), '를 고른 뒤');
      const s3 = el('li'); s3.append(el('b', null, '“추가”'), '를 누르면 끝!');
      ol.append(s1, s2, s3);
      box.append(ol, el('p', 'ew-a2hs-p small', '홈 화면 아이콘으로 열면 주소창 없이 전체화면으로 돌아가요.'));
    }
    const row = el('div', 'ew-a2hs-row');
    const never = el('button', 'ew-btn', '다시 안 보기'); never.type = 'button';
    const ok = el('button', 'ew-btn primary', '닫기'); ok.type = 'button'; ok.setAttribute('aria-label', '안내 닫기');
    never.addEventListener('click', () => hide(true));
    ok.addEventListener('click', () => hide(false));
    row.append(never, ok);
    box.append(row);
    const wrap = el('div', 'ew-a2hs');
    wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-label', '홈 화면에 추가 안내');
    wrap.append(box);
    wrap.addEventListener('pointerdown', (e) => e.stopPropagation());
    document.body.append(wrap);
    shown = wrap;
    ok.focus({ preventScroll: true });
  }

  function init() {
    if (!shouldShow()) return;
    setTimeout(() => { if (shouldShow()) show(); }, DELAY_MS);
  }

  EW.a2hs = { init, shouldShow, show, hide };
})();

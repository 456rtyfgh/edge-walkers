// toast.js — 최상위 토스트. 받은 문자열은 textContent 로만 넣는다.
(function () {
  const EW = (window.EW = window.EW || {});
  let el = null, timer = 0;

  function ensure() {
    if (el) return el;
    const st = document.createElement('style');
    st.textContent =
      '#ew-toast2{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 14px);transform:translate(-50%,-12px);' +
      'max-width:min(86vw,420px);padding:10px 16px;border-radius:14px;background:rgba(20,22,32,.92);color:#fff;' +
      'font:600 14px/1.4 -apple-system,system-ui,"Apple SD Gothic Neo",sans-serif;text-align:center;z-index:2147483000;' +
      'opacity:0;pointer-events:none;transition:opacity .25s,transform .25s;box-shadow:0 6px 24px rgba(0,0,0,.35)}' +
      '#ew-toast2.show{opacity:1;transform:translate(-50%,0)}' +
      '#ew-toast2.ok{background:rgba(32,110,70,.95)}#ew-toast2.error{background:rgba(150,45,45,.95)}';
    document.head.appendChild(st);
    el = document.createElement('div');
    el.id = 'ew-toast2';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
    return el;
  }

  EW.toast = function (msg, kind, ms) {
    const t = ensure();
    t.textContent = String(msg == null ? '' : msg);
    t.className = (kind === 'ok' || kind === 'error' ? kind + ' ' : '') + 'show';
    clearTimeout(timer);
    timer = setTimeout(() => { t.classList.remove('show'); }, ms || 3500);
  };
})();

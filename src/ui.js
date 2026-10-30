// ui.js — 길게 누르기/톱니, 설정 패널(캐릭터 추가·수정·삭제, 배경, 내보내기/가져오기)
// 포인터 이벤트는 이 파일만 처리한다: 짧은 탭 → root 에 'ew:tap' {x,y}, 길게 누르기 → 패널 열기('ew:longpress')
(function () {
  const EW = (window.EW = window.EW || {});
  const LONG_MS = 600, MOVE_PX = 10;
  const ACTION_INFO = {
    walk: ['걷기', '필수 · 4장 권장 (최소 2)'],
    idle: ['멍때리기', '필수 · 2장 권장 (최소 1)'],
    look: ['두리번', '선택 · 2장'],
    sit: ['앉기', '선택 · 1~2장'],
    jump: ['점프', '선택 · 3장 (웅크림·공중·착지)'],
    sleep: ['잠자기', '선택 · 2장'],
  };
  const FALLBACK = { look: ['idle'], sit: ['idle'], jump: ['idle'], sleep: ['sit', 'idle'] };

  let ctx = null; // {root,getEngine,getAllDefs,onChange}
  let ui = null;  // DOM 참조
  let panelOpen = false;
  let editor = null; // 편집 중 상태
  let previewRAF = 0;

  // ───────── 유틸 ─────────
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const k in attrs || {}) {
      const v = attrs[k];
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'text') el.textContent = v;
      else if (v === false || v == null) continue;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
    return el;
  }
  const newId = () => 'u_' + Math.random().toString(36).slice(2, 10);
  const natSort = (files) => [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const urlCache = new Map();
  const urlOf = (blob) => { if (!urlCache.has(blob)) urlCache.set(blob, URL.createObjectURL(blob)); return urlCache.get(blob); };
  const bmpCache = new WeakMap();
  async function bmpOf(blob) {
    if (!bmpCache.has(blob)) bmpCache.set(blob, EW.store.decodeBlob(blob));
    return bmpCache.get(blob);
  }
  function download(blob, name) {
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  function toast(msg) {
    if (!ui) return;
    ui.toast.textContent = msg; ui.toast.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(() => ui.toast.classList.remove('show'), 3200);
  }

  // ───────── 초기화 ─────────
  function init(opts) {
    ctx = opts;
    const root = opts.root;
    root.classList.add('ew-ui-root');
    const gear = h('button', { class: 'ew-gear', type: 'button', 'aria-label': '설정 열기', onclick: () => open() }, '⚙');
    const panel = h('div', { class: 'ew-panel', role: 'dialog', 'aria-label': '설정', hidden: true });
    const toastEl = h('div', { class: 'ew-toast', role: 'status' });
    root.append(gear, panel, toastEl);
    ui = { root, gear, panel, toast: toastEl };
    bindPointer(root);
  }

  function bindPointer(root) {
    let st = null;
    const inChrome = (t) => t.closest && t.closest('.ew-panel, .ew-gear');
    root.addEventListener('pointerdown', (e) => {
      if (inChrome(e.target) || (e.pointerType === 'mouse' && e.button !== 0)) return;
      st = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, long: false };
      st.timer = setTimeout(() => {
        if (!st || st.moved) return;
        st.long = true;
        root.dispatchEvent(new CustomEvent('ew:longpress', { detail: { x: st.x, y: st.y } }));
        open();
      }, LONG_MS);
    });
    root.addEventListener('pointermove', (e) => {
      if (st && e.pointerId === st.id && !st.moved && Math.hypot(e.clientX - st.x, e.clientY - st.y) > MOVE_PX) {
        st.moved = true; clearTimeout(st.timer);
      }
    });
    const end = (e, cancel) => {
      if (!st || e.pointerId !== st.id) return;
      clearTimeout(st.timer);
      const s = st; st = null;
      if (cancel || s.long || s.moved) return; // 길게 눌러 연 경우·드래그는 탭이 아님
      if (panelOpen) { close(); return; }      // 패널 바깥(위쪽)을 누르면 닫기
      root.dispatchEvent(new CustomEvent('ew:tap', { detail: { x: e.clientX, y: e.clientY } }));
    };
    root.addEventListener('pointerup', (e) => end(e, false));
    root.addEventListener('pointercancel', (e) => end(e, true));
    root.addEventListener('contextmenu', (e) => { if (!inChrome(e.target)) e.preventDefault(); });
  }

  // ───────── 열기/닫기 ─────────
  function open() {
    if (!ctx || panelOpen) return;
    panelOpen = true;
    ui.panel.hidden = false;
    ui.root.classList.add('ew-open');
    showList();
  }
  function close() {
    if (!panelOpen) return;
    panelOpen = false;
    stopPreview();
    editor = null;
    ui.panel.hidden = true;
    ui.root.classList.remove('ew-open');
  }
  const isOpen = () => panelOpen;

  async function changed() { try { await ctx.onChange(); } catch (e) { console.warn('[edge-walkers] onChange 실패', e); } }

  // ───────── 목록 화면 ─────────
  async function showList() {
    stopPreview(); editor = null;
    const settings = await EW.store.getSettings();
    const defs = ctx.getAllDefs() || [];
    const enabled = (id) => !settings.enabledIds || settings.enabledIds.includes(id);

    const rows = defs.map((d) => {
      const thumb = h('canvas', { class: 'ew-thumb', width: 96, height: 96 });
      const src = (d.frames.idle || d.frames.walk || [])[0];
      if (src) thumb.getContext('2d').drawImage(src, 0, 0, 96, 96);
      const toggle = h('input', {
        type: 'checkbox', class: 'ew-switch', 'aria-label': d.name + ' 표시', checked: enabled(d.id),
        onchange: async (e) => {
          const all = defs.map((x) => x.id);
          const cur = (await EW.store.getSettings()).enabledIds || all;
          const next = e.target.checked ? [...new Set([...cur, d.id])] : cur.filter((x) => x !== d.id);
          await EW.store.setSettings({ enabledIds: next.length === all.length ? null : next });
          await changed();
        },
      });
      const badge = { builtin: '내장', folder: '폴더', user: '내 캐릭터' }[d.source] || '';
      return h('div', { class: 'ew-row' },
        thumb,
        h('div', { class: 'ew-grow' }, h('div', { class: 'ew-name', text: d.name }), h('div', { class: 'ew-sub', text: `${badge} · ${d.count}마리` })),
        h('button', { type: 'button', class: 'ew-btn small', onclick: () => startEdit(d) }, '설정'),
        toggle);
    });

    const bgSection = backgroundSection(settings);
    const importInput = h('input', {
      type: 'file', accept: 'application/json,.json', hidden: true,
      onchange: async (e) => {
        const f = e.target.files[0]; e.target.value = '';
        if (!f) return;
        const r = await EW.io.importChars(f);
        await changed();
        toast(`가져오기: ${r.added.length}개 추가${r.errors.length ? ' · 오류 ' + r.errors.join(' / ') : ''}`);
        showList();
      },
    });

    render(
      header('설정', null),
      h('div', { class: 'ew-body' },
        h('h3', { text: '캐릭터' }),
        rows.length ? rows : h('p', { class: 'ew-sub', text: '캐릭터가 없습니다. 아래에서 추가하세요.' }),
        h('button', { type: 'button', class: 'ew-btn primary block', onclick: () => startEdit(null) }, '+ 캐릭터 추가'),
        bgSection,
        h('h3', { text: '옮기기' }),
        h('div', { class: 'ew-btnrow' },
          h('button', {
            type: 'button', class: 'ew-btn', onclick: async () => {
              const users = await EW.store.listUserChars();
              if (!users.length) return toast('내보낼 내 캐릭터가 없습니다');
              download(await EW.io.exportChars(users.map((u) => u.id)), 'edge-walkers-characters.json');
            },
          }, '내보내기 (JSON)'),
          h('button', { type: 'button', class: 'ew-btn', onclick: () => importInput.click() }, '가져오기'),
          importInput),
        h('button', {
          type: 'button', class: 'ew-btn primary block', disabled: !(EW.share && EW.config), onclick: () => showShare(),
        }, '공유 링크 만들기'),
        h('p', { class: 'ew-sub', text: '길게 누르면 이 패널이 열립니다. 바깥(위쪽)을 누르면 닫혀요.' })));
  }

  // ───────── 공유 링크 화면 ─────────
  async function showShare() {
    stopPreview(); editor = null;
    const users = (ctx.getAllDefs() || []).filter((d) => d.source === 'user');
    const picked = new Set(users.map((d) => d.id));
    const bgBox = h('input', { type: 'checkbox', checked: true, id: 'ew-share-bg' });
    const progress = h('div', { class: 'ew-progress', role: 'status', 'aria-live': 'polite' });
    const result = h('div', { class: 'ew-result' });
    const makeBtn = h('button', { type: 'button', class: 'ew-btn primary block', disabled: !users.length, onclick: make }, '링크 만들기');
    let busy = false;

    const rows = users.map((d) => h('label', { class: 'ew-check' },
      h('input', {
        type: 'checkbox', checked: true,
        onchange: (e) => { e.target.checked ? picked.add(d.id) : picked.delete(d.id); makeBtn.disabled = busy || !picked.size; },
      }),
      h('span', { text: `${d.name} · ${d.count}마리` })));

    function showResult(url) {
      const input = h('input', { type: 'text', class: 'ew-text ew-share-link', readonly: true, value: url, 'aria-label': '공유 링크', onfocus: (e) => e.target.select() });
      const note = h('div', { class: 'ew-sub', role: 'status' });
      const react = (r) => {
        note.textContent = { shared: '공유했어요!', copied: '링크를 복사했어요', manual: '위 링크를 길게 눌러 복사해 주세요', cancelled: '' }[r] || '';
        if (r === 'copied') toast('링크를 복사했어요');
      };
      result.replaceChildren(
        h('p', { class: 'ew-ok', text: '링크가 만들어졌어요! 받는 사람이 누르면 캐릭터가 바로 들어가요.' }),
        input,
        h('div', { class: 'ew-btnrow' },
          h('button', { type: 'button', class: 'ew-btn primary', onclick: async () => react(await EW.share.shareUrl(url)) }, '공유하기'),
          h('button', {
            type: 'button', class: 'ew-btn', onclick: async () => {
              try { await navigator.clipboard.writeText(url); react('copied'); } catch (e) { input.focus(); input.select(); react('manual'); }
            },
          }, '링크 복사')),
        note,
        h('p', { class: 'ew-sub', text: '링크를 아는 사람은 누구나 볼 수 있고, 올린 뒤에는 지울 수 없어요.' }));
    }

    async function make() {
      if (busy || !picked.size) return;
      busy = true; makeBtn.disabled = true; result.replaceChildren();
      try {
        const r = await EW.share.createLink({
          ids: [...picked], includeBg: bgBox.checked, idPrefix: EW.share.idPrefix || '',
          onProgress: (m) => { progress.textContent = m; },
        });
        progress.textContent = '완료!';
        showResult(r.url);
        // 업로드를 기다리는 사이 제스처가 만료될 수 있어 실패해도 괜찮다 — [공유하기] 버튼이 새 제스처로 다시 시도한다
        EW.share.shareUrl(r.url).then((s) => { if (s !== 'cancelled') { const n = result.querySelector('.ew-sub[role=status]'); if (n) n.textContent = { shared: '공유했어요!', copied: '링크를 복사했어요', manual: '위 링크를 길게 눌러 복사해 주세요' }[s] || ''; } });
      } catch (e) {
        progress.textContent = '';
        result.replaceChildren(h('div', { class: 'ew-err', role: 'alert', text: '⚠ ' + (e && e.message ? e.message : '링크를 만들지 못했어요') }));
      } finally { busy = false; makeBtn.disabled = !picked.size; }
    }

    render(
      header('공유 링크 만들기', () => showList()),
      h('div', { class: 'ew-body' },
        h('h3', { text: '공유할 캐릭터' }),
        users.length ? h('div', { class: 'ew-share-list' }, rows) : h('p', { class: 'ew-sub', text: '공유할 내 캐릭터가 없어요. 먼저 “+ 캐릭터 추가”로 만들어 주세요.' }),
        h('label', { class: 'ew-check', for: 'ew-share-bg' }, bgBox, h('span', { text: '현재 배경 포함' })),
        makeBtn, progress, result));
  }

  function header(title, back) {
    return h('div', { class: 'ew-head' },
      back ? h('button', { type: 'button', class: 'ew-btn small', onclick: back }, '‹ 뒤로') : h('span'),
      h('strong', { text: title }),
      h('button', { type: 'button', class: 'ew-btn small', 'aria-label': '닫기', onclick: close }, '닫기'));
  }
  function render(head, body) {
    ui.panel.replaceChildren(head, body);
    ui.panel.scrollTop = 0;
  }

  // ───────── 배경 ─────────
  function backgroundSection(settings) {
    const bg = Object.assign({}, settings.bg);
    const apply = async () => {
      await EW.store.setSettings({ bg });
      const eng = ctx.getEngine && ctx.getEngine();
      if (eng) eng.setBackground(Object.assign({}, bg));
    };
    const colorRow = (label, key) => h('label', { class: 'ew-field' }, h('span', { text: label }),
      h('input', { type: 'color', value: bg[key], oninput: (e) => { bg[key] = e.target.value; apply(); } }));
    const imgInput = h('input', {
      type: 'file', accept: 'image/*', hidden: true,
      onchange: async (e) => {
        const f = e.target.files[0]; e.target.value = '';
        if (!f) return;
        bg.image = f; bg.type = 'image'; await apply(); showList();
      },
    });
    const sel = h('select', {
      class: 'ew-select', 'aria-label': '배경 종류',
      onchange: (e) => { bg.type = e.target.value; apply().then(showList); },
    }, ...[['color', '단색'], ['gradient', '그라디언트'], ['image', '이미지']].map(([v, t]) => h('option', { value: v, selected: bg.type === v }, t)));
    return h('div', { class: 'ew-bg' },
      h('h3', { text: '배경' }), sel,
      bg.type !== 'image' ? colorRow(bg.type === 'gradient' ? '위쪽 색' : '색', 'color') : null,
      bg.type === 'gradient' ? colorRow('아래쪽 색', 'color2') : null,
      bg.type === 'image' ? h('div', { class: 'ew-btnrow' },
        h('button', { type: 'button', class: 'ew-btn', onclick: () => imgInput.click() }, bg.image ? '이미지 바꾸기' : '사진 선택'),
        bg.image ? h('button', { type: 'button', class: 'ew-btn', onclick: () => { bg.image = null; bg.type = 'gradient'; apply().then(showList); } }, '이미지 지우기') : null,
        h('select', {
          class: 'ew-select', 'aria-label': '이미지 맞춤',
          onchange: (e) => { bg.fit = e.target.value; apply(); },
        }, ...[['cover', '꽉 채우기'], ['contain', '전체 보이기']].map(([v, t]) => h('option', { value: v, selected: bg.fit === v }, t)))) : null,
      imgInput);
  }

  // ───────── 캐릭터 추가/수정 ─────────
  function startEdit(def) {
    stopPreview();
    if (def && def.source !== 'user') {
      editor = { mode: 'override', id: def.id, name: def.name, base: def, scale: def.scale, speed: def.speed, fps: def.fps, count: def.count, previewAction: 'walk' };
      return renderEditor();
    }
    if (def) {
      EW.store.listUserChars().then((list) => {
        const sc = list.find((c) => c.id === def.id);
        if (!sc) return showList();
        editor = { mode: 'user', isNew: false, id: sc.id, name: sc.name, scale: sc.scale, speed: sc.speed, fps: sc.fps, count: sc.count, actions: structuredCloneActions(sc.actions), previewAction: 'walk' };
        renderEditor();
      });
      return;
    }
    editor = { mode: 'user', isNew: true, id: newId(), name: '', scale: 1, speed: 60, fps: 8, count: 1, actions: {}, previewAction: 'walk' };
    renderEditor();
  }
  const structuredCloneActions = (a) => { const o = {}; for (const k in a || {}) o[k] = [...a[k]]; return o; };

  function slider(label, key, min, max, step, fmt) {
    const val = h('output', { text: fmt(editor[key]) });
    const input = h('input', {
      type: 'range', min, max, step, value: editor[key], 'aria-label': label,
      oninput: (e) => { editor[key] = +e.target.value; val.textContent = fmt(editor[key]); },
    });
    return h('label', { class: 'ew-field' }, h('span', { text: label }), input, val);
  }

  function renderEditor() {
    const ed = editor;
    const isUser = ed.mode === 'user';
    const nameInput = h('input', {
      type: 'text', class: 'ew-text', maxlength: 24, placeholder: '캐릭터 이름', value: ed.name, disabled: !isUser,
      oninput: (e) => { ed.name = e.target.value; },
    });
    const msg = h('div', { class: 'ew-msg', role: 'status' });
    const saveBtn = h('button', { type: 'button', class: 'ew-btn primary', onclick: save }, '저장');
    ed.msg = msg; ed.saveBtn = saveBtn;

    const actionBlocks = isUser ? EW.store.ACTIONS.map((a) => {
      const strip = h('div', { class: 'ew-strip' });
      const input = h('input', {
        type: 'file', accept: 'image/png,image/webp', multiple: true, hidden: true, 'data-action': a,
        onchange: (e) => {
          const files = natSort(e.target.files); e.target.value = '';
          if (!files.length) return;
          ed.actions[a] = (ed.actions[a] || []).concat(files);
          drawStrip(a, strip); revalidate();
        },
      });
      const block = h('div', { class: 'ew-action' },
        h('div', { class: 'ew-actionhead' },
          h('strong', { text: ACTION_INFO[a][0] + ' ' }), h('code', { text: a }), h('span', { class: 'ew-sub', text: ' ' + ACTION_INFO[a][1] })),
        strip,
        h('div', { class: 'ew-btnrow' },
          h('button', { type: 'button', class: 'ew-btn small', onclick: () => input.click() }, '+ 이미지 선택 (여러 장)'),
          h('button', { type: 'button', class: 'ew-btn small', onclick: () => { delete ed.actions[a]; drawStrip(a, strip); revalidate(); } }, '비우기')),
        input);
      drawStrip(a, strip);
      return block;
    }) : null;

    const actionSel = h('select', {
      class: 'ew-select', 'aria-label': '미리보기 액션',
      onchange: (e) => { ed.previewAction = e.target.value; },
    }, ...EW.store.ACTIONS.map((a) => h('option', { value: a, selected: ed.previewAction === a }, ACTION_INFO[a][0])));
    const canvas = h('canvas', { class: 'ew-preview', width: 192, height: 192 });
    ed.previewCanvas = canvas;

    const delBtn = isUser && !ed.isNew ? h('button', {
      type: 'button', class: 'ew-btn danger',
      onclick: async (e) => {
        if (!ed.confirmDel) { ed.confirmDel = true; e.target.textContent = '정말 삭제? 한 번 더 누르세요'; return; }
        await EW.store.deleteUserChar(ed.id);
        const s = await EW.store.getSettings();
        const patch = {};
        if (s.enabledIds) patch.enabledIds = s.enabledIds.filter((x) => x !== ed.id);
        if (s.overrides[ed.id]) { patch.overrides = Object.assign({}, s.overrides); delete patch.overrides[ed.id]; }
        if (Object.keys(patch).length) await EW.store.setSettings(patch);
        await changed(); showList();
      },
    }, '삭제') : null;
    const resetBtn = !isUser ? h('button', {
      type: 'button', class: 'ew-btn',
      onclick: async () => {
        const s = await EW.store.getSettings();
        const ov = Object.assign({}, s.overrides); delete ov[ed.id];
        await EW.store.setSettings({ overrides: ov });
        await changed(); showList();
      },
    }, '기본값으로') : null;

    render(
      header(isUser ? (ed.isNew ? '캐릭터 추가' : '캐릭터 수정') : ed.name, () => showList()),
      h('div', { class: 'ew-body' },
        h('div', { class: 'ew-previewbox' }, canvas, actionSel),
        isUser ? h('label', { class: 'ew-field' }, h('span', { text: '이름' }), nameInput) : null,
        slider('크기', 'scale', 0.4, 2.5, 0.05, (v) => '×' + (+v).toFixed(2)),
        slider('걷기 속도', 'speed', 10, 200, 5, (v) => v + 'px/s'),
        slider('프레임 fps', 'fps', 1, 24, 1, (v) => v + 'fps'),
        slider('마릿수', 'count', 1, 8, 1, (v) => v + '마리'),
        isUser ? h('p', { class: 'ew-sub', text: '투명 PNG(WebP 가능) · 모든 프레임 같은 크기(권장 256×256) · 오른쪽을 바라보고 발은 아래쪽 같은 높이에. 걷기 2장+멍때리기 1장만 있어도 됩니다.' }) : h('p', { class: 'ew-sub', text: '내장/폴더 캐릭터는 이미지를 바꿀 수 없고 크기·속도·fps·마릿수만 조절됩니다.' }),
        actionBlocks,
        msg,
        h('div', { class: 'ew-btnrow' }, saveBtn, resetBtn, delBtn)));
    revalidate();
    startPreview();
  }

  function drawStrip(a, strip) {
    strip.replaceChildren();
    const list = editor.actions[a] || [];
    if (!list.length) { strip.append(h('span', { class: 'ew-sub', text: '이미지 없음' })); return; }
    list.forEach((blob, i) => {
      strip.append(h('div', { class: 'ew-frame' },
        h('img', { src: urlOf(blob), alt: `${a} ${i + 1}` }),
        h('button', {
          type: 'button', class: 'ew-x', 'aria-label': `${a} ${i + 1}번 삭제`,
          onclick: () => { list.splice(i, 1); if (!list.length) delete editor.actions[a]; drawStrip(a, strip); revalidate(); },
        }, '×'),
        h('span', { class: 'ew-idx', text: i + 1 })));
    });
  }

  async function currentDef() {
    const ed = editor;
    if (ed.mode === 'override') return Object.assign({}, ed.base, { scale: ed.scale, speed: ed.speed, fps: ed.fps, count: ed.count });
    return EW.store.storedToDef({ id: ed.id, name: ed.name, scale: ed.scale, speed: ed.speed, fps: ed.fps, count: ed.count, actions: ed.actions });
  }

  let revalSeq = 0;
  async function revalidate() {
    const ed = editor; if (!ed) return;
    const seq = ++revalSeq;
    let v;
    try {
      ed.def = await currentDef();
      v = EW.store.validateDef(ed.def);
    } catch (e) { v = { ok: false, errors: ['이미지를 읽을 수 없습니다 (' + e.message + ')'], warnings: [] }; ed.def = null; }
    if (seq !== revalSeq || editor !== ed) return;
    ed.valid = v.ok;
    ed.saveBtn.disabled = !v.ok;
    ed.msg.replaceChildren(
      ...v.errors.map((t) => h('div', { class: 'ew-err', text: '⚠ ' + t })),
      ...v.warnings.map((t) => h('div', { class: 'ew-warn', text: 'ℹ ' + t })),
      v.ok && !v.warnings.length ? h('div', { class: 'ew-ok', text: '✓ 규격에 맞아요' }) : null);
  }

  async function save() {
    const ed = editor;
    if (!ed || !ed.valid) return;
    if (ed.mode === 'override') {
      const s = await EW.store.getSettings();
      const ov = Object.assign({}, s.overrides, { [ed.id]: { scale: ed.scale, speed: ed.speed, fps: ed.fps, count: ed.count } });
      await EW.store.setSettings({ overrides: ov });
    } else {
      const sc = { id: ed.id, name: ed.name.trim() || '이름 없음', scale: ed.scale, speed: ed.speed, fps: ed.fps, count: ed.count, actions: ed.actions };
      await EW.store.saveUserChar(sc);
      const s = await EW.store.getSettings();
      if (ed.isNew && s.enabledIds && !s.enabledIds.includes(ed.id)) await EW.store.setSettings({ enabledIds: [...s.enabledIds, ed.id] });
    }
    await changed();
    toast('저장했어요');
    showList();
  }

  // ───────── 미리보기 ─────────
  function startPreview() {
    stopPreview();
    const t0 = performance.now();
    const tick = (now) => {
      previewRAF = requestAnimationFrame(tick);
      const ed = editor; if (!ed || !ed.previewCanvas || !ed.def) return;
      const frames = ed.def.frames;
      let a = ed.previewAction, list = frames[a];
      let sub = '';
      if (!list || !list.length) {
        for (const alt of FALLBACK[a] || []) if (frames[alt] && frames[alt].length) { list = frames[alt]; sub = alt; break; }
      }
      const c = ed.previewCanvas, g = c.getContext('2d');
      g.clearRect(0, 0, c.width, c.height);
      g.strokeStyle = 'rgba(255,255,255,0.25)'; g.beginPath();
      const gy = c.height * (224 / 256); g.moveTo(0, gy); g.lineTo(c.width, gy); g.stroke();
      if (!list || !list.length) return;
      const fps = Math.max(1, ed.fps);
      const img = list[Math.floor(((now - t0) / 1000) * fps) % list.length];
      g.drawImage(img, 0, 0, c.width, c.height);
      if (sub) { g.fillStyle = 'rgba(255,255,255,0.7)'; g.font = '12px sans-serif'; g.fillText(`'${a}' 없음 → ${sub} 대체`, 8, 16); }
    };
    previewRAF = requestAnimationFrame(tick);
  }
  function stopPreview() { if (previewRAF) cancelAnimationFrame(previewRAF); previewRAF = 0; }

  EW.ui = { init, open, close, isOpen, refresh: () => panelOpen && showList() };
})();

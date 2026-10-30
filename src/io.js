// io.js — base64 JSON 내보내기/가져오기
(function () {
  const EW = (window.EW = window.EW || {});

  const blobToDataUrl = (b) => new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(b);
  });
  const dataUrlToBlob = (u) => {
    const m = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(u);
    if (!m) throw new Error('잘못된 data URL');
    const bin = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: m[1] || 'image/png' });
  };
  const newId = () => 'u_' + Math.random().toString(36).slice(2, 10);

  async function exportChars(ids) {
    const all = await EW.store.listUserChars();
    const chars = [];
    for (const c of all) {
      if (ids && !ids.includes(c.id)) continue;
      const actions = {};
      for (const a of Object.keys(c.actions || {}))
        actions[a] = await Promise.all(c.actions[a].map(blobToDataUrl));
      chars.push({ id: c.id, name: c.name, scale: c.scale, speed: c.speed, fps: c.fps, count: c.count, actions });
    }
    return new Blob([JSON.stringify({ version: 1, characters: chars })], { type: 'application/json' });
  }

  async function importChars(fileOrText) {
    const added = [], errors = [];
    let data;
    try {
      const text = typeof fileOrText === 'string' ? fileOrText : await fileOrText.text();
      data = JSON.parse(text);
    } catch (e) { return { added, errors: ['JSON 파싱 실패: ' + e.message] }; }
    if (!data || data.version !== 1 || !Array.isArray(data.characters))
      return { added, errors: ['지원하지 않는 형식 (version 1 필요)'] };
    const existing = new Set((await EW.store.listUserChars()).map((c) => c.id));
    for (const c of data.characters) {
      try {
        const actions = {};
        for (const a of EW.store.ACTIONS) {
          const arr = c.actions && c.actions[a];
          if (Array.isArray(arr) && arr.length) actions[a] = arr.map(dataUrlToBlob);
        }
        let id = typeof c.id === 'string' && c.id.startsWith('u_') ? c.id : newId();
        while (existing.has(id)) id = newId();
        const sc = { id, name: c.name || id, scale: c.scale ?? 1, speed: c.speed ?? 60, fps: c.fps ?? 8, count: c.count ?? 1, actions };
        const v = EW.store.validateDef(await EW.store.storedToDef(sc));
        if (!v.ok) { errors.push(`${sc.name}: ${v.errors.join(', ')}`); continue; }
        await EW.store.saveUserChar(sc);
        existing.add(id);
        added.push(id);
      } catch (e) { errors.push(`${c && c.name}: ${e.message}`); }
    }
    return { added, errors };
  }

  EW.io = { exportChars, importChars, blobToDataUrl, dataUrlToBlob };
})();

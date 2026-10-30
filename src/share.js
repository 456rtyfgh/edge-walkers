// share.js — 내 캐릭터를 팩 JSON 으로 묶어 Supabase Storage 에 올리고 공유 링크를 만든다.
// 팩 형식은 PLAN.md P2-3, 상수는 EW.config (config.js, Dev-B).
(function () {
  const EW = (window.EW = window.EW || {});
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'; // 64자 → 바이트&63 이 균일
  const ID_LEN = 12;
  const UPLOAD_TIMEOUT_MS = 60000;
  const TOO_BIG = '용량이 너무 커요: 캐릭터를 줄이거나 배경을 빼 보세요';

  const cfg = () => EW.config;
  const fail = (msg, code) => Object.assign(new Error(msg), { code });

  function randomId(prefix) {
    const bytes = new Uint8Array(ID_LEN);
    crypto.getRandomValues(bytes);
    let s = '';
    for (const b of bytes) s += ALPHABET[b & 63];
    return (prefix || '') + s;
  }

  // 파일 앞부분으로 실제 형식 판별 (Blob.type 은 비어 있을 수 있음)
  async function sniff(blob) {
    const b = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
    if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
    return null;
  }

  // PNG/WebP 면 그대로, 그 외(JPEG 등)는 canvas 로 PNG 재인코딩 → data URL
  async function toPackImage(blob) {
    let out = blob;
    let mime = await sniff(blob);
    if (!mime) {
      const bmp = await EW.store.decodeBlob(blob);
      const c = document.createElement('canvas');
      c.width = bmp.width || bmp.naturalWidth;
      c.height = bmp.height || bmp.naturalHeight;
      c.getContext('2d').drawImage(bmp, 0, 0);
      out = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('이미지 변환 실패'))), 'image/png'));
      mime = 'image/png';
    }
    const url = await EW.io.blobToDataUrl(out);
    // Blob.type 이 비면 FileReader 가 octet-stream 으로 만든다 → MIME 바로잡기
    return url.replace(/^data:[^;,]*/, 'data:' + mime);
  }

  async function buildPack(ids, includeBg, opts) {
    if (!cfg()) throw fail('공유 설정을 불러오지 못했어요', 'no-config');
    const L = cfg().LIMITS || {};
    const users = await EW.store.listUserChars();
    const picked = users.filter((c) => !ids || ids.includes(c.id));
    if (!picked.length) throw fail('공유할 내 캐릭터가 없어요', 'empty');
    if (L.maxChars && picked.length > L.maxChars) throw fail('한 번에 캐릭터 ' + L.maxChars + '개까지만 공유할 수 있어요', 'too-many');
    const characters = [];
    for (const c of picked) {
      const actions = {};
      for (const a of Object.keys(c.actions || {})) {
        const arr = c.actions[a];
        if (!arr || !arr.length) continue;
        if (L.maxFramesPerAction && arr.length > L.maxFramesPerAction)
          throw fail("'" + c.name + "'의 " + a + ' 프레임이 너무 많아요 (최대 ' + L.maxFramesPerAction + '장)', 'too-many-frames');
        actions[a] = await Promise.all(arr.map(toPackImage));
      }
      characters.push({ id: c.id, name: String(c.name || c.id).slice(0, L.maxNameLen || 40), scale: c.scale, speed: c.speed, fps: c.fps, count: c.count, actions });
    }
    let bg = null;
    if (includeBg) {
      const b = (await EW.store.getSettings()).bg || {};
      bg = { type: b.type, color: b.color, color2: b.color2, fit: b.fit || 'cover', image: null };
      if (b.type === 'image') {
        if (b.image) bg.image = await toPackImage(b.image);
        else bg.type = 'gradient';
      }
    }
    const id = randomId(opts && opts.idPrefix);
    const pack = { version: 1, packId: id, createdAt: new Date().toISOString(), characters, bg };
    const bytes = new Blob([JSON.stringify(pack)]).size;
    return { pack, id, bytes };
  }

  function httpMessage(status) {
    if (status === 401 || status === 403) return '업로드 권한이 없어요. 잠시 후 다시 시도해 주세요';
    if (status === 413) return TOO_BIG;
    if (status === 429) return '요청이 너무 많아요. 잠시 후 다시 시도해 주세요';
    if (status >= 500) return '서버가 잠시 불안정해요. 조금 뒤에 다시 시도해 주세요';
    return '올리지 못했어요 (오류 ' + status + ')';
  }
  const isDuplicate = (status, body) => status === 409 || (status === 400 && /duplicate|"409"|already exists/i.test(body || ''));

  async function uploadPack(pack, onProgress) {
    if (!cfg()) throw fail('공유 설정을 불러오지 못했어요', 'no-config');
    if (new Blob([JSON.stringify(pack)]).size > cfg().LIMITS.maxBytes) throw fail(TOO_BIG, 'too-large');
    if (navigator.onLine === false) throw fail('인터넷에 연결되어 있지 않아요', 'offline');
    const prefix = pack.packId.slice(0, Math.max(0, pack.packId.length - ID_LEN));
    for (let attempt = 0; attempt < 2; attempt++) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), UPLOAD_TIMEOUT_MS);
      let res;
      try {
        res = await fetch(cfg().uploadUrl(pack.packId), {
          method: 'POST',
          headers: { apikey: cfg().SUPABASE_KEY, Authorization: 'Bearer ' + cfg().SUPABASE_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify(pack),
          signal: ctl.signal,
        });
      } catch (e) {
        throw fail(e && e.name === 'AbortError' ? '업로드 시간이 너무 오래 걸려요. 네트워크를 확인해 주세요' : '인터넷 연결을 확인해 주세요', 'network');
      } finally { clearTimeout(timer); }
      if (res.ok) { if (onProgress) onProgress(1); return; }
      let errText = '';
      try { errText = await res.text(); } catch (e) { /* 무시 */ }
      if (attempt === 0 && isDuplicate(res.status, errText)) { pack.packId = randomId(prefix); continue; }
      throw fail(httpMessage(res.status), 'http-' + res.status);
    }
    throw fail('올리지 못했어요. 다시 시도해 주세요', 'duplicate');
  }

  async function createLink(o) {
    const opts = o || {};
    const say = (m) => { try { if (opts.onProgress) opts.onProgress(m); } catch (e) { /* 무시 */ } };
    say('팩 만드는 중…');
    const built = await buildPack(opts.ids == null ? null : opts.ids, !!opts.includeBg, { idPrefix: opts.idPrefix });
    const pack = built.pack;
    if (!cfg().PACK_ID_RE.test(pack.packId)) throw fail('링크 번호를 만들지 못했어요', 'bad-id');
    if (built.bytes > cfg().LIMITS.maxBytes) throw fail(TOO_BIG, 'too-large');
    if (EW.packs && EW.packs.validatePack) {
      const v = await EW.packs.validatePack(JSON.parse(JSON.stringify(pack)), pack.packId);
      if (!v.ok) throw fail('이 캐릭터는 공유 규격에 맞지 않아요: ' + (v.errors[0] || ''), 'invalid');
    }
    say('올리는 중…');
    await uploadPack(pack);
    say('완료!');
    return { id: pack.packId, url: cfg().SHARE_BASE + '?pack=' + pack.packId, bytes: built.bytes };
  }

  async function shareUrl(url, text) {
    if (navigator.share) {
      try {
        await navigator.share({ url, title: 'Edge Walkers', text: text || '내 캐릭터가 가장자리를 걸어요' });
        return 'shared';
      } catch (e) {
        if (e && e.name === 'AbortError') return 'cancelled';
      }
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(url); return 'copied'; }
    } catch (e) { /* 수동 안내로 */ }
    return 'manual';
  }

  // idPrefix: 테스트가 'test' 로 바꿔 UI 흐름에서도 test 팩만 올리게 한다
  EW.share = { buildPack, uploadPack, createLink, shareUrl, idPrefix: '' };
})();

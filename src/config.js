// config.js — 외부 서비스 상수와 팩 한도 (공개용 키라 코드에 포함해도 됨)
(function () {
  const EW = (window.EW = window.EW || {});
  const SUPABASE_URL = 'https://vrszlmkrfsqctqxzcsjh.supabase.co';
  const BUCKET = 'edge-walkers-packs';
  const q = new URLSearchParams(location.search);
  // 테스트용: ?shareBase=http://127.0.0.1:5173/ 로 링크 기준 주소를 덮어쓴다
  const shareBase = q.get('shareBase') || 'https://456rtyfgh.github.io/edge-walkers/';

  EW.config = {
    SUPABASE_URL,
    SUPABASE_KEY: 'sb_publishable_fykX8dyjJEtzBkelZHyRYA_UsYBtOdm',
    BUCKET,
    PACK_ID_RE: /^[A-Za-z0-9_-]{8,32}$/,
    SHARE_BASE: shareBase,
    LIMITS: {
      maxBytes: 8 * 1024 * 1024, maxChars: 20, maxFramesPerAction: 8,
      minDim: 16, maxDim: 1024, maxFrameBytes: 1.5 * 1024 * 1024, maxNameLen: 40,
    },
    CLAMP: { scale: [0.3, 3], speed: [10, 300], fps: [1, 30], count: [1, 6] },
    packUrl: (id) => SUPABASE_URL + '/storage/v1/object/public/' + BUCKET + '/packs/' + id + '.json',
    uploadUrl: (id) => SUPABASE_URL + '/storage/v1/object/' + BUCKET + '/packs/' + id + '.json',
  };
})();

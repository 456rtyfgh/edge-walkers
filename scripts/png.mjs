// 의존성 없는 최소 PNG 인코더 (RGBA 8bit). make-template / make-fixtures 가 사용.
import zlib from 'node:zlib';

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

export function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// 간단한 래스터 헬퍼: 캔버스 객체 {w,h,px(Uint8ClampedArray)}
export function canvas(w, h) { return { w, h, px: new Uint8ClampedArray(w * h * 4) }; }
export function put(c, x, y, [r, g, b, a]) {
  if (x < 0 || y < 0 || x >= c.w || y >= c.h) return;
  const i = (y * c.w + x) * 4;
  const sa = a / 255, da = c.px[i + 3] / 255, oa = sa + da * (1 - sa);
  if (oa === 0) return;
  c.px[i] = (r * sa + c.px[i] * da * (1 - sa)) / oa;
  c.px[i + 1] = (g * sa + c.px[i + 1] * da * (1 - sa)) / oa;
  c.px[i + 2] = (b * sa + c.px[i + 2] * da * (1 - sa)) / oa;
  c.px[i + 3] = oa * 255;
}
export function fillRect(c, x0, y0, x1, y1, col) {
  for (let y = Math.max(0, y0); y < Math.min(c.h, y1); y++) for (let x = Math.max(0, x0); x < Math.min(c.w, x1); x++) put(c, x, y, col);
}
export function fillEllipse(c, cx, cy, rx, ry, col) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++)
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) put(c, x, y, col);
}
export const toPNG = (c) => encodePNG(c.w, c.h, c.px);

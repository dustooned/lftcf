// Hide card data inside a PNG's tEXt chunk, so a shared card image IS the card file:
// drop it back into the forge and the stats, text and art layers all come back.
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = bytes => { let c = 0xffffffff; for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const b64encode = str => { const u = new TextEncoder().encode(str); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const b64decode = b64 => new TextDecoder().decode(Uint8Array.from(atob(b64), ch => ch.charCodeAt(0)));

export async function embed(blob, keyword, value) {
  const png = new Uint8Array(await blob.arrayBuffer());
  const data = new TextEncoder().encode(keyword + '\0' + b64encode(value)); // base64 keeps tEXt Latin-1 safe
  const chunk = new Uint8Array(12 + data.length), view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk.set([0x74, 0x45, 0x58, 0x74], 4); // "tEXt"
  chunk.set(data, 8);
  view.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));
  const iend = png.length - 12; // IEND is always the last 12 bytes
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, iend)); out.set(chunk, iend); out.set(png.subarray(iend), iend + chunk.length);
  return new Blob([out], { type: 'image/png' });
}

export async function extract(blob, keyword) {
  const png = new Uint8Array(await blob.arrayBuffer()), view = new DataView(png.buffer);
  if (png[1] !== 0x50 || png[2] !== 0x4e || png[3] !== 0x47) return null;
  for (let p = 8; p + 8 <= png.length;) {
    const len = view.getUint32(p), type = String.fromCharCode(...png.subarray(p + 4, p + 8));
    if (type === 'tEXt') {
      const body = png.subarray(p + 8, p + 8 + len), z = body.indexOf(0);
      if (new TextDecoder('latin1').decode(body.subarray(0, z)) === keyword) {
        try { return b64decode(new TextDecoder('latin1').decode(body.subarray(z + 1))); } catch { return null; }
      }
    }
    if (type === 'IEND') break;
    p += 12 + len;
  }
  return null;
}

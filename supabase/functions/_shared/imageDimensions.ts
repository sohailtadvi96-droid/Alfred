// Dimension parsing — reads width/height straight out of an image's file
// header, no decode. No image codec (imagescript, OffscreenCanvas, etc.)
// survives the edge runtime (see docs/DESIGN.md Gotchas), so a real decoder
// is not an option; the header formats below are simple and stable enough
// to read by hand. Gif is deliberately not covered — nothing downstream
// needs it yet, and 0032's "store as-is, no codec touches it" stance
// applies here too. Each parser returns null (never throws) on anything it
// doesn't recognize or that looks truncated.
//
// Shared by design-ingest (parses the freshly-downloaded bytes of a new
// item) and design-backfill-dimensions (re-parses the already-cached bytes
// of an old one) — same bytes-in, dimensions-out contract either way.

export interface Dimensions {
  width: number;
  height: number;
}

function readUint16BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] * 0x1000000 + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];
}

function readUint16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint24LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

// PNG: fixed 8-byte signature, then the IHDR chunk always comes first —
// length(4) + "IHDR"(4) + width(4, u32be) + height(4, u32be), starting right
// after the signature. No need to walk chunks at all.
function parsePngDimensions(bytes: Uint8Array): Dimensions | null {
  if (bytes.length < 24) return null;
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) if (bytes[i] !== sig[i]) return null;
  if (bytes[12] !== 0x49 || bytes[13] !== 0x48 || bytes[14] !== 0x44 || bytes[15] !== 0x52) return null; // "IHDR"
  const width = readUint32BE(bytes, 16);
  const height = readUint32BE(bytes, 20);
  return width > 0 && height > 0 ? { width, height } : null;
}

// JPEG: walk the marker segments after the SOI (FFD8) until a SOF marker
// (C0-CF, excluding C4/C8/CC which aren't frame headers) — its segment is
// precision(1) + height(2, u16be) + width(2, u16be). Markers can be padded
// with extra FF fill bytes before the real marker byte; SOI/EOI/RSTn/TEM
// have no length field at all.
function parseJpegDimensions(bytes: Uint8Array): Dimensions | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = bytes[offset + 1];
    offset += 2;
    if (marker === 0xff) {
      offset--; // fill byte — the byte just consumed as "marker" is itself an FF prefix
      continue;
    }
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue; // no payload
    }
    if (offset + 2 > bytes.length) return null;
    const segLen = readUint16BE(bytes, offset);
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (offset + 7 > bytes.length) return null;
      const height = readUint16BE(bytes, offset + 3);
      const width = readUint16BE(bytes, offset + 5);
      return width > 0 && height > 0 ? { width, height } : null;
    }
    if (marker === 0xda) return null; // start of scan — no SOF seen, bail rather than parse image data as segments
    offset += segLen;
  }
  return null;
}

// WebP: "RIFF"(4) + size(4) + "WEBP"(4), then a chunk header (fourCC(4) +
// size(4)) whose payload layout depends on the fourCC:
//  - "VP8 " (lossy): sync code at +3, width/height as 14-bit LE u16s at +6/+8.
//  - "VP8L" (lossless): signature byte 0x2F, then width-1/height-1 packed
//    into a 32-bit LE value starting at +1.
//  - "VP8X" (extended): 24-bit LE width-1/height-1 at +4/+7 in the payload.
function parseWebpDimensions(bytes: Uint8Array): Dimensions | null {
  if (bytes.length < 30) return null;
  if (bytes[0] !== 0x52 || bytes[1] !== 0x49 || bytes[2] !== 0x46 || bytes[3] !== 0x46) return null; // "RIFF"
  if (bytes[8] !== 0x57 || bytes[9] !== 0x45 || bytes[10] !== 0x42 || bytes[11] !== 0x50) return null; // "WEBP"
  const fourCC = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  const payload = 20; // 12-byte RIFF/WEBP header + 8-byte chunk header (fourCC + size)

  if (fourCC === 'VP8 ') {
    if (bytes[payload + 3] !== 0x9d || bytes[payload + 4] !== 0x01 || bytes[payload + 5] !== 0x2a) return null;
    const width = readUint16LE(bytes, payload + 6) & 0x3fff;
    const height = readUint16LE(bytes, payload + 8) & 0x3fff;
    return width > 0 && height > 0 ? { width, height } : null;
  }
  if (fourCC === 'VP8L') {
    if (bytes[payload] !== 0x2f) return null;
    const bits =
      bytes[payload + 1] | (bytes[payload + 2] << 8) | (bytes[payload + 3] << 16) | (bytes[payload + 4] << 24);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >>> 14) & 0x3fff) + 1;
    return width > 0 && height > 0 ? { width, height } : null;
  }
  if (fourCC === 'VP8X') {
    const width = readUint24LE(bytes, payload + 4) + 1;
    const height = readUint24LE(bytes, payload + 7) + 1;
    return width > 0 && height > 0 ? { width, height } : null;
  }
  return null;
}

export function parseImageDimensions(bytes: Uint8Array): Dimensions | null {
  return parsePngDimensions(bytes) ?? parseJpegDimensions(bytes) ?? parseWebpDimensions(bytes);
}

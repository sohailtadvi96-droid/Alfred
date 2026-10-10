// Exports every app icon in public/ from scripts/icons/alfred-mark.svg.
//
// Rasterised by headless Google Chrome (a plain `--screenshot` of a page
// holding the SVG at the target pixel size), so no npm dependency and no
// image library — Chrome is the only renderer on the Mac that draws SVG
// faithfully. Chrome writes an RGB PNG with no alpha channel when every
// pixel is opaque, which is what iOS wants for apple-touch-icon; the
// script checks that rather than assuming it.
//
// Usage: node scripts/icons/export-icons.mjs
//        CHROME=/path/to/chrome node scripts/icons/export-icons.mjs
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pub = resolve(here, '../../public');
const SOURCE = join(here, 'alfred-mark.svg');
const GROUND = '#10201a'; // Pine ground — the icon's background, and the manifest's colours

// Share of the canvas the mark tile takes. Maskable: the platform may crop to
// a circle of 80% diameter; the tile's rounded corner reaches 0.58 x its side
// from the centre, so anything up to 0.69 stays inside — 0.6 leaves margin.
const MARK_SCALE = 0.68;
const MASKABLE_SCALE = 0.6;

const OUTPUTS = [
  { file: 'apple-touch-icon.png', size: 180, scale: MARK_SCALE, opaque: true },
  { file: 'icon-192.png', size: 192, scale: MARK_SCALE, opaque: true },
  { file: 'icon-512.png', size: 512, scale: MARK_SCALE, opaque: true },
  { file: 'icon-maskable-512.png', size: 512, scale: MASKABLE_SCALE, opaque: true },
  // the bare tile, transparent corners — a tab icon has no ground behind it
  { file: 'favicon-32.png', size: 32, scale: 1, opaque: false },
];

const CHROME_CANDIDATES = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);
const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chrome) throw new Error('No Chrome found — set CHROME=/path/to/chrome');

const svg = readFileSync(SOURCE, 'utf8');
const inner = svg
  .replace(/^[\s\S]*?<svg[^>]*>/, '')
  .replace(/<\/svg>\s*$/, '')
  .replace(/<!--[\s\S]*?-->/g, '');

function page({ size, scale, opaque }) {
  const tile = 26 * scale;
  const offset = (26 - tile) / 2;
  const ground = opaque ? `<rect width="26" height="26" fill="${GROUND}"/>` : '';
  return `<!doctype html><html><body style="margin:0;background:transparent;overflow:hidden">
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 26 26" style="display:block">
${ground}<g transform="translate(${offset} ${offset}) scale(${scale})">${inner}</g>
</svg></body></html>`;
}

/** Width, height and PNG colour type (2 = RGB, 6 = RGBA) from the IHDR chunk. */
function pngInfo(path) {
  const b = readFileSync(path);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), colorType: b[25] };
}

const work = mkdtempSync(join(tmpdir(), 'alfred-icons-'));
try {
  for (const out of OUTPUTS) {
    const html = join(work, `${out.file}.html`);
    const png = join(work, out.file);
    writeFileSync(html, page(out));
    execFileSync(
      chrome,
      [
        '--headless',
        '--disable-gpu',
        '--hide-scrollbars',
        '--force-device-scale-factor=1',
        '--default-background-color=00000000',
        `--window-size=${out.size},${out.size}`,
        `--screenshot=${png}`,
        `file://${html}`,
      ],
      { stdio: 'ignore' },
    );
    const info = pngInfo(png);
    if (info.width !== out.size || info.height !== out.size) {
      throw new Error(`${out.file}: got ${info.width}x${info.height}, expected ${out.size}`);
    }
    if (out.opaque && info.colorType !== 2) {
      throw new Error(`${out.file}: expected an opaque RGB PNG, got colour type ${info.colorType}`);
    }
    copyFileSync(png, join(pub, out.file));
    console.log(`public/${out.file}  ${out.size}x${out.size}  ${info.colorType === 2 ? 'RGB' : 'RGBA'}`);
  }
  copyFileSync(SOURCE, join(pub, 'favicon.svg'));
  console.log('public/favicon.svg  (the source mark)');
} finally {
  rmSync(work, { recursive: true, force: true });
}

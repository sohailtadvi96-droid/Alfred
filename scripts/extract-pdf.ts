/** Node-side mirror of extractPdfLines() in src/features/expenses/pdf.ts. */

import { readFile } from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export async function extractPdfLines(file: string): Promise<string[]> {
  const data = new Uint8Array(await readFile(file));
  const doc = await getDocument({ data }).promise;
  const lines: string[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();

    const items = (content.items as Array<{ str?: unknown; transform?: unknown }>)
      .filter(
        (it): it is { str: string; transform: number[] } =>
          typeof it.str === 'string' &&
          it.str.trim().length > 0 &&
          Array.isArray(it.transform) &&
          it.transform.length >= 6,
      )
      .map((it) => ({ x: it.transform[4], y: it.transform[5], s: it.str }))
      .sort((a, b) => b.y - a.y || a.x - b.x);

    let curY: number | null = null;
    let parts: { x: number; s: string }[] = [];
    const flush = () => {
      if (!parts.length) return;
      const line = parts
        .sort((a, b) => a.x - b.x)
        .map((p2) => p2.s)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (line) lines.push(line);
      parts = [];
    };
    for (const it of items) {
      if (curY === null || Math.abs(it.y - curY) <= 3) {
        curY = curY ?? it.y;
        parts.push({ x: it.x, s: it.s });
      } else {
        flush();
        curY = it.y;
        parts.push({ x: it.x, s: it.s });
      }
    }
    flush();
  }
  return lines;
}

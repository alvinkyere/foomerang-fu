import qrcode from 'qrcode-generator';

export interface QrMatrix {
  readonly size: number;
  readonly dark: readonly (readonly boolean[])[];
}

/**
 * Encodes `text` as a QR matrix at medium error correction, with the smallest version that fits.
 * We only take the module matrix from the library and draw it ourselves (see `qrPath`), so no
 * library-generated markup is ever injected into the page.
 */
export function createQrMatrix(text: string): QrMatrix {
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  const size = qr.getModuleCount();
  const dark = Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => qr.isDark(r, c)),
  );
  return { size, dark };
}

export const QUIET_ZONE = 4;

/** One SVG path: a rectangle per horizontal run of dark modules, inside a 4-module quiet zone. */
export function qrPath(matrix: QrMatrix): { viewBox: number; d: string } {
  const parts: string[] = [];
  matrix.dark.forEach((row, r) => {
    let c = 0;
    while (c < row.length) {
      if (!row[c]) {
        c += 1;
        continue;
      }
      let end = c;
      while (end < row.length && row[end]) end += 1;
      parts.push(`M${c + QUIET_ZONE} ${r + QUIET_ZONE}h${end - c}v1h-${end - c}z`);
      c = end;
    }
  });
  return { viewBox: matrix.size + QUIET_ZONE * 2, d: parts.join('') };
}

import { inflateSync } from 'node:zlib';

export interface Image {
  readonly width: number;
  readonly height: number;
  /** RGBA, 4 bytes per pixel. */
  readonly data: Uint8Array;
}

/**
 * A minimal PNG decoder, just enough for Playwright screenshots (8-bit truecolour, with or without
 * alpha, not interlaced). It exists so a test can look at pixels without a dependency.
 */
export function decodePng(buffer: Buffer): Image {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat: Buffer[] = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const depth = body[8];
      const colorType = body[9];
      const interlace = body[12];
      if (depth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) {
        throw new Error(
          `unsupported PNG (depth ${depth}, colour type ${colorType}, interlace ${interlace})`,
        );
      }
      channels = colorType === 6 ? 4 : 3;
    } else if (type === 'IDAT') {
      idat.push(body);
    }
    offset += length + 12;
  }

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = new Uint8Array(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? (pixels[y * stride + x - channels] ?? 0) : 0;
      const up = y > 0 ? (pixels[(y - 1) * stride + x] ?? 0) : 0;
      const upLeft = y > 0 && x >= channels ? (pixels[(y - 1) * stride + x - channels] ?? 0) : 0;
      const value = line[x] ?? 0;
      let predicted = 0;
      if (filter === 1) predicted = left;
      else if (filter === 2) predicted = up;
      else if (filter === 3) predicted = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        predicted = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      pixels[y * stride + x] = (value + predicted) & 0xff;
    }
  }

  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = pixels[i * channels] ?? 0;
    data[i * 4 + 1] = pixels[i * channels + 1] ?? 0;
    data[i * 4 + 2] = pixels[i * channels + 2] ?? 0;
    data[i * 4 + 3] = channels === 4 ? (pixels[i * channels + 3] ?? 255) : 255;
  }
  return { width, height, data };
}

/** The centre of every pixel within `tolerance` of `rgb`, and how many there were. */
export function centroidOfColor(
  image: Image,
  rgb: readonly [number, number, number],
  tolerance = 14,
): { x: number; y: number; count: number } | undefined {
  let sx = 0;
  let sy = 0;
  let count = 0;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const i = (y * image.width + x) * 4;
      if (
        Math.abs((image.data[i] ?? 0) - rgb[0]) <= tolerance &&
        Math.abs((image.data[i + 1] ?? 0) - rgb[1]) <= tolerance &&
        Math.abs((image.data[i + 2] ?? 0) - rgb[2]) <= tolerance
      ) {
        sx += x;
        sy += y;
        count += 1;
      }
    }
  }
  return count === 0 ? undefined : { x: sx / count, y: sy / count, count };
}

/**
 * Renders the game's sounds to WAV files you can listen to (2026-10-28): every recipe (audio/recipes.ts) and the music loop
 * (audio/music.ts), offline, in real headless Chrome through the same synth the game uses, into art/audio/output/preview/.
 * Prints each sound's length, peak and brightness (spectral centroid) so a silent, clipping or dull one shows at once.
 *
 *   node art/audio/preview.mjs        (from the repository root; needs the integration package installed)
 */
import { Buffer } from 'node:buffer';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { URL } from 'node:url';

const require = createRequire(new URL('../../integration/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const OUT = 'art/audio/output/preview';
mkdirSync(OUT, { recursive: true });

const esbuild = 'node_modules/.pnpm/esbuild@0.28.2/node_modules/esbuild/bin/esbuild';
execFileSync(esbuild, [
  'art/audio/preview_entry.ts',
  '--bundle',
  '--format=iife',
  '--global-name=Preview',
  `--outfile=${OUT}/bundle.js`,
  '--log-level=error',
]);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
await page.setContent('<html></html>');
await page.addScriptTag({ content: readFileSync(`${OUT}/bundle.js`, 'utf8') });
const sounds = await page.evaluate(async () => await globalThis.Preview.renderAll());
await browser.close();

const SR = 44100;
function wav(samples) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((v, i) =>
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), 44 + i * 2),
  );
  return buf;
}
for (const [name, samples] of Object.entries(sounds)) {
  writeFileSync(`${OUT}/${name.replace(':', '_')}.wav`, wav(samples));
  let peak = 0;
  let sum = 0;
  let last = samples.length - 1;
  while (last > 0 && Math.abs(samples[last]) < 0.002) last -= 1;
  for (let i = 0; i <= last; i += 1) {
    peak = Math.max(peak, Math.abs(samples[i]));
    sum += samples[i] * samples[i];
  }
  const rms = Math.sqrt(sum / (last + 1));
  // the level that brings it to the kind's target peak and target average loudness (their geometric mean: a whoosh is all
  // noise, low in peak and high in energy; a ping the other way)
  const cue = name.startsWith('cue:');
  const music = name.startsWith('music:');
  const level = Math.sqrt(((cue ? 0.25 : 0.5) / peak) * ((cue ? 0.05 : 0.12) / rms));
  console.log(
    `${name.padEnd(16)} ${(last / SR).toFixed(2)} s  peak ${peak.toFixed(2)}  rms ${rms.toFixed(3)}  level ${music ? '-' : level.toFixed(1)}${peak >= 0.99 ? '  CLIPS' : ''}${peak < 0.02 ? '  SILENT' : ''}`,
  );
}

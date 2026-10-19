// Measures what an atlas really costs in a browser: transfer size, decode time, and GPU/process memory after upload to WebGL.
// Usage: node texture-probe.mjs <atlas.webp|png> [copies]    (run from a directory where `playwright` resolves, e.g. integration/)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium, webkit } from '@playwright/test';

const file = path.resolve(process.argv[2]);
const copies = Number(process.argv[3] ?? 1);
const mime = file.endsWith('.webp') ? 'image/webp' : 'image/png';
const server = http.createServer((req, res) => {
  if (req.url === '/') { res.setHeader('content-type', 'text/html'); res.end('<canvas id=c width=64 height=64></canvas>'); return; }
  res.setHeader('content-type', mime); res.end(fs.readFileSync(file));
}).listen(0);
const port = server.address().port;

const probe = async ({ blobUrl, copies }) => {
  const out = { copies, decodeMs: [], uploadMs: [] };
  const gl = document.getElementById('c').getContext('webgl2', { alpha: true, premultipliedAlpha: true });
  out.webgl2 = !!gl; if (!gl) return out;
  const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE); out.maxTex = maxTex;
  const bytes = await (await fetch(blobUrl)).blob(); out.encodedBytes = bytes.size;
  const textures = [];
  for (let k = 0; k < copies; k++) {
    let t0 = performance.now();
    const bmp = await createImageBitmap(bytes, { premultiplyAlpha: 'premultiply' });   // forces a full decode
    out.decodeMs.push(+(performance.now() - t0).toFixed(1)); out.size = [bmp.width, bmp.height];
    t0 = performance.now();
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, bmp);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.drawArrays(gl.POINTS, 0, 1); gl.finish(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    out.uploadMs.push(+(performance.now() - t0).toFixed(1));
    bmp.close(); textures.push(tex);                                                    // CPU copy released: only the GPU texture stays
  }
  return out;
};

const results = {};
// ---- Chrome (system install): GPU memory from the browser's own memory-infra dump
const chrome = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu-benchmarking', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
{
  const page = await chrome.newPage(); await page.goto(`http://localhost:${port}/`);
  const cdp = await page.context().newCDPSession(page);
  const dump = async () => {
    const events = [];
    cdp.removeAllListeners?.('Tracing.dataCollected');
    cdp.on('Tracing.dataCollected', (e) => events.push(...e.value));
    const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
    await cdp.send('Tracing.start', { traceConfig: { includedCategories: ['-*', 'disabled-by-default-memory-infra'], memoryDumpConfig: { triggers: [] } }, transferMode: 'ReportEvents' });
    await cdp.send('Tracing.requestMemoryDump', { deterministic: true, levelOfDetail: 'detailed' });
    await cdp.send('Tracing.end'); await done;
    let gpu = 0, gl = 0, shared = 0, total = 0, cc = 0;
    for (const e of events) {
      if (e.ph !== 'v' || !e.args?.dumps?.allocators) continue;
      const a = e.args.dumps.allocators;
      for (const [name, v] of Object.entries(a)) {
        const size = Number(BigInt('0x' + (v.attrs?.size?.value ?? '0')));
        if (name === 'gpu') gpu = Math.max(gpu, size);
        if (/^gpu\/gl\/textures/.test(name) && !name.includes('/', 'gpu/gl/textures/'.length + 0)) gl = Math.max(gl, size);
        if (name === 'gpu/shared_images') shared = Math.max(shared, size);
        if (name === 'malloc') total = Math.max(total, size);
      }
    }
    return { gpuMB: +(gpu / 1048576).toFixed(1), glTexturesMB: +(gl / 1048576).toFixed(1), sharedImagesMB: +(shared / 1048576).toFixed(1), mallocMB: +(total / 1048576).toFixed(1) };
  };
  results.chrome = { version: chrome.version(), baseline: await dump() };
  results.chrome.probe = await page.evaluate(probe, { blobUrl: `http://localhost:${port}/atlas`, copies });
  results.chrome.afterUpload = await dump();
  results.chrome.jsHeapMB = await page.evaluate(() => +((performance.memory?.usedJSHeapSize ?? 0) / 1048576).toFixed(1));
}
await chrome.close();
// ---- WebKit (Safari's engine): decode/upload timing and WebP-with-alpha support
try {
  const wk = await webkit.launch({ headless: true });
  const page = await wk.newPage(); await page.goto(`http://localhost:${port}/`);
  results.webkit = { version: wk.version(), probe: await page.evaluate(probe, { blobUrl: `http://localhost:${port}/atlas`, copies: 1 }) };
  await wk.close();
} catch (e) { results.webkit = { error: String(e).slice(0, 200) }; }
server.close();
console.log(JSON.stringify(results, null, 1));

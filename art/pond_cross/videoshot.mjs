/**
 * Shows the HQ video as a browser shows it (2026-10-29): loads foomerang-fu physics hq.mp4 in Chrome, seeks to 267.0 s and saves the video
 * element as a PNG (the argument; default chrome_frame.png). colour_fit.py compares it with OpenCV's decode of the same frame.
 *
 *   node art/pond_cross/videoshot.mjs chrome_frame.png        (from the repository root)
 */
import process from 'node:process';
import { createRequire } from 'node:module';
const require = createRequire('/Users/alvin/Desktop/Foomerang Fu/integration/package.json');
const { chromium } = require('@playwright/test');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto('file:///Users/alvin/Desktop/Foomerang%20Fu/foomerang-fu%20physics%20hq.mp4');
await page.waitForSelector('video', { timeout: 20000 });
const ok = await page.evaluate(async () => {
  const v = globalThis.document.querySelector('video');
  v.pause();
  v.controls = false;
  await new Promise((r) => {
    if (v.readyState >= 1) r();
    else v.addEventListener('loadedmetadata', r, { once: true });
  });
  v.currentTime = 267.0;
  await new Promise((r) => v.addEventListener('seeked', r, { once: true }));
  return [v.videoWidth, v.videoHeight, v.currentTime];
});
console.log('video', ok);
await page.waitForTimeout(500);
await page.locator('video').screenshot({ path: process.argv[2] ?? 'chrome_frame.png' });
await browser.close();

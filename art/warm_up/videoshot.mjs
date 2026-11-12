/**
 * The HQ video as a browser shows it (the warm-up's reference frames): loads foomerang-fu physics hq.mp4 in Chrome, seeks to each time
 * given and saves the video element as art/warm_up/output/chrome_<ms>.png. colour_fit.py compares them with OpenCV's decode.
 *
 *   node art/warm_up/videoshot.mjs 0.0 1.2 ...        (from the repository root)
 */
import process from 'node:process';
import { createRequire } from 'node:module';
const require = createRequire('/Users/alvin/Desktop/Foomerang Fu/integration/package.json');
const { chromium } = require('@playwright/test');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto('file:///Users/alvin/Desktop/Foomerang%20Fu/foomerang-fu%20physics%20hq.mp4');
await page.waitForSelector('video', { timeout: 20000 });
await page.evaluate(async () => {
  const v = globalThis.document.querySelector('video');
  v.pause();
  v.controls = false;
  await new Promise((r) =>
    v.readyState >= 1 ? r() : v.addEventListener('loadedmetadata', r, { once: true }),
  );
});
for (const arg of process.argv.slice(2)) {
  const t = Number(arg);
  await page.evaluate(async (time) => {
    const v = globalThis.document.querySelector('video');
    v.currentTime = time;
    await new Promise((r) => v.addEventListener('seeked', r, { once: true }));
  }, t);
  await page.waitForTimeout(300);
  await page
    .locator('video')
    .screenshot({ path: `art/warm_up/output/chrome_${Math.round(t * 1000)}.png` });
}
await browser.close();

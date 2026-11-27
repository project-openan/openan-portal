// Check UMD global shape
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const context = await browser.newContext();
const page = await context.newPage();
await page.goto('http://47.236.98.226:9003/plugins/observation-center/index.js', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
await page.evaluate(() => {
    const s = document.createElement('script');
    s.src = '/plugins/observation-center/index.js';
    document.head.appendChild(s);
});
await page.waitForTimeout(1500);
const s2 = await page.evaluate(() => {
    const g = window.__OPENAN_PLUGIN__observation_center;
    return {
        type: typeof g,
        keys: g ? Object.keys(g) : null,
        hasNamed: g ? Object.prototype.hasOwnProperty.call(g, 'ThirdPartyObservability') : null,
        hasDefault: g ? Object.prototype.hasOwnProperty.call(g, 'default') : null,
        esModule: g ? g.__esModule : null,
    };
});
console.log('GLOBAL SHAPE:', JSON.stringify(s2, null, 1));
await browser.close();
console.log('DONE');

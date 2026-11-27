// Fresh-context third-party verification
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const context = await browser.newContext({ viewport: { width: 1680, height: 1000 } });
await context.addInitScript(() => { localStorage.setItem('i18nextLng', 'zh'); localStorage.setItem('theme', 'light'); });
const page = await context.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('[pageerror] ' + String(e).slice(0, 250)));
page.on('console', (m) => { if (m.type() === 'error') errs.push('[console] ' + m.text().slice(0, 250)); });
const bad = [];
page.on('response', (r) => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url().replace('http://47.236.98.226:9003', '')); });
await page.goto('http://47.236.98.226:9003/', { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.evaluate(async () => {
    await fetch('/api/orchestrate/rest/v1/orchestrate/auth/login', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'openan2026_' }),
    });
});
await page.goto('http://47.236.98.226:9003/observation/third-party', { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(6000);
const s = await page.evaluate(() => ({
    pluginRoot: document.querySelectorAll('.obs-plugin-root').length,
    cards: document.querySelectorAll('[class*=tobs-card]').length,
    text: document.body.textContent.replace(/\s+/g, ' ').slice(0, 200),
}));
console.log('STATE:', JSON.stringify(s, null, 1));
console.log('ERRORS:', errs.length ? errs.slice(0, 6) : 'NONE');
console.log('BAD:', bad.length ? bad.slice(0, 6) : 'NONE');
await page.screenshot({ path: 'D:/OpenAN/tmp_3p_fresh.png', fullPage: false });
await browser.close();
console.log('DONE');

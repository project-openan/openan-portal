// Diagnose: the all-workflows button state + locale keys.
import { chromium } from 'playwright';

const URL = 'http://47.236.98.226:9003/';
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
await context.addInitScript(() => {
    localStorage.setItem('i18nextLng', 'zh');
    localStorage.setItem('theme', 'light');
});
const page = await context.newPage();
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(1500);
await page.evaluate(async () => {
    await fetch('/api/orchestrate/rest/v1/orchestrate/auth/login', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'openan2026_' }),
    });
});
await page.waitForTimeout(2000);
await page.goto(URL + 'execution', { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(5000);
const diag = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].map((b) => b.innerText.trim().slice(0, 20));
    const searchRelated = btns.filter((t) => t.includes('搜索') || t.includes('工作流') || t.includes('全部') || t.includes('模糊') || t.includes('精确'));
    return { searchRelated, totalButtons: btns.length };
});
console.log(JSON.stringify(diag, null, 1));
await browser.close();
console.log('DONE');

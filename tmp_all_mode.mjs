// E2E: 全部工作流 mode → list → dispatch button → screenshot.
import { chromium } from 'playwright';

const URL = 'http://47.236.98.226:9003/';
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
await context.addInitScript(() => {
    localStorage.setItem('i18nextLng', 'zh');
    localStorage.setItem('theme', 'light');
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.slice(0, 120)));
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
// 点击 全部工作流
await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.innerText.includes('全部工作流'));
    b?.click();
});
await page.waitForTimeout(3000);
const all = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('div')].filter((d) => d.innerText.includes('IG150') && d.querySelector('button'));
    const dispatchBtns = [...document.querySelectorAll('button')].filter((b) => b.innerText.includes('派发') || b.getAttribute('title')?.includes('派发'));
    const enabledDispatch = dispatchBtns.filter((b) => !b.disabled).length;
    return {
        allTabActive: [...document.querySelectorAll('button')].some((b) => b.innerText.includes('全部工作流') && b.className.includes('bg-white')),
        listItems: rows.length,
        sampleNames: rows.slice(0, 3).map((r) => r.innerText.split('\n')[0].slice(0, 30)),
        dispatchBtns: dispatchBtns.length,
        enabledDispatch,
    };
});
await page.screenshot({ path: 'D:/OpenAN/tmp_deploy_ec/all_mode.png', clip: { x: 0, y: 140, width: 1600, height: 760 } });
console.log(JSON.stringify({ all, errors: errors.slice(0, 3) }, null, 1));
await browser.close();
console.log('DONE');

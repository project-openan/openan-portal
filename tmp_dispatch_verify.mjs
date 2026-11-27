// E2E: all-mode → select a workflow → dispatch enabled → screenshot.
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
await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.innerText.includes('全部工作流'));
    b?.click();
});
await page.waitForTimeout(3000);
// 选中第一个工作流卡
await page.evaluate(() => {
    const card = [...document.querySelectorAll('div')].find((d) => d.innerText.includes('IG1504B') && d.querySelector('button'));
    card?.querySelector('button')?.click();
});
await page.waitForTimeout(2000);
const check = await page.evaluate(() => {
    const dispatchBtns = [...document.querySelectorAll('button')].filter((b) => b.innerText.includes('派发') || b.getAttribute('title')?.includes('派发'));
    const enabled = dispatchBtns.filter((b) => !b.disabled).length;
    const previewShown = document.body.innerText.includes('工作流预览');
    return { dispatchBtns: dispatchBtns.length, enabledDispatch: enabled, previewShown };
});
await page.screenshot({ path: 'D:/OpenAN/tmp_deploy_ec/all_mode_dispatch.png', clip: { x: 0, y: 140, width: 1600, height: 760 } });
console.log(JSON.stringify({ check, errors: errors.slice(0, 3) }, null, 1));
await browser.close();
console.log('DONE');

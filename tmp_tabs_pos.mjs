// E2E: tabs in the preview panel header + swimlane render + screenshot.
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
// 导入一个工作流到预览: 全部工作流 → 选第一个
await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.innerText.includes('全部工作流'));
    b?.click();
});
await page.waitForTimeout(2500);
await page.evaluate(() => {
    const card = [...document.querySelectorAll('div')].find((d) => d.innerText.includes('IG1504B') && d.querySelector('button'));
    card?.querySelector('button')?.click();
});
await page.waitForTimeout(3000);
// 页签位置检查: 在预览面板头部 (预览区域顶部) 而非页面左上角
const check = await page.evaluate(() => {
    const wfTab = [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '工作流预览');
    const r = wfTab?.getBoundingClientRect();
    return {
        found: !!wfTab,
        pos: r ? { x: Math.round(r.x), y: Math.round(r.y) } : null,
        hasInteractionTab: [...document.querySelectorAll('button')].some((b) => b.innerText.trim() === '交互预览'),
    };
});
// 点击交互预览
await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === '交互预览');
    b?.click();
});
await page.waitForTimeout(1500);
const topo = await page.evaluate(() => ({ svgs: document.querySelectorAll('svg').length }));
console.log(JSON.stringify({ check, topo, errors: errors.slice(0, 3) }, null, 1));
await page.screenshot({ path: 'D:/OpenAN/tmp_deploy_ec/tabs_in_preview.png', clip: { x: 0, y: 140, width: 1600, height: 760 } });
await browser.close();
console.log('DONE');

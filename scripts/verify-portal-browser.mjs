// SPDX-License-Identifier: Apache-2.0
// Shell + two real UMD adapters with controlled HTTP fixtures. This is not a
// substitute for a five-component production release or real business E2E.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { build, preview } from 'vite';
import { chromium } from 'playwright';
import { buildIntegrations } from './build-integrations.mjs';
import { installArtifact } from './plugin-artifacts.mjs';

const workspace = fileURLToPath(new URL('../', import.meta.url));
const originalCwd = process.cwd();
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-browser-regression-'));
let unauthorized = false, browser, production, example;
const backend = http.createServer((request, response) => {
    if (request.url === '/') { response.setHeader('Content-Type', 'text/html'); response.end('<h1>Editor origin fixture</h1>'); return; }
    const auth = request.url.endsWith('/auth/check');
    if (!auth && unauthorized) { response.writeHead(401, { 'Content-Type': 'application/json' }); response.end('{"message":"Component credential expired"}'); return; }
    const data = auth ? { authenticated: true, auth_required: true, username: 'browser-test', role: 'admin' }
        : Array.from({ length: 30 }, (_, index) => ({ session_id: `session-${index}`, psop_name: `Workflow ${index}`, status: 'running' }));
    response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ code: 200, status: 'success', data }));
});
try {
    await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve));
    const backendUrl = `http://127.0.0.1:${backend.address().port}`;
    process.env.BACKEND_URL = process.env.OBSERVATION_URL = backendUrl;
    const bundles = path.join(temporary, 'bundles');
    await buildIntegrations(bundles);
    await fs.writeFile(path.join(bundles, 'an-ontology/config.json'), JSON.stringify({ appUrl: backendUrl + '/' }));
    for (const id of ['observation-center', 'an-ontology']) await installArtifact(path.join(bundles, id), id, temporary);
    const configFile = path.join(workspace, 'portal/vite.config.js');
    const dist = path.join(temporary, 'shell');
    // Match npm -w portal run build: Tailwind resolves its config from cwd.
    process.chdir(path.join(workspace, 'portal'));
    await build({ configFile, root: path.join(workspace, 'portal'), publicDir: path.join(temporary, 'portal/public'),
        build: { outDir: dist, emptyOutDir: false }, plugins: [{ name: 'browser-fixture-config', enforce: 'pre',
            transform(_source, id) {
                if (id.replaceAll('\\', '/').endsWith('/portal/src/plugins.config.js')) {
                    return 'export default {plugins:["observation-center","an-ontology"].map(id=>({id,mode:"bundle",entry:"/plugins/"+id}))}';
                }
            },
        }] });
    production = await preview({ configFile, root: path.join(workspace, 'portal'), build: { outDir: dist }, preview: { host: '127.0.0.1', port: 0 } });
    const url = `http://127.0.0.1:${production.httpServer.address().port}`;
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    await page.addInitScript(() => localStorage.setItem('i18nextLng', 'en'));
    await page.goto(url + '/observation');
    await page.getByRole('button', { name: 'Workflow 0', exact: true }).waitFor();
    const panel = page.locator('.openan-integration');
    await page.mouse.move(700, 400); await page.mouse.wheel(0, 6000);
    await page.waitForFunction(() => [...document.querySelectorAll('.openan-integration button')].at(-1).getBoundingClientRect().bottom <= innerHeight);
    assert(await panel.evaluate(element => element.scrollTop > 0), 'wheel must scroll the adapter, not be clipped');
    const last = await page.getByRole('button', { name: 'Workflow 29', exact: true }).boundingBox();
    assert(last.y + last.height <= 768, 'last session must be reachable by wheel');
    await panel.focus(); await page.keyboard.press('Home');
    await page.waitForFunction(() => document.querySelector('.openan-integration').scrollTop === 0);
    assert.equal(await panel.evaluate(element => element.scrollTop), 0, 'keyboard Home must reach the beginning');
    unauthorized = true;
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: '401' }).waitFor();
    assert.equal(await page.locator('input[type=password]').count(), 0, 'independent 401 must not log out the host');
    unauthorized = false;
    await page.goto(url + '/ontology');
    await page.locator('iframe').waitFor();
    await page.setViewportSize({ width: 800, height: 480 });
    await panel.focus(); await page.keyboard.press('End');
    await page.waitForFunction(() => document.querySelector('iframe').getBoundingClientRect().bottom <= innerHeight);
    assert(await panel.evaluate(element => element.scrollTop > 0), 'small viewport must reach the editor bottom');
    const frame = await page.locator('iframe').boundingBox(); assert(frame.y + frame.height <= 480);

    const hanging = await browser.newPage();
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    const handler = async route => { await pending; await route.abort().catch(() => {}); };
    await hanging.route('**/plugins/observation-center/plugin.manifest.json', handler);
    await hanging.goto(url + '/ontology', { waitUntil: 'domcontentloaded' });
    await hanging.getByRole('alert').filter({ hasText: 'timed out' }).waitFor({ timeout: 22000 });
    assert(await hanging.locator('main').isVisible());
    await hanging.getByRole('button', { name: 'Settings', exact: true }).click();
    assert(await hanging.getByRole('button', { name: 'Plugin Management', exact: true }).isVisible());
    release(); await hanging.unroute('**/plugins/observation-center/plugin.manifest.json', handler);
    await hanging.goto(url + '/observation'); await hanging.getByRole('button', { name: 'Workflow 0', exact: true }).waitFor();

    const hello = path.join(workspace, 'plugins/hello-portal');
    const helloDist = path.join(temporary, 'hello');
    await build({ configFile: path.join(hello, 'vite.config.js'), root: hello, build: { outDir: helloDist, emptyOutDir: false } });
    example = await preview({ configFile: path.join(hello, 'vite.config.js'), root: hello, build: { outDir: helloDist }, preview: { host: '127.0.0.1', port: 0 } });
    const sample = await browser.newPage();
    await sample.goto(`http://127.0.0.1:${example.httpServer.address().port}`);
    await sample.getByRole('heading', { name: 'Hello Portal', exact: true }).waitFor();
    assert((await sample.locator('body').innerText()).includes('User: admin'));
    const before = await sample.locator('section').evaluate(element => element.style.background);
    await sample.getByRole('button', { name: 'Toggle theme', exact: true }).click();
    assert.notEqual(await sample.locator('section').evaluate(element => element.style.background), before);
    console.log('Browser regressions passed: wheel, keyboard, small editor viewport, component 401, pending plugin/recovery, standalone SDK example');
} finally {
    process.chdir(originalCwd);
    await browser?.close();
    for (const server of [production, example]) if (server) await new Promise(resolve => server.httpServer.close(resolve));
    await new Promise(resolve => backend.close(resolve));
    assert.equal(path.dirname(temporary), os.tmpdir()); assert.match(path.basename(temporary), /^portal-browser-regression-/);
    await fs.rm(temporary, { recursive: true, force: true });
}

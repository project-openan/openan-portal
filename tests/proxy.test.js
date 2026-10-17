// @vitest-environment node
import { afterAll, beforeAll, expect, test } from 'vitest';
import { createServer, preview } from 'vite';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { backendProxy } from '../scripts/backend-proxy.js';
import portalConfig from '../portal/vite.config.js';

let upstream, dev, production, temp, devUrl, previewUrl;
beforeAll(async () => {
    upstream = http.createServer((request, response) => {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ path: request.url }));
    });
    await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
    const target = `http://127.0.0.1:${upstream.address().port}`;
    const env = { BACKEND_URL: target, REGISTRY_URL: target, OBSERVATION_URL: target };
    temp = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-proxy-test-'));
    await fs.writeFile(path.join(temp, 'index.html'), '<h1>shell</h1>');
    dev = await createServer({ configFile: path.resolve('portal/vite.config.js'), root: path.resolve('portal'),
        server: { port: 0, host: '127.0.0.1', proxy: backendProxy(env) }, optimizeDeps: { noDiscovery: true, include: [] } });
    await dev.listen(); devUrl = `http://127.0.0.1:${dev.httpServer.address().port}`;
    production = await preview({ configFile: path.resolve('portal/vite.config.js'), root: path.resolve('portal'),
        build: { outDir: temp }, preview: { port: 0, host: '127.0.0.1', proxy: backendProxy(env) } });
    previewUrl = `http://127.0.0.1:${production.httpServer.address().port}`;
});
afterAll(async () => {
    await dev?.close();
    if (production) await new Promise(resolve => production.httpServer.close(resolve));
    if (upstream) await new Promise(resolve => upstream.close(resolve));
    if (temp) {
        expect(path.dirname(temp)).toBe(os.tmpdir()); expect(path.basename(temp)).toMatch(/^portal-proxy-test-/);
        await fs.rm(temp, { recursive: true, force: true });
    }
});
test.each([
    ['/api/registry-center/rest/v1/registry-center/agent-cards', '/rest/v1/registry-center/agent-cards'],
    ['/api/registry/rest/v1/registry/agent-cards', '/rest/v1/registry-center/agent-cards'],
    ['/api/registry/rest/v1/registry-center/agent-cards', '/rest/v1/registry-center/agent-cards'],
    ['/api/orchestrate/rest/v1/orchestrate/dispatch?intent=probe', '/rest/v1/orchestrate/dispatch?intent=probe'],
    ['/rest/v1/orchestrate/workflows', '/rest/v1/orchestrate/workflows'],
    ['/api/observe/rest/v1/observe/traces?probe=true', '/rest/v1/observe/traces?probe=true'],
    ['/rest/v1/registry-center/agents/health/stream', '/rest/v1/registry-center/agents/health/stream'],
])('%s routes consistently in dev and preview', async (url, expected) => {
    for (const base of [devUrl, previewUrl]) {
        const response = await fetch(`${base}${url}`);
        expect(response.headers.get('content-type')).toContain('application/json');
        expect(await response.json()).toEqual({ path: expected });
    }
});
test('prefix lookalikes cannot match the backend gateway', () => {
    const keys = Object.keys(backendProxy());
    for (const path of ['/api/registry-other/rest', '/api/orchestrate-evil/rest', '/api/observe-evil/rest', '/api/ontology/health']) {
        expect(keys.some(key => new RegExp(key).test(path))).toBe(false);
    }
});
test('real dev and preview config both use the canonical proxy table', () => {
    const expected = backendProxy();
    for (const table of [portalConfig.server.proxy, portalConfig.preview.proxy]) {
        expect(Object.keys(table)).toEqual(Object.keys(expected));
        for (const key of Object.keys(expected)) {
            expect({ ...table[key], rewrite: undefined }).toEqual({ ...expected[key], rewrite: undefined });
            expect(table[key].rewrite?.toString()).toBe(expected[key].rewrite?.toString());
        }
    }
});
test('observation gateway rejects ingestion writes in dev and preview', async () => {
    for (const base of [devUrl, previewUrl]) {
        const response = await fetch(`${base}/api/observe/rest/v1/observe/live/events/probe`, { method: 'POST', body: '{}' });
        expect(response.status).toBe(404);
    }
});

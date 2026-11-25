// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { inspectArtifact, installArtifact, validateArtifacts } from '../scripts/plugin-artifacts.mjs';

let temp;
beforeEach(async () => { temp = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-delivery-test-')); });
afterEach(async () => {
    expect(path.dirname(temp)).toBe(os.tmpdir()); expect(path.basename(temp)).toMatch(/^portal-delivery-test-/);
    await fs.rm(temp, { recursive: true, force: true });
});
const artifact = async (id = 'registry-center', extraRoutes = []) => {
    const directory = path.join(temp, 'portal/public/plugins', id); await fs.mkdir(directory, { recursive: true });
    const extra = extraRoutes.filter(routePath => routePath !== `/${id}`).map(routePath => ({ path: routePath }));
    const manifest = { id, name: id, version: '1.0.0', routes: [{ path: `/${id}` }, ...extra], entry: 'index.js', css: 'index.css' };
    await fs.writeFile(path.join(directory, 'plugin.manifest.json'), JSON.stringify(manifest));
    await fs.writeFile(path.join(directory, 'index.js'), `window.__OPENAN_PLUGIN__${id.replaceAll('-', '_')}={default:function(){}};`);
    await fs.writeFile(path.join(directory, 'index.css'), 'body{}'); return { directory, manifest };
};
test('release inventory requires enabled bundles, records hashes and ignores disabled optional ones', async () => {
    await fs.mkdir(path.join(temp, 'portal'), { recursive: true });
    await fs.writeFile(path.join(temp, 'portal/bundled-plugins.json'), JSON.stringify([
        { id: 'registry-center', enabled: true, entry: '/plugins/registry-center' },
        { id: 'ontology-demo', enabled: false, entry: '/plugins/ontology-demo' },
    ]));
    await expect(validateArtifacts(temp)).rejects.toThrow(); await artifact();
    const records = await validateArtifacts(temp); expect(records).toHaveLength(1);
    expect(records[0].sha256['index.js']).toMatch(/^[a-f0-9]{64}$/);
});
test('missing asset, wrong id and traversal are rejected before installation', async () => {
    const { directory, manifest } = await artifact();
    await expect(inspectArtifact(directory, 'wrong-id')).rejects.toThrow('invalid plugin manifest');
    await fs.unlink(path.join(directory, 'index.css'));
    await expect(inspectArtifact(directory, 'registry-center')).rejects.toThrow();
    manifest.entry = '../escape.js'; await fs.writeFile(path.join(directory, 'plugin.manifest.json'), JSON.stringify(manifest));
    await expect(inspectArtifact(directory, 'registry-center')).rejects.toThrow('unsafe artifact');
});
test('installation includes nested showroom config and images, and hashes every published file', async () => {
    const { directory } = await artifact('virtual-showroom');
    await fs.mkdir(path.join(directory, 'images'));
    await fs.writeFile(path.join(directory, 'cards.json'), '{"cards":[]}');
    await fs.writeFile(path.join(directory, 'images/demo.svg'), '<svg/>');
    await fs.writeFile(path.join(directory, 'lazy.js'), '/* auxiliary chunk has no UMD global */');
    const destination = path.join(temp, 'installed');
    const inspected = await installArtifact(directory, 'virtual-showroom', destination);
    expect(inspected.sha256['cards.json']).toMatch(/^[a-f0-9]{64}$/);
    expect(inspected.sha256['images/demo.svg']).toMatch(/^[a-f0-9]{64}$/);
    expect(await fs.readFile(path.join(destination, 'portal/public/plugins/virtual-showroom/images/demo.svg'), 'utf8')).toBe('<svg/>');
    expect(await fs.readFile(path.join(destination, 'portal/public/plugins/virtual-showroom/cards.json'), 'utf8')).toBe('{"cards":[]}');
});
test.each(['.env', 'private.key', 'credentials.pem'])('non-public artifact %s is rejected before any copying', async name => {
    const { directory } = await artifact();
    await fs.writeFile(path.join(directory, name), 'test placeholder');
    await expect(installArtifact(directory, 'registry-center', path.join(temp, 'installed'))).rejects.toThrow(/artifact/i);
    expect(existsSync(path.join(temp, 'installed'))).toBe(false);
});
test('all six upstream bundle registrations are preserved in the single JSON registry', async () => {
    const registry = JSON.parse(await fs.readFile('portal/bundled-plugins.json', 'utf8'));
    expect(registry.filter(entry => entry.enabled !== false).map(entry => entry.id)).toEqual([
        'registry-center', 'orchestration-center', 'observation-center', 'virtual-showroom', 'an-ontology', 'scenario-showcase',
    ]);
    expect(registry.some(entry => entry.id === 'ontology-demo')).toBe(false);
    const source = await fs.readFile('portal/src/plugins.config.js', 'utf8');
    expect(source).toContain("import bundledPlugins from '../bundled-plugins.json'");
    expect(source).not.toContain('const bundledPlugins =');
    for (const entry of registry) {
        // The synthetic artifacts below carry one placeholder route each, so the
        // native-page contract is asserted by the dedicated test further down
        // against the manifests committed under portal/public/plugins.
        await artifact(entry.id, entry.requiredRoutes);
    }
    await fs.writeFile(path.join(temp, 'portal/bundled-plugins.json'), JSON.stringify(registry));
    expect((await validateArtifacts(temp)).map(entry => entry.id)).toEqual(registry.map(entry => entry.id));
});

test('registered bundles declare only routes their shipped artifact actually provides', async () => {
    // Reads the manifests committed under portal/public/plugins instead of
    // synthesising them from requiredRoutes: a registry entry that outruns its
    // artifact breaks the release build and the runtime bundle loader.
    const registry = JSON.parse(await fs.readFile('portal/bundled-plugins.json', 'utf8'));
    for (const entry of registry) {
        if (!entry.requiredRoutes) continue;
        expect(Array.isArray(entry.requiredRoutes), `${entry.id} requiredRoutes must be an array`).toBe(true);
        const manifestPath = path.join('portal/public/plugins', entry.id, 'plugin.manifest.json');
        const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
        const provided = new Set(manifest.routes.map(route => route.path));
        const missing = entry.requiredRoutes.filter(routePath => !provided.has(routePath));
        expect(missing, `${entry.id} artifact is missing required pages: ${missing.join(', ')}`).toEqual([]);
    }
});
test('every Docker COPY input exists and the release build is mandatory', async () => {
    const docker = await fs.readFile('Dockerfile', 'utf8');
    for (const match of docker.matchAll(/^COPY (?!--)(\S+)\s+/gm)) expect(existsSync(match[1])).toBe(true);
    expect(docker).toContain('npm run build:release');
});

function bashBinary() {
    if (process.env.BASH_BIN) return process.env.BASH_BIN;
    if (process.platform !== 'win32') return 'bash';
    try { return path.resolve(execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim(), '../../../bin/bash.exe'); }
    catch { return null; }
}
const bash = bashBinary();
const run = (command, ...args) => spawnSync(bash, ['-c', command, 'probe', ...args], { cwd: process.cwd(), encoding: 'utf8' });
test.skipIf(!bash)('custom web root and ports render correctly; unsafe input is rejected', () => {
    const command = 'source scripts/deploy-common.sh; WEB_ROOT="$1"; PORT1="$2"; PORT2=8081; validate_deploy_args || exit 1; NGINX_CONF_SRC=scripts/openan-portal.nginx.conf; render_nginx';
    const result = run(command, '/data/portal test', '8080'); expect(result.status).toBe(0);
    expect(result.stdout).toContain('root "/data/portal test";'); expect(result.stdout).toContain('listen 8080;');
    expect(result.stdout).not.toContain('__WEB_ROOT__');
    for (const unsafe of ['/', '/data/../etc', '/data/bad";injected']) expect(run(command, unsafe, '8080').status).not.toBe(0);
    expect(run(command, '/data/portal', '65536').status).not.toBe(0);
});
test.skipIf(!bash)('deployment rejects an enabled list inconsistent with its release inventory', async () => {
    await fs.writeFile(path.join(temp, 'plugins.enabled'), 'registry-center\n');
    await fs.writeFile(path.join(temp, 'plugins.release.json'), '[]');
    const result = run('source scripts/deploy-common.sh; WEB_ROOT="$1"; PORT1=8080; curl(){ [[ "$*" != *ontology-demo* ]] || return 1; printf 200; }; check_plugins', temp.replaceAll('\\', '/'));
    expect(result.status).not.toBe(0); expect(result.stdout).not.toContain('ontology-demo');
});
test.each([{ backend: {} }, { menu: [{}] }, { onInit: 'unsupported' }, { backend: { gateway: '/api/example', authScope: 'unknown' } }])('publication uses the same declarative schema for %j', async extra => {
    const { directory, manifest } = await artifact();
    await fs.writeFile(path.join(directory, 'plugin.manifest.json'), JSON.stringify({ ...manifest, ...extra }));
    await expect(inspectArtifact(directory, manifest.id)).rejects.toThrow('Invalid plugin manifest');
});
test('release rejects duplicate ids and cross-plugin route collisions', async () => {
    const first = await artifact('first'); const second = await artifact('second');
    const registry = [{ id: 'first', entry: '/plugins/first' }, { id: 'second', entry: '/plugins/second' }];
    await fs.writeFile(path.join(temp, 'portal/bundled-plugins.json'), JSON.stringify([...registry, registry[0]]));
    await expect(validateArtifacts(temp)).rejects.toThrow('Duplicate');
    second.manifest.routes = first.manifest.routes;
    await fs.writeFile(path.join(second.directory, 'plugin.manifest.json'), JSON.stringify(second.manifest));
    await fs.writeFile(path.join(temp, 'portal/bundled-plugins.json'), JSON.stringify(registry));
    await expect(validateArtifacts(temp)).rejects.toThrow('Duplicate');
});

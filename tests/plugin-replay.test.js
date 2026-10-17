// @vitest-environment node
// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, expect, test } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';

let temp, main, index, program;
const required = ['registry-center', 'orchestration-center', 'observation-center', 'virtual-showroom', 'an-ontology'];
const entry = id => ({ id, mode: 'bundle', entry: `/plugins/${id}`, enabled: true });
beforeEach(async () => {
    temp = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-replay-test-'));
    await fs.mkdir(path.join(temp, 'assets'));
    main = path.join(temp, 'assets/index-test.js'); index = path.join(temp, 'index.html');
    await fs.writeFile(index, '<html><head></head><body><script src="/assets/index-test.js"></script></body></html>');
    const script = (await fs.readFile('scripts/apply-plugin-registration.sh', 'utf8')).replaceAll('\r\n', '\n');
    program = script.split("<<'PY'\n")[1].split('\nPY')[0];
});
afterEach(async () => {
    expect(path.dirname(temp)).toBe(os.tmpdir()); expect(path.basename(temp)).toMatch(/^portal-replay-test-/);
    await fs.rm(temp, { recursive: true, force: true });
});
function replay(url = '', env = {}) {
    return spawnSync(process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), ['-c', program, temp, url], { encoding: 'utf8', env: { ...process.env, ...env } });
}

test('non-UTF8 Windows console encoding cannot fail an otherwise successful replay', async () => {
    await fs.writeFile(main, `var registry=${JSON.stringify(required.map(entry))};`);
    const result = replay('', { PYTHONIOENCODING: 'cp1252' });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('插件注册就绪');
});

test.each(['legacy', 'partial', 'current'])('replay handles %s registry without duplicate registrations or invalid JS', async kind => {
    const original = kind === 'legacy'
        ? 'var oldName=[{id:`registry-center`,mode:`bundle`,entry:`/plugins/registry-center`,enabled:!0},{id:`orchestration-center`,mode:`bundle`,entry:`/plugins/orchestration-center`,enabled:!0}];'
        : `var anyName=${JSON.stringify((kind === 'partial' ? required.slice(0, 3) : required).map(entry))};`;
    await fs.writeFile(main, original);
    const result = replay(); expect(result.status, result.stderr).toBe(0);
    const patched = await fs.readFile(main, 'utf8');
    const sandbox = {}; new vm.Script(patched).runInNewContext(sandbox);
    expect((sandbox.oldName || sandbox.anyName).map(item => item.id)).toEqual(required);
    if (kind === 'current') expect(patched).toBe(original);
    expect(replay().status).toBe(0);
    expect(await fs.readFile(main, 'utf8')).toBe(patched);
});
test('obsolete plugin is removed and intentional disabled flags remain intact', async () => {
    await fs.writeFile(main, `var registry=${JSON.stringify([...required.map(id => ({ ...entry(id), enabled: false })), entry('ontology-demo')])};`);
    expect(replay().status).toBe(0);
    const sandbox = {}; new vm.Script(await fs.readFile(main, 'utf8')).runInNewContext(sandbox);
    expect(sandbox.registry.map(item => item.id)).toEqual(required);
    expect(sandbox.registry.every(item => item.enabled === false)).toBe(true);
});
test('unknown or ambiguous builds fail without changing deployed files', async () => {
    const html = await fs.readFile(index, 'utf8');
    for (const original of ['var unknown=[];', `var a=${JSON.stringify(required.map(entry))},b=${JSON.stringify(required.map(entry))};`]) {
        await fs.writeFile(main, original);
        expect(replay('https://example.com/view').status).not.toBe(0);
        expect(await fs.readFile(main, 'utf8')).toBe(original);
        expect(await fs.readFile(index, 'utf8')).toBe(html);
    }
});
test('ontology URL is safely encoded and refreshes only one configuration script', async () => {
    await fs.writeFile(main, `var registry=${JSON.stringify(required.map(entry))};`);
    const maliciousLookingUrl = "https://example.com/view?q='</script><script>alert(1)</script>";
    expect(replay(maliciousLookingUrl).status).toBe(0);
    let html = await fs.readFile(index, 'utf8');
    expect(html).toContain('\\u003c/script>');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(replay('https://example.com/new').status).toBe(0);
    html = await fs.readFile(index, 'utf8');
    expect(html.match(/__OPENAN_ONTOLOGY_APP_URL__/g)).toHaveLength(1);
    expect(html).toContain('https://example.com/new');
    const before = html;
    expect(replay('javascript:alert(1)').status).not.toBe(0);
    expect(await fs.readFile(index, 'utf8')).toBe(before);
});

// Copyright (c) 2026 Huawei Technologies Co., Ltd.
// All Rights Reserved.
//
// SPDX-License-Identifier: Apache-2.0
//
//    Licensed under the Apache License, Version 2.0 (the "License"); you may
//    not use this file except in compliance with the License. You may obtain
//    a copy of the License at
//
//         http://www.apache.org/licenses/LICENSE-2.0
//
//    Unless required by applicable law or agreed to in writing, software
//    distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
//    WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
//    License for the specific language governing permissions and limitations
//    under the License.

import { afterEach, expect, test, vi } from 'vitest';
import { loadPluginBundle } from '../portal/src/bundle-loader.js';
import i18n from '../portal/src/i18n/index.js';

const manifest = (id, extra = {}) => ({ id, name: id, version: '1', routes: [{ path: `/${id}` }], entry: 'index.js', ...extra });

let tid = 0;
afterEach(() => {
    vi.useRealTimers();
    delete window.__OPENAN_BUNDLE_GLOBALS_READY__;
    document.head.querySelectorAll('script[src*="/plugins/gap"],link[href*="/plugins/gap"]').forEach(el => el.remove());
});

function setup(id, m, appendImpl) {
    window.__OPENAN_BUNDLE_GLOBALS_READY__ = true;
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => m })));
    vi.spyOn(document.head, 'appendChild').mockImplementation(appendImpl || (el => {
        if (el.tagName === 'SCRIPT') window[`__OPENAN_PLUGIN__${id.replace(/-/g, '_')}`] = () => null;
        queueMicrotask(() => el.onload());
        return el;
    }));
    return { id, entry: `/plugins/${id}` };
}

test('TC-BUNDLE-105 | already-ready globals are not re-initialised', async () => {
    const id = `gap-${++tid}`;
    const cfg = setup(id, manifest(id));
    const result = await loadPluginBundle(cfg, { timeoutMs: 10000 });
    expect(result.id).toBe(id);
    expect(window.require).toBeUndefined();
});

test('TC-BUNDLE-109 | trailing slashes in entry are stripped', async () => {
    const id = `gap-${++tid}`;
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => manifest(id) })));
    vi.spyOn(document.head, 'appendChild').mockImplementation(el => {
        window[`__OPENAN_PLUGIN__${id.replace(/-/g, '_')}`] = () => null;
        queueMicrotask(() => el.onload());
        return el;
    });
    window.__OPENAN_BUNDLE_GLOBALS_READY__ = true;
    const result = await loadPluginBundle({ id, entry: `/plugins/${id}//` }, { timeoutMs: 10000 });
    expect(result._baseUrl).toBe(`/plugins/${id}`);
});

test('TC-BUNDLE-110 | non-array requiredRoutes is rejected', async () => {
    const id = `gap-${++tid}`;
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => manifest(id) })));
    window.__OPENAN_BUNDLE_GLOBALS_READY__ = true;
    await expect(loadPluginBundle({ id, entry: `/plugins/${id}`, requiredRoutes: '/build' }))
        .rejects.toThrow('must be an array');
});

test('TC-BUNDLE-110b | requiredRoutes missing native pages are rejected', async () => {
    const id = `gap-${++tid}`;
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => manifest(id, { routes: [{ path: '/only' }] }) })));
    window.__OPENAN_BUNDLE_GLOBALS_READY__ = true;
    await expect(loadPluginBundle({ id, entry: `/plugins/${id}`, requiredRoutes: ['/only', '/missing'] }))
        .rejects.toThrow('missing required');
});

test('TC-BUNDLE-111 | manifest id mismatch with config entry is rejected', async () => {
    const id = `gap-${++tid}`;
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => manifest('different-id') })));
    window.__OPENAN_BUNDLE_GLOBALS_READY__ = true;
    await expect(loadPluginBundle({ id, entry: `/plugins/${id}` }))
        .rejects.toThrow('does not match');
});

test('TC-BUNDLE-112 | missing global after script load is rejected', async () => {
    const id = `gap-${++tid}`;
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => manifest(id) })));
    vi.spyOn(document.head, 'appendChild').mockImplementation(el => {
        queueMicrotask(() => el.onload());
        return el;
    });
    window.__OPENAN_BUNDLE_GLOBALS_READY__ = true;
    await expect(loadPluginBundle({ id, entry: `/plugins/${id}` }))
        .rejects.toThrow('not set');
});

test('TC-BUNDLE-113 | function bundle without default property is used as default export directly', async () => {
    const id = `gap-${++tid}`;
    const gkey = `__OPENAN_PLUGIN__${id.replace(/-/g, '_')}`;
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => manifest(id) })));
    vi.spyOn(document.head, 'appendChild').mockImplementation(el => {
        if (el.tagName === 'SCRIPT') window[gkey] = function Comp() { return null; };
        queueMicrotask(() => el.onload());
        return el;
    });
    window.__OPENAN_BUNDLE_GLOBALS_READY__ = true;
    const result = await loadPluginBundle({ id, entry: `/plugins/${id}` });
    const comp = await result.routes[0].component();
    expect(typeof comp.default).toBe('function');
});

test('TC-BUNDLE-114 | namespace-style labelKeys are rewritten and zh translations registered', async () => {
    const id = `gap-${++tid}`;
    const gkey = `__OPENAN_PLUGIN__${id.replace(/-/g, '_')}`;
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => manifest(id, {
        menu: [
            { id: 'm1', labelKey: 'plugin:menu.title', label: 'Execution Center', route: '/gap', icon: () => null, order: 1 },
            { id: 'm2', labelKey: 'plain-label', label: 'Orchestration Center', route: '/orch', icon: () => null, order: 2, group: 'Demo Showcase' },
        ],
    }) })));
    vi.spyOn(document.head, 'appendChild').mockImplementation(el => {
        if (el.tagName === 'SCRIPT') window[gkey] = () => null;
        queueMicrotask(() => el.onload());
        return el;
    });
    window.__OPENAN_BUNDLE_GLOBALS_READY__ = true;
    const result = await loadPluginBundle({ id, entry: `/plugins/${id}` });
    expect(result.menu[0].labelKey).toBe('Execution Center');
    expect(result.menu[1].labelKey).toBe('plain-label');
    expect(i18n.getFixedT('zh')('Execution Center')).toBe('执行中心');
    expect(i18n.getFixedT('zh')('Demo Showcase')).toBe('虚拟展厅');
});

test('TC-BUNDLE-115 | http entry URL is detected as remote mode', async () => {
    const id = `gap-${++tid}`;
    const gkey = `__OPENAN_PLUGIN__${id.replace(/-/g, '_')}`;
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => manifest(id) })));
    vi.spyOn(document.head, 'appendChild').mockImplementation(el => {
        if (el.tagName === 'SCRIPT') window[gkey] = () => null;
        queueMicrotask(() => el.onload());
        return el;
    });
    window.__OPENAN_BUNDLE_GLOBALS_READY__ = true;
    const result = await loadPluginBundle({ id, entry: `http://localhost:5000/plugins/${id}` });
    expect(result._loadMode).toBe('remote');
    expect(result._baseUrl).toBe(`http://localhost:5000/plugins/${id}`);
});

test('TC-BUNDLE-116 | local entry path is detected as local mode', async () => {
    const id = `gap-${++tid}`;
    const gkey = `__OPENAN_PLUGIN__${id.replace(/-/g, '_')}`;
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => manifest(id) })));
    vi.spyOn(document.head, 'appendChild').mockImplementation(el => {
        if (el.tagName === 'SCRIPT') window[gkey] = () => null;
        queueMicrotask(() => el.onload());
        return el;
    });
    window.__OPENAN_BUNDLE_GLOBALS_READY__ = true;
    const result = await loadPluginBundle({ id, entry: `/plugins/${id}` });
    expect(result._loadMode).toBe('local');
});

test('TC-BUNDLE-117 | manifest with css loads the stylesheet before the script', async () => {
    const id = `gap-${++tid}`;
    const gkey = `__OPENAN_PLUGIN__${id.replace(/-/g, '_')}`;
    const loadOrder = [];
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => manifest(id, { css: 'style.css' }) })));
    vi.spyOn(document.head, 'appendChild').mockImplementation(el => {
        loadOrder.push(el.tagName);
        if (el.tagName === 'SCRIPT') window[gkey] = () => null;
        queueMicrotask(() => el.onload());
        return el;
    });
    window.__OPENAN_BUNDLE_GLOBALS_READY__ = true;
    await loadPluginBundle({ id, entry: `/plugins/${id}` });
    expect(loadOrder).toEqual(['LINK', 'SCRIPT']);
});

test('TC-BUNDLE-106 | fetchJson retries once after a transient failure then succeeds', async () => {
    const id = `gap-${++tid}`;
    const gkey = `__OPENAN_PLUGIN__${id.replace(/-/g, '_')}`;
    vi.useFakeTimers();
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
        calls++;
        if (calls === 1) return { ok: false, status: 503 };
        return { ok: true, json: async () => manifest(id) };
    }));
    vi.spyOn(document.head, 'appendChild').mockImplementation(el => {
        if (el.tagName === 'SCRIPT') window[gkey] = () => null;
        queueMicrotask(() => el.onload());
        return el;
    });
    window.__OPENAN_BUNDLE_GLOBALS_READY__ = true;
    const pending = loadPluginBundle({ id, entry: `/plugins/${id}` }, { timeoutMs: 10000 });
    await vi.advanceTimersByTimeAsync(1000);
    const result = await pending;
    expect(result.id).toBe(id);
    expect(calls).toBe(2);
});

test('TC-BUNDLE-107 | fetchJson exhausts retries and throws last error', async () => {
    const id = `gap-${++tid}`;
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })));
    window.__OPENAN_BUNDLE_GLOBALS_READY__ = true;
    const pending = expect(loadPluginBundle({ id, entry: `/plugins/${id}` }, { timeoutMs: 10000 })).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(1000);
    await pending;
    expect(fetch).toHaveBeenCalledTimes(2);
});

test('TC-BUNDLE-108 | script onerror triggers retry and eventual success', async () => {
    const id = `gap-${++tid}`;
    const gkey = `__OPENAN_PLUGIN__${id.replace(/-/g, '_')}`;
    vi.useFakeTimers();
    let scriptCalls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => manifest(id) })));
    vi.spyOn(document.head, 'appendChild').mockImplementation(el => {
        if (el.tagName === 'SCRIPT') {
            scriptCalls++;
            if (scriptCalls === 1) { queueMicrotask(() => el.onerror()); return el; }
            window[gkey] = () => null;
            queueMicrotask(() => el.onload());
            return el;
        }
        queueMicrotask(() => el.onload());
        return el;
    });
    window.__OPENAN_BUNDLE_GLOBALS_READY__ = true;
    const pending = loadPluginBundle({ id, entry: `/plugins/${id}` }, { timeoutMs: 10000 });
    await vi.advanceTimersByTimeAsync(1000);
    const result = await pending;
    expect(result.id).toBe(id);
    expect(scriptCalls).toBe(2);
});

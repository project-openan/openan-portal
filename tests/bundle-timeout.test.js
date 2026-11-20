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

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { loadPluginBundle } from '../portal/src/bundle-loader.js';

const manifest = id => ({ id, name: id, version: '1', routes: [{ path: `/${id}` }], entry: 'index.js' });
beforeEach(() => { vi.useFakeTimers(); window.__OPENAN_BUNDLE_GLOBALS_READY__ = true; });
afterEach(() => {
    vi.useRealTimers(); delete window.__OPENAN_BUNDLE_GLOBALS_READY__;
    document.head.querySelectorAll('script[src*="deadline-"],link[href*="deadline-"]').forEach(element => element.remove());
});
const tick = async () => { await vi.advanceTimersByTimeAsync(50); };
test('pending manifest times out and aborts the HTTP request', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const failed = expect(loadPluginBundle({ id: 'deadline-manifest', entry: '/plugins/deadline-manifest' }, { timeoutMs: 25 })).rejects.toThrow('timed out');
    await tick(); await failed;
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
});
test('pending JS tag is removed and a later attempt can load successfully', async () => {
    const id = 'deadline-script';
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => manifest(id) })));
    const failed = expect(loadPluginBundle({ id, entry: `/plugins/${id}` }, { timeoutMs: 25 })).rejects.toThrow('timed out');
    await tick(); await failed;
    expect(document.querySelector(`script[src*="${id}"]`)).toBeNull();
    const append = document.head.appendChild.bind(document.head);
    vi.spyOn(document.head, 'appendChild').mockImplementation(element => {
        append(element); window.__OPENAN_PLUGIN__deadline_script = () => null;
        Promise.resolve().then(() => element.onload?.()); return element;
    });
    const ready = await loadPluginBundle({ id, entry: `/plugins/${id}` }, { timeoutMs: 25 });
    expect(ready.id).toBe(id);
});
test('pending CSS is removed, never cached as successful, and can recover', async () => {
    const id = 'deadline-style';
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ...manifest(id), css: 'index.css' }) })));
    const failed = expect(loadPluginBundle({ id, entry: `/plugins/${id}` }, { timeoutMs: 25 })).rejects.toThrow('timed out');
    await tick(); await failed;
    expect(document.querySelector(`link[href*="${id}"]`)).toBeNull();
    const append = document.head.appendChild.bind(document.head); let css = 0;
    vi.spyOn(document.head, 'appendChild').mockImplementation(element => {
        append(element); if (element.tagName === 'LINK') css++;
        window.__OPENAN_PLUGIN__deadline_style = () => null;
        Promise.resolve().then(() => element.onload?.()); return element;
    });
    await loadPluginBundle({ id, entry: `/plugins/${id}` }, { timeoutMs: 25 }); expect(css).toBe(1);
});
test('unsafe metadata is rejected before executing any script', async () => {
    const id = 'deadline-invalid';
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ...manifest(id), backend: {} }) })));
    const append = vi.spyOn(document.head, 'appendChild');
    await expect(loadPluginBundle({ id, entry: `/plugins/${id}` })).rejects.toThrow('backend.gateway'); expect(append).not.toHaveBeenCalled();
});

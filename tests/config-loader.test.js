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

import { expect, test, vi } from 'vitest';
import { loadEnabledPlugins } from '../packages/portal-sdk/src/config-loader.js';

const validManifest = (id = 'p1') => ({
    id, name: id, version: '1.0.0',
    routes: [{ path: '/p1', component: () => Promise.resolve(() => null) }],
    menu: [{ id: 'm1', labelKey: 'k', icon: () => null, order: 1, route: '/p1' }],
});

/* ── loadEnabledPlugins ── */

test('TC-LOAD-001 | null / non-array config returns empty array', async () => {
    // 输入: null, {}, {plugins: null}  预期: []  断言: 防回归 — 不应抛异常
    for (const c of [null, undefined, {}, { plugins: null }, 'string']) {
        expect(await loadEnabledPlugins(c)).toEqual([]);
    }
});

test('TC-LOAD-002 | no enabled plugins returns empty array', async () => {
    expect(await loadEnabledPlugins({ plugins: [{ id: 'a', enabled: false, manifest: () => ({ default: validManifest('a') }) }] })).toEqual([]);
});

test('TC-LOAD-003 | enabled plugin is loaded and validated', async () => {
    const manifest = validManifest('p1');
    const result = await loadEnabledPlugins({ plugins: [{ id: 'p1', enabled: true, manifest: () => ({ default: manifest }) }] });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('p1');
});

test('TC-LOAD-004 | plugins sorted by first menu item order', async () => {
    const mk = (id, order) => ({ id, manifest: () => ({ default: { ...validManifest(id), menu: [{ id: 'm', labelKey: 'k', icon: () => null, order, route: '/x' }] } }) });
    const result = await loadEnabledPlugins({ plugins: [
        { id: 'z', enabled: true, ...mk('z', 30) },
        { id: 'a', enabled: true, ...mk('a', 10) },
        { id: 'm', enabled: true, ...mk('m', 20) },
    ] });
    expect(result.map(m => m.id)).toEqual(['a', 'm', 'z']);
});

test('TC-LOAD-005 | plugins without menu sort with default order 999', async () => {
    const mk = (id, withMenu, order) => ({ id, manifest: () => ({ default: withMenu ? { ...validManifest(id), menu: [{ id: 'm', labelKey: 'k', icon: () => null, order, route: '/x' }] } : { ...validManifest(id), menu: undefined } }) });
    const result = await loadEnabledPlugins({ plugins: [
        { id: 'nomenu', enabled: true, ...mk('nomenu', false) },
        { id: 'withmenu', enabled: true, ...mk('withmenu', true, 1) },
    ] });
    expect(result.map(m => m.id)).toEqual(['withmenu', 'nomenu']);
});

test('TC-LOAD-006 | plugin without manifest loader triggers onError and is skipped', async () => {
    const errors = [];
    const result = await loadEnabledPlugins({ plugins: [{ id: 'bad', enabled: true }] }, { onError: (id, err) => errors.push(id) });
    expect(result).toEqual([]);
    expect(errors).toEqual(['bad']);
});

test('TC-LOAD-007 | plugin with mismatched id triggers onError and is skipped', async () => {
    const errors = [];
    const result = await loadEnabledPlugins(
        { plugins: [{ id: 'configured', enabled: true, manifest: () => ({ default: validManifest('different') }) }] },
        { onError: (id) => errors.push(id) }
    );
    expect(result).toEqual([]);
    expect(errors).toEqual(['configured']);
});

test('TC-LOAD-008 | invalid manifest triggers onError and is skipped', async () => {
    const errors = [];
    const result = await loadEnabledPlugins(
        { plugins: [{ id: 'p', enabled: true, manifest: () => ({ default: { id: 'p', name: 'p', version: '1.0.0', routes: [{ path: 'relative' }] } }) }] },
        { onError: (id, _err) => errors.push({ id, msg: _err.message }) }
    );
    expect(result).toEqual([]);
    expect(errors[0].id).toBe('p');
    expect(errors[0].msg).toContain('absolute');
});

test('TC-LOAD-009 | aborted signal suppresses onError but still returns empty', async () => {
    const errors = [];
    const controller = new AbortController();
    controller.abort();
    const result = await loadEnabledPlugins(
        { plugins: [{ id: 'bad', enabled: true }] },
        { signal: controller.signal, onError: (id) => errors.push(id) }
    );
    expect(result).toEqual([]);
    expect(errors).toEqual([]);
});

test('TC-LOAD-010 | default onError logs to console.error without throwing', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await loadEnabledPlugins({ plugins: [{ id: 'bad', enabled: true }] });
    expect(result).toEqual([]);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
});

test('TC-LOAD-011 | manifest without default export uses module directly', async () => {
    const manifest = validManifest('p1');
    const result = await loadEnabledPlugins({ plugins: [{ id: 'p1', enabled: true, manifest: () => manifest }] });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('p1');
});

test('TC-LOAD-012 | mixed valid and invalid plugins return only valid ones', async () => {
    const errors = [];
    const result = await loadEnabledPlugins(
        { plugins: [
            { id: 'good', enabled: true, manifest: () => ({ default: validManifest('good') }) },
            { id: 'bad', enabled: true },
        ] },
        { onError: (id) => errors.push(id) }
    );
    expect(result.map(m => m.id)).toEqual(['good']);
    expect(errors).toEqual(['bad']);
});

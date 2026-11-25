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

import { expect, test } from 'vitest';
import { validateManifest, validateManifestMetadata } from '../packages/portal-sdk/src/plugin-manifest.js';

const base = (id = 'p1') => ({
    id, name: id, version: '1.0.0',
    routes: [{ path: '/p1', component: () => Promise.resolve(() => null) }],
});

/* ── validateManifestMetadata edge branches ── */

test('TC-MANIFEST-101 | non-object manifest throws immediately', () => {
    // 输入: null, string  预期: Error "must be an object"  断言: 防回归
    expect(() => validateManifestMetadata(null)).toThrow('must be an object');
    expect(() => validateManifestMetadata('string')).toThrow('must be an object');
});

test('TC-MANIFEST-102 | unsupported lifecycle hooks are rejected', () => {
    for (const hook of ['onInit', 'onActivate', 'onDeactivate']) {
        expect(() => validateManifestMetadata({ ...base(), [hook]: () => {} })).toThrow(hook);
    }
});

test('TC-MANIFEST-103 | duplicate route paths are rejected', () => {
    expect(() => validateManifestMetadata({ ...base(), routes: [{ path: '/dup' }, { path: '/dup', component: () => null }] })).toThrow('duplicate');
});

test('TC-MANIFEST-104 | menu must be an array if present', () => {
    expect(() => validateManifestMetadata({ ...base(), menu: 'not-array' })).toThrow('menu must be an array');
});

test('TC-MANIFEST-105 | menu entries require id, labelKey and absolute route', () => {
    const badMenus = [
        [{ labelKey: 'k', route: '/r' }],                    // missing id
        [{ id: 'm', route: '/r' }],                           // missing labelKey
        [{ id: 'm', labelKey: 'k' }],                         // missing route
        [{ id: 'm', labelKey: 'k', route: 'relative' }],      // relative route
    ];
    for (const menu of badMenus) {
        expect(() => validateManifestMetadata({ ...base(), menu })).toThrow('menu entries require');
    }
});

test('TC-MANIFEST-106 | backend.gateway must be absolute URL or same-origin path', () => {
    expect(() => validateManifestMetadata({ ...base(), backend: { gateway: 'relative-path' } })).toThrow('backend.gateway');
    expect(() => validateManifestMetadata({ ...base(), backend: { gateway: 'ftp://bad' } })).toThrow('backend.gateway');
    // valid forms
    expect(validateManifestMetadata({ ...base(), backend: { gateway: '/api/x' } })).toBeTruthy();
    expect(validateManifestMetadata({ ...base(), backend: { gateway: 'https://example.com' } })).toBeTruthy();
});

test('TC-MANIFEST-107 | backend.authScope must be host or component', () => {
    expect(() => validateManifestMetadata({ ...base(), backend: { gateway: '/api/x', authScope: 'admin' } })).toThrow('authScope');
    expect(validateManifestMetadata({ ...base(), backend: { gateway: '/api/x', authScope: 'host' } })).toBeTruthy();
});

test('TC-MANIFEST-108 | entry and css filenames must be safe', () => {
    for (const file of ['entry', 'css']) {
        expect(() => validateManifestMetadata({ ...base(), [file]: '../escape' })).toThrow('unsafe artifact');
        expect(() => validateManifestMetadata({ ...base(), [file]: 'has space.js' })).toThrow('unsafe artifact');
        expect(validateManifestMetadata({ ...base(), [file]: 'index.js' })).toBeTruthy();
    }
});

test('TC-MANIFEST-109 | route.componentExport must be a valid export name', () => {
    expect(() => validateManifestMetadata({ ...base(), routes: [{ path: '/r', componentExport: '123bad' }] })).toThrow('componentExport must be an export name');
    expect(validateManifestMetadata({ ...base(), routes: [{ path: '/r', componentExport: 'myExport' }] })).toBeTruthy();
});

test('TC-MANIFEST-110 | route.keepMounted must be boolean', () => {
    expect(() => validateManifestMetadata({ ...base(), routes: [{ path: '/r', keepMounted: 'yes' }] })).toThrow('keepMounted must be boolean');
    expect(validateManifestMetadata({ ...base(), routes: [{ path: '/r', keepMounted: true }] })).toBeTruthy();
});

test('TC-MANIFEST-111 | i18n namespace is required when i18n is present', () => {
    expect(() => validateManifestMetadata({ ...base(), i18n: { resources: {} } })).toThrow('namespace is required');
    expect(() => validateManifestMetadata({ ...base(), i18n: { namespace: '', resources: {} } })).toThrow('namespace is required');
});

test('TC-MANIFEST-112 | i18n.resources must be an object of loader functions', () => {
    expect(() => validateManifestMetadata({ ...base(), i18n: { namespace: 'ns', resources: [] } })).toThrow('resources must be an object');
    expect(() => validateManifestMetadata({ ...base(), i18n: { namespace: 'ns', resources: { en: 'not-fn' } } })).toThrow('loader functions');
    expect(validateManifestMetadata({ ...base(), i18n: { namespace: 'ns', resources: { en: () => Promise.resolve({}) } } })).toBeTruthy();
});

test('TC-MANIFEST-113 | i18n.resources object (non-array) with valid loaders passes', () => {
    const m = validateManifestMetadata({ ...base(), i18n: { namespace: 'ns', resources: { en: () => ({}), zh: () => ({}) } } });
    expect(m.i18n.namespace).toBe('ns');
});

/* ── validateManifest (checks route.component is a function) ── */

test('TC-MANIFEST-114 | validateManifest rejects routes whose component is not a function', () => {
    // 输入: route.component = "not-a-fn"  预期: Error mentioning component must be lazy-import  断言: 防回归
    expect(() => validateManifest({ ...base(), routes: [{ path: '/r', component: 'string' }] })).toThrow('component must be a lazy-import function');
});

test('TC-MANIFEST-115 | validateManifest accepts valid manifest and returns same reference', () => {
    const m = { ...base(), routes: [{ path: '/r', component: () => Promise.resolve(() => null) }] };
    expect(validateManifest(m)).toBe(m);
});

test('TC-MANIFEST-116 | validateManifest propagates metadata validation errors', () => {
    expect(() => validateManifest({ ...base(), id: '' })).toThrow('manifest.id is required');
});

test('TC-MANIFEST-117 | multiple errors are joined with semicolons', () => {
    try {
        validateManifestMetadata({ id: '', name: '', version: '', routes: 'not-array' });
    } catch (e) {
        expect(e.message).toContain(';');
        expect(e.message).toContain('manifest.id is required');
        expect(e.message).toContain('manifest.name is required');
        expect(e.message).toContain('manifest.version is required');
        expect(e.message).toContain('manifest.routes must be an array');
    }
});

test('TC-MANIFEST-118 | route path must start with /', () => {
    expect(() => validateManifestMetadata({ ...base(), routes: [{ path: 'relative' }] })).toThrow('path must be absolute');
});

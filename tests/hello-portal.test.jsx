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

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';

vi.mock('@openan/portal-sdk', () => ({
    usePortalContext: () => ({
        auth: { user: 'alice', role: 'admin' },
        theme: { isDark: false, toggle: vi.fn() },
        i18n: { language: 'en' },
    }),
}));
import HelloPortal from '../plugins/hello-portal/src/index.jsx';

test('TC-HELLO-001 | HelloPortal renders user, role and language from portal context', async () => {
    // 输入: usePortalContext returns user=alice, role=admin, lang=en  预期: renders all three  断言: 防回归
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
        await act(async () => root.render(<HelloPortal />));
        expect(container.textContent).toContain('Hello Portal');
        expect(container.textContent).toContain('alice');
        expect(container.textContent).toContain('admin');
        expect(container.textContent).toContain('en');
    } finally {
        await act(async () => root.unmount());
        container.remove();
    }
});

test('TC-HELLO-002 | HelloPortal renders Guest fallback for missing user', async () => {
    vi.resetModules();
    vi.doMock('@openan/portal-sdk', () => ({
        usePortalContext: () => ({
            auth: {},
            theme: { isDark: true, toggle: vi.fn() },
            i18n: { language: 'zh' },
        }),
    }));
    const mod = await import('../plugins/hello-portal/src/index.jsx');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
        await act(async () => root.render(<mod.default />));
        expect(container.textContent).toContain('Guest');
        expect(container.textContent).toContain('none');
        expect(container.textContent).toContain('zh');
    } finally {
        await act(async () => root.unmount());
        container.remove();
    }
});

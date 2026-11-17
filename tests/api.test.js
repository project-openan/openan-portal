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
import axios from 'axios';
import api, { createApi, changePassword } from '../portal/src/service/api.js';

beforeEach(() => localStorage.clear());
afterEach(() => { api.defaults.adapter = undefined; });
test.each(['/rest/v1/registry-center/agent-cards', '/api/registry-center/rest/v1/registry-center/agent-cards'])('injected client handles %s exactly once', async url => {
    const client = createApi('/api/registry-center');
    client.defaults.adapter = async config => {
        expect(axios.getUri(config)).toBe('/api/registry-center/rest/v1/registry-center/agent-cards');
        return { data: { data: [] }, status: 200, headers: {}, config };
    };
    expect(client.getUri({ url })).toBe('/api/registry-center/rest/v1/registry-center/agent-cards');
    await client.get(url);
});
test('forbidden does not log out unless backend requests password change', async () => {
    const expired = vi.fn(), required = vi.fn();
    window.addEventListener('auth-expired', expired); window.addEventListener('auth-password-change-required', required);
    const client = createApi('/api/orchestrate', { authScope: 'host' });
    try {
        client.defaults.adapter = config => Promise.reject({ config, response: { status: 403, data: {} } });
        await expect(client.get('/resource')).rejects.toBeTruthy(); expect(expired).not.toHaveBeenCalled(); expect(required).not.toHaveBeenCalled();
        client.defaults.adapter = config => Promise.reject({ config, response: { status: 403, data: { data: { must_change_password: true } } } });
        await expect(client.get('/resource')).rejects.toBeTruthy(); expect(required).toHaveBeenCalledOnce(); expect(expired).not.toHaveBeenCalled();
    } finally { window.removeEventListener('auth-expired', expired); window.removeEventListener('auth-password-change-required', required); }
});
test.each([401, 403])('independent component HTTP %s never changes host authentication', async status => {
    const expired = vi.fn(), required = vi.fn();
    window.addEventListener('auth-expired', expired); window.addEventListener('auth-password-change-required', required);
    try {
        const client = createApi('/api/independent');
        client.defaults.adapter = config => Promise.reject({ config, response: { status, data: { data: { must_change_password: true } } } });
        await expect(client.get('/resource')).rejects.toBeTruthy();
        expect(expired).not.toHaveBeenCalled(); expect(required).not.toHaveBeenCalled();
    } finally { window.removeEventListener('auth-expired', expired); window.removeEventListener('auth-password-change-required', required); }
});
test('only an explicitly shared host session emits auth-expired on 401', async () => {
    const expired = vi.fn(); window.addEventListener('auth-expired', expired);
    try {
        const client = createApi('/any/gateway', { authScope: 'host' });
        client.defaults.adapter = config => Promise.reject({ config, response: { status: 401, data: {} } });
        await expect(client.get('/resource')).rejects.toBeTruthy(); expect(expired).toHaveBeenCalledOnce();
    } finally { window.removeEventListener('auth-expired', expired); }
});
test('change-password uses the real backend contract, wrong old password keeps the gate', async () => {
    const expired = vi.fn(); window.addEventListener('auth-expired', expired);
    try {
        api.defaults.adapter = config => {
            expect(config.url).toBe('/api/orchestrate/rest/v1/orchestrate/auth/change-password');
            expect(JSON.parse(config.data)).toEqual({ old_password: 'old-placeholder', new_password: 'new-placeholder' });
            return Promise.reject({ config, response: { status: 401, data: { message: 'Current password is incorrect' } } });
        };
        await expect(changePassword('old-placeholder', 'new-placeholder')).rejects.toBeTruthy();
        expect(expired).not.toHaveBeenCalled();
    } finally { window.removeEventListener('auth-expired', expired); }
});

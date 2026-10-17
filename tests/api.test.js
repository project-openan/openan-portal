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
    const client = createApi('/api/orchestrate');
    try {
        client.defaults.adapter = config => Promise.reject({ config, response: { status: 403, data: {} } });
        await expect(client.get('/resource')).rejects.toBeTruthy(); expect(expired).not.toHaveBeenCalled(); expect(required).not.toHaveBeenCalled();
        client.defaults.adapter = config => Promise.reject({ config, response: { status: 403, data: { data: { must_change_password: true } } } });
        await expect(client.get('/resource')).rejects.toBeTruthy(); expect(required).toHaveBeenCalledOnce(); expect(expired).not.toHaveBeenCalled();
    } finally { window.removeEventListener('auth-expired', expired); window.removeEventListener('auth-password-change-required', required); }
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

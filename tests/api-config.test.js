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

import axios from 'axios';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import api, {
    getBaseUrl,
    authCheck,
    login,
    logout,
    getDisabledPlugins,
    setDisabledPlugins,
    getAgentCards,
    getWorkflow,
    getWorkflowById,
    delWorkflowById,
    createWorkflow,
    getTemplates,
    importTemplate,
    parsePdf,
    handlePlan,
    generateWorkflowFromIntent,
    matchWorkflowsTopN,
    getStartProcessStreamUrl,
    getDispatchStreamUrl,
    getExecutionRecords,
    getExecutionRecord,
    deleteExecutionRecord,
} from '../portal/src/service/api.js';

const ORCHESTRATE = '/api/orchestrate/rest/v1/orchestrate';
let seen;
const envelope = (data) => ({ code: 200, status: 'success', data });
const okAdapter = (config) => {
    const body = config.data instanceof FormData ? null : (config.data ? JSON.parse(config.data) : null);
    seen.push({ url: axios.getUri(config), method: config.method, body, formData: config.data instanceof FormData });
    return Promise.resolve({ data: envelope({ ok: true }), status: 200, headers: {}, config });
};

beforeEach(() => { localStorage.clear(); seen = []; api.defaults.adapter = okAdapter; });
afterEach(() => { api.defaults.adapter = undefined; localStorage.clear(); });

/* ── getBaseUrl config resolution ── */

test('TC-API-101 | ip-mode config builds an ip:port base URL', () => {
    // 输入: localStorage {mode:'ip', ip, port}  预期: http://ip:port  断言: protocol/ip/port 拼接
    localStorage.setItem('server_config', JSON.stringify({ mode: 'ip', ip: '10.0.0.5', port: '8080' }));
    expect(getBaseUrl()).toBe(`${window.location.protocol === 'https:' ? 'https://' : 'http://'}10.0.0.5:8080`);
});

test('TC-API-102 | ip-mode falls back to defaults for missing ip/port', () => {
    localStorage.setItem('server_config', JSON.stringify({ mode: 'ip' }));
    const proto = window.location.protocol === 'https:' ? 'https://' : 'http://';
    expect(getBaseUrl()).toBe(`${proto}127.0.0.1:5001`);
});

test('TC-API-103 | gateway-mode trims trailing slash from nginxUrl', () => {
    localStorage.setItem('server_config', JSON.stringify({ mode: 'gateway', nginxUrl: '/api/my-gateway/' }));
    expect(getBaseUrl()).toBe('/api/my-gateway');
});

test('TC-API-104 | gateway-mode falls back to gatewayUrl when nginxUrl absent', () => {
    localStorage.setItem('server_config', JSON.stringify({ gatewayUrl: '/api/gw/' }));
    expect(getBaseUrl()).toBe('/api/gw');
});

test('TC-API-105 | default gateway when shouldDefaultToGateway is true', () => {
    expect(getBaseUrl()).toBe('/api/orchestrate');
});

test('TC-API-106 | corrupt localStorage JSON falls back to ip:port default', () => {
    localStorage.setItem('server_config', '{broken');
    const proto = window.location.protocol === 'https:' ? 'https://' : 'http://';
    expect(getBaseUrl()).toBe(`${proto}127.0.0.1:5001`);
});

/* ── auth endpoints ── */

test('TC-API-107 | authCheck GETs the auth check endpoint and unwraps data', async () => {
    const result = await authCheck();
    expect(seen[0].url).toBe(`${ORCHESTRATE}/auth/check`);
    expect(seen[0].method).toBe('get');
    expect(result).toEqual({ ok: true });
});

test('TC-API-108 | login POSTs username and password', async () => {
    await login('alice', 'secret');
    expect(seen[0].url).toBe(`${ORCHESTRATE}/auth/login`);
    expect(seen[0].body).toEqual({ username: 'alice', password: 'secret' });
});

test('TC-API-109 | logout POSTs the logout endpoint', async () => {
    await logout();
    expect(seen[0].url).toBe(`${ORCHESTRATE}/auth/logout`);
    expect(seen[0].method).toBe('post');
});

/* ── plugin preferences ── */

test('TC-API-110 | getDisabledPlugins GETs the plugins endpoint', async () => {
    await getDisabledPlugins();
    expect(seen[0].url).toBe(`${ORCHESTRATE}/auth/plugins`);
    expect(seen[0].method).toBe('get');
});

test('TC-API-111 | setDisabledPlugins PUTs the plugin id list', async () => {
    await setDisabledPlugins(['a', 'b']);
    expect(seen[0].url).toBe(`${ORCHESTRATE}/auth/plugins`);
    expect(seen[0].method).toBe('put');
    expect(seen[0].body).toEqual({ disabled_plugins: ['a', 'b'] });
});

/* ── business API ── */

test('TC-API-112 | getAgentCards hits the agent-cards endpoint', async () => {
    await getAgentCards();
    expect(seen[0].url).toBe(`${ORCHESTRATE}/agent-cards`);
});

test('TC-API-113 | getWorkflow / getWorkflowById / delWorkflowById target the right URLs', async () => {
    await getWorkflow();
    await getWorkflowById('wf-1');
    await delWorkflowById('wf-2');
    expect(seen[0].url).toBe(`${ORCHESTRATE}/workflows`);
    expect(seen[1].url).toBe(`${ORCHESTRATE}/workflows/wf-1`);
    expect(seen[2].url).toBe(`${ORCHESTRATE}/workflows/wf-2`);
    expect(seen[2].method).toBe('delete');
});

test('TC-API-114 | createWorkflow POSTs the PSOP payload', async () => {
    await createWorkflow({ steps: [] });
    expect(seen[0].url).toBe(`${ORCHESTRATE}/workflows`);
    expect(seen[0].method).toBe('post');
    expect(seen[0].body).toEqual({ psop: { steps: [] } });
});

test('TC-API-115 | getTemplates and importTemplate hit the right endpoints', async () => {
    await getTemplates();
    await importTemplate('tpl-9');
    expect(seen[0].url).toBe(`${ORCHESTRATE}/templates`);
    expect(seen[1].url).toBe(`${ORCHESTRATE}/templates/tpl-9/import`);
    expect(seen[1].method).toBe('post');
});

test('TC-API-116 | parsePdf sends FormData with the file', async () => {
    const file = new File(['pdf bytes'], 'doc.pdf', { type: 'application/pdf' });
    const result = await parsePdf(file);
    expect(seen[0].url).toBe(`${ORCHESTRATE}/parse-pdf`);
    expect(seen[0].formData).toBe(true);
    expect(result).toEqual({ ok: true });
});

test('TC-API-117 | parsePdf throws when backend reports status error', async () => {
    api.defaults.adapter = (config) => Promise.resolve({ data: { status: 'error', message: 'bad pdf', data: null }, status: 200, headers: {}, config });
    await expect(parsePdf(new File(['x'], 'f.pdf'))).rejects.toThrow('bad pdf');
});

test('TC-API-118 | handlePlan POSTs preflow and agentCards', async () => {
    await handlePlan({ a: 1 }, [{ name: 'bot' }]);
    expect(seen[0].url).toBe(`${ORCHESTRATE}/generate-from-preflow`);
    expect(seen[0].body).toEqual({ preflow: { a: 1 }, agent_cards: [{ name: 'bot' }] });
});

test('TC-API-119 | generateWorkflowFromIntent returns unwrapped data when present', async () => {
    api.defaults.adapter = (config) => Promise.resolve({ data: { status: 'success', data: { psop: 'wf' } }, status: 200, headers: {}, config });
    const result = await generateWorkflowFromIntent('do something');
    expect(result).toEqual({ psop: 'wf' });
});

test('TC-API-120 | generateWorkflowFromIntent falls back to full body when data is falsy', async () => {
    api.defaults.adapter = (config) => Promise.resolve({ data: { status: 'success', data: null, extra: 1 }, status: 200, headers: {}, config });
    const result = await generateWorkflowFromIntent('do something');
    expect(result.extra).toBe(1);
});

test('TC-API-121 | matchWorkflowsTopN returns mapped array from array data', async () => {
    api.defaults.adapter = (config) => Promise.resolve({ data: { status: 'success', data: [{ workflow_id: 'w1', name: 'n1', description: 'd1', tags: ['t'], score: 0.9 }] }, status: 200, headers: {}, config });
    const result = await matchWorkflowsTopN('intent');
    expect(result).toEqual([{ workflow_id: 'w1', name: 'n1', description: 'd1', tags: ['t'], score: 0.9 }]);
});

test('TC-API-122 | matchWorkflowsTopN wraps single-object data into an array', async () => {
    api.defaults.adapter = (config) => Promise.resolve({ data: { status: 'success', data: { workflow_id: 'only', name: 'n', description: 'd', tags: [], score: 1 } }, status: 200, headers: {}, config });
    const result = await matchWorkflowsTopN('intent');
    expect(result).toHaveLength(1);
    expect(result[0].workflow_id).toBe('only');
});

test('TC-API-123 | matchWorkflowsTopN returns [] when data is falsy', async () => {
    api.defaults.adapter = (config) => Promise.resolve({ data: { status: 'success', data: null }, status: 200, headers: {}, config });
    const result = await matchWorkflowsTopN('intent');
    expect(result).toEqual([]);
});

/* ── URL builders ── */

test('TC-API-124 | getStartProcessStreamUrl builds base URL with no optional params', () => {
    const url = getStartProcessStreamUrl('psop-1');
    expect(url).toBe(`${ORCHESTRATE}/execute?psop_id=psop-1`);
});

test('TC-API-125 | getStartProcessStreamUrl encodes all optional params', () => {
    const url = getStartProcessStreamUrl('psop-1', 'my intent', 'zh', 'agent x');
    expect(url).toContain('psop_id=psop-1');
    expect(url).toContain('user_intent=my%20intent');
    expect(url).toContain('lang=zh');
    expect(url).toContain('target_agent=agent%20x');
});

test('TC-API-126 | getDispatchStreamUrl encodes intent and agentName, optional lang', () => {
    const url = getDispatchStreamUrl('hello world', 'bot one', 'en');
    expect(url).toContain('intent=hello%20world');
    expect(url).toContain('agent_name=bot%20one');
    expect(url).toContain('lang=en');
});

test('TC-API-127 | getDispatchStreamUrl omits lang when empty', () => {
    const url = getDispatchStreamUrl('intent', 'agent');
    expect(url).not.toContain('lang=');
});

/* ── execution records ── */

test('TC-API-128 | getExecutionRecords / getExecutionRecord / deleteExecutionRecord hit correct URLs', async () => {
    await getExecutionRecords();
    await getExecutionRecord('exec-1');
    await deleteExecutionRecord('exec-2');
    expect(seen[0].url).toBe(`${ORCHESTRATE}/execution-records`);
    expect(seen[1].url).toBe(`${ORCHESTRATE}/execution-records/exec-1`);
    expect(seen[2].url).toBe(`${ORCHESTRATE}/execution-records/exec-2`);
    expect(seen[2].method).toBe('delete');
});

test('TC-API-129 | handleApiError dispatches auth-expired for 401 on host scope', async () => {
    const expired = vi.fn();
    window.addEventListener('auth-expired', expired);
    try {
        api.defaults.adapter = (config) => Promise.reject({ config, response: { status: 401, data: {} } });
        await expect(api.get('/resource')).rejects.toBeTruthy();
        expect(expired).toHaveBeenCalledOnce();
    } finally { window.removeEventListener('auth-expired', expired); }
});

test('TC-API-130 | handleApiError does NOT dispatch for component scope', async () => {
    const { createApi } = await import('../portal/src/service/api.js');
    const client = createApi('/api/independent');
    const expired = vi.fn();
    window.addEventListener('auth-expired', expired);
    try {
        client.defaults.adapter = (config) => Promise.reject({ config, response: { status: 401, data: {} } });
        await expect(client.get('/resource')).rejects.toBeTruthy();
        expect(expired).not.toHaveBeenCalled();
    } finally { window.removeEventListener('auth-expired', expired); }
});

// SPDX-License-Identifier: Apache-2.0
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import { PortalProvider } from '@openan/portal-sdk';
import i18n from '../portal/src/i18n/index.js';
import ObservationCenter from '../integrations/observation-center/index.jsx';
import OntologyCenter from '../integrations/an-ontology/index.jsx';
import { resolveEditorUrl } from '../integrations/an-ontology/config.js';
import { readTraceList, readTraceDetail } from '../integrations/observation-center/api.js';

let node, root, api;
const flush = async () => { await act(async () => { await Promise.resolve(); }); };
const detail = { graph: { nodes: [{ id: 'real-agent', label: 'Actual worker', status: 'completed' }], edges: [] }, summary: { session_done: false }, metrics: { latency_ms: 3 }, interactions: [{ sender: 'Caller', receiver: 'Worker', a2at_type: 'Notification-T', message: 'actual result' }] };
const envelope = data => ({ code: 200, status: 'success', data });
beforeEach(async () => {
    vi.useFakeTimers();
    await i18n.changeLanguage('en');
    delete window.__OPENAN_ONTOLOGY_APP_URL__;
    node = document.createElement('div'); document.body.appendChild(node); root = createRoot(node);
    api = { get: vi.fn(async url => envelope(url.endsWith('/traces')
        ? [{ session_id: 'session A', psop_name: 'Actual workflow', status: 'running' }, { session_id: 'session B', status: 'completed' }]
        : detail)) };
});
afterEach(async () => { await act(async () => root.unmount()); node.remove(); delete window.__OPENAN_ONTOLOGY_APP_URL__; vi.useRealTimers(); });
const render = async Component => { await act(async () => root.render(<PortalProvider value={{ api, theme: { isDark: true } }}><Component /></PortalProvider>)); await flush(); };
const click = async name => { const button = [...node.querySelectorAll('button')].find(item => item.textContent === name); expect(button).toBeTruthy(); await act(async () => Simulate.click(button)); await flush(); };

test('observation displays real list/detail and treats completed notification results as data, not stream termination', async () => {
    await render(ObservationCenter); await click('Actual workflow');
    expect(api.get).toHaveBeenCalledWith('/rest/v1/observe/traces/session%20A', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(node.textContent).toContain('Actual worker'); expect(node.textContent).toContain('actual result');
    expect(node.querySelector('section').dataset.dark).toBe('true');
    const before = api.get.mock.calls.length;
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(api.get.mock.calls.length).toBeGreaterThan(before);
    await act(async () => i18n.changeLanguage('zh')); expect(node.textContent).toContain('可观测中心');
});

test('switching session aborts old requests and never shows stale detail under the new session', async () => {
    await render(ObservationCenter); await click('Actual workflow');
    const signal = api.get.mock.calls.at(-1)[1].signal;
    let resolve;
    api.get.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    await click('session B'); expect(signal.aborted).toBe(true); expect(node.textContent).not.toContain('Actual worker');
    await act(async () => resolve(envelope(detail))); expect(node.textContent).toContain('Actual worker');
    const current = api.get.mock.calls.at(-1)[1].signal;
    await act(async () => root.unmount()); expect(current.aborted).toBe(true);
});

test('slow requests never overlap; unmount cancels requests and timers', async () => {
    let finish;
    api.get.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await render(ObservationCenter); await act(async () => vi.advanceTimersByTimeAsync(20000));
    expect(api.get).toHaveBeenCalledTimes(1);
    await act(async () => finish(envelope([])));
    await act(async () => root.unmount());
    await act(async () => vi.advanceTimersByTimeAsync(20000)); expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get.mock.calls[0][1].signal.aborted).toBe(true);
});

test('API failure is visible and does not pretend that no sessions exist', async () => {
    api.get.mockRejectedValue(new Error('HTTP 502'));
    await render(ObservationCenter);
    expect(node.querySelector('[role=alert]').textContent).toContain('HTTP 502');
    expect(node.textContent).not.toContain('No sessions reported');
});

test('manual refresh works when automatic polling is disabled', async () => {
    await render(ObservationCenter);
    await act(async () => Simulate.change(node.querySelector('input'), { target: { checked: false } }));
    const before = api.get.mock.calls.length;
    await act(async () => vi.advanceTimersByTimeAsync(15000)); expect(api.get).toHaveBeenCalledTimes(before);
    await click('Refresh'); expect(api.get).toHaveBeenCalledTimes(before + 1);
});

test('invalid JSON/API envelopes and HTML fallbacks are rejected, not shown as empty success', async () => {
    for (const body of ['<html>shell</html>', {}, envelope({}), envelope([{}])]) {
        await expect(readTraceList({ get: async () => body })).rejects.toThrow('Invalid observation');
    }
    await expect(readTraceDetail({ get: async () => envelope({}) }, 'id')).rejects.toThrow('Invalid observation trace');
});

test.each(['javascript:alert(1)', 'data:text/html,test', 'https://user:password@example.org/', 'http://editor.example.org/', 'https://portal.example.org/ontology'])('rejects unsafe editor URL %s', value => {
    expect(() => resolveEditorUrl(value, 'https://portal.example.org/ontology')).toThrow();
});

test('editor permits dedicated origins, including a local service on another port', () => {
    expect(resolveEditorUrl('http://localhost:8000/', 'http://localhost:3003/')).toBe('http://localhost:8000/');
    expect(resolveEditorUrl('https://editor.example.org/')).toBe('https://editor.example.org/');
});

test('native editor is embedded with download support and no host auth in the URL', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ appUrl: 'https://editor.example.org/' }) })));
    await render(OntologyCenter);
    const frame = node.querySelector('iframe'); expect(frame.src).toBe('https://editor.example.org/');
    expect(frame.getAttribute('sandbox')).toContain('allow-downloads'); expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(frame.getAttribute('sandbox')).toContain('allow-modals');
    expect(node.textContent).toContain('download your work first');
    expect(fetch.mock.calls[0][0]).toContain('/plugins/an-ontology/config.json');
    await act(async () => root.unmount()); expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
});

test.each([{}, { appUrl: 'javascript:alert(1)' }])('unconfigured or unsafe editor shows an error instead of a placeholder iframe', async config => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => config })));
    await render(OntologyCenter); expect(node.querySelector('iframe')).toBeNull(); expect(node.querySelector('[role=alert]')).toBeTruthy();
});

test('existing deployment URL injection remains compatible', async () => {
    window.__OPENAN_ONTOLOGY_APP_URL__ = 'https://editor.example.org/';
    vi.stubGlobal('fetch', vi.fn()); await render(OntologyCenter);
    expect(fetch).not.toHaveBeenCalled(); expect(node.querySelector('iframe').src).toBe(window.__OPENAN_ONTOLOGY_APP_URL__);
});
test.each(['https://editor.example.org/subpath/', 'https://editor.example.org/?token=example', 'https://editor.example.org/#view'])('rejects editor paths that break the native origin-root contract: %s', value => {
    expect(() => resolveEditorUrl(value)).toThrow('dedicated origin root');
});
test('an unavailable editor configuration is visible as an HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })));
    await render(OntologyCenter); expect(node.querySelector('[role=alert]').textContent).toContain('HTTP 404'); expect(node.querySelector('iframe')).toBeNull();
});
test('a late response for an aborted session never replaces the current session', async () => {
    await render(ObservationCenter);
    let oldResponse;
    api.get.mockImplementationOnce(() => new Promise(resolve => { oldResponse = resolve; }));
    await click('Actual workflow');
    const oldSignal = api.get.mock.calls.at(-1)[1].signal;
    await click('session B'); expect(oldSignal.aborted).toBe(true);
    expect(node.textContent).toContain('Actual worker');
    await act(async () => oldResponse(envelope({ ...detail, graph: { nodes: [{ id: 'stale', label: 'Stale worker' }], edges: [] } })));
    expect(node.textContent).not.toContain('Stale worker'); expect(node.textContent).toContain('Actual worker');
});
test.each([
    { ...detail, graph: { nodes: [null], edges: [] } },
    { ...detail, graph: { nodes: [{ label: { invalid: true } }], edges: [] } },
    { ...detail, interactions: [null] },
])('malformed nested observation data becomes a request error, not a React crash', async value => {
    await expect(readTraceDetail({ get: async () => envelope(value) }, 'id')).rejects.toThrow('Invalid observation trace detail');
});

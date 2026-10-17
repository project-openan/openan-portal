import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { beforeEach, afterEach, expect, test, vi } from 'vitest';
vi.mock('@openan/shared-workflow', () => ({ UnifiedWorkflow: () => null, transformWorkflowToReactFlow: () => ({ nodes: [], edges: [] }) }));
vi.mock('../plugins/execution-center/src/execution_statistics/index.jsx', () => ({ default: () => null }));
import ExecutionCenter from '../plugins/execution-center/src/index.jsx';
import { PortalProvider } from '@openan/portal-sdk';
import { createApi } from '../portal/src/service/api.js';
import i18n, { registerPluginI18n } from '../portal/src/i18n/index.js';
import executionEn from '../plugins/execution-center/src/locales/en.json';

let node, root, streams;
const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
const click = async button => { expect(button).toBeTruthy(); await act(async () => Simulate.click(button)); await flush(); };
beforeEach(async () => {
    localStorage.clear(); streams = []; HTMLElement.prototype.scrollTo = vi.fn();
    vi.stubGlobal('EventSource', class {
        constructor(url) { this.url = url; this.close = vi.fn(); streams.push(this); }
    });
    const api = createApi('/api/orchestrate');
    api.get = vi.fn(async url => ({ status: 'success', data: url.endsWith('/agent-cards') ? [{ name: 'workbench' }] : [] }));
    api.post = vi.fn(async () => ({ status: 'success', data: [{ workflow_id: 'workflow/with space', name: 'Synthetic Workflow', tags: [] }] }));
    registerPluginI18n('execution-center', { en: executionEn }); await i18n.changeLanguage('en');
    node = document.createElement('div'); document.body.appendChild(node); root = createRoot(node);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await act(async () => root.render(<PortalProvider value={{ theme: { isDark: false }, api }}><ExecutionCenter /></PortalProvider>)); await flush();
    await act(async () => Simulate.change(node.querySelector('input'), { target: { value: 'synthetic intent' } }));
});
afterEach(async () => { await act(async () => root.unmount()); node.remove(); });
const start = async mode => {
    if (mode === 'dispatch') await click([...node.querySelectorAll('button')].find(button => button.textContent === 'Dispatch'));
    else {
        await click([...node.querySelectorAll('button')].find(button => button.textContent === 'Match' && !button.disabled));
        const name = [...node.querySelectorAll('span')].find(span => span.textContent === 'Synthetic Workflow');
        await click(name.closest('.group').querySelector('button'));
    }
    expect(streams).toHaveLength(1);
    expect(streams[0].url).toMatch(/^\/api\/orchestrate\/rest\/v1\/orchestrate\//);
    if (mode === 'execute') expect(streams[0].url).toContain('psop_id=workflow%2Fwith%20space');
};
test.each(['dispatch', 'execute'])('%s: cancel stops the stream and shows a cancelled result, not completed', async mode => {
    await start(mode);
    await act(async () => streams[0].onmessage({ data: '{"type":"cancelled","data":{},"timestamp":1}' })); await flush();
    expect(streams[0].close).toHaveBeenCalledOnce();
    expect(node.textContent).toContain('Execution cancelled'); expect(node.textContent).not.toContain('Dispatching...');
});
test.each(['dispatch', 'execute'])('%s: top-level error is visible and ends the stream', async mode => {
    await start(mode);
    await act(async () => streams[0].onmessage({ data: '{"type":"error","message":"No agent cards available"}' })); await flush();
    expect(streams[0].close).toHaveBeenCalledOnce(); expect(node.textContent).toContain('No agent cards available');
});
test('disconnect closes once, preserves failure in the timeline and never creates another EventSource', async () => {
    await start('dispatch'); await act(async () => streams[0].onerror()); await flush();
    expect(streams[0].close).toHaveBeenCalledOnce(); expect(streams).toHaveLength(1);
    expect(node.textContent).toContain('automatic retry is disabled');
});

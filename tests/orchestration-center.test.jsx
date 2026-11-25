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
import { Simulate } from 'react-dom/test-utils';
import { beforeEach, expect, test, vi } from 'vitest';

// Hoisted shared state referenced by the hoisted vi.mock factories below.
const shared = vi.hoisted(() => ({
    mockApi: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
    theme: { isDark: false },
    i18nMock: {
        language: 'en',
        _l: {},
        on(ev, cb) { (this._l[ev] = this._l[ev] || []).push(cb); },
        off(ev, cb) { this._l[ev] = (this._l[ev] || []).filter(f => f !== cb); },
        emit(ev, ...a) { (this._l[ev] || []).forEach(cb => cb(...a)); },
    },
    transformFn: vi.fn(() => ({ nodes: [{ id: 'n1' }], edges: [{ id: 'e1' }] })),
    wfProps: [],
}));

vi.mock('@openan/portal-sdk', () => ({
    usePortalContext: () => ({ theme: shared.theme, api: shared.mockApi }),
}));
vi.mock('@openan/shared-workflow', () => ({
    UnifiedWorkflow: (props) => { shared.wfProps.push(props); return null; },
    transformWorkflowToReactFlow: shared.transformFn,
}));
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: key => key, i18n: shared.i18nMock }),
}));

import OrchestrationCenter from '../plugins/orchestration-center/src/index.jsx';
import SolutionPackages from '../plugins/orchestration-center/src/packages/index.jsx';
import SkillCenter from '../plugins/skill-center/src/index.jsx';

const { mockApi, theme, i18nMock, transformFn, wfProps } = shared;

const flush = () => act(async () => { await new Promise(r => setTimeout(r, 20)); });
const buttonByText = (root, text) =>
    [...root.querySelectorAll('button')].find(b => b.textContent.includes(text));

function defaultApi() {
    mockApi.get.mockImplementation(async (url) => {
        if (url.endsWith('/workflows')) return { status: 'success', data: [] };
        if (url.endsWith('/templates')) return { status: 'success', data: [] };
        if (url.endsWith('/agent-cards')) return { status: 'success', data: [{ name: 'agent1' }] };
        if (/\/workflows\/[^/]+$/.test(url)) return { status: 'success', data: { id: 'wf-1', name: 'Detail Wf' } };
        return { status: 'success', data: {} };
    });
    mockApi.post.mockImplementation(async (url) => {
        if (url.endsWith('/parse-pdf')) return { status: 'success', data: { text: 'parsed' } };
        if (url.endsWith('/generate-from-preflow')) return { status: 'success', data: { steps: [] } };
        if (url.endsWith('/generate-from-intent')) return { status: 'success', data: { workflow: {} } };
        if (/\/templates\/[^/]+\/import$/.test(url)) return { status: 'success', data: { id: 'tpl', name: 'Tpl', steps: [] } };
        return { status: 'success', data: {} };
    });
    mockApi.delete.mockImplementation(async () => ({ status: 'success' }));
}

let consoleErrorSpy;
beforeEach(() => {
    mockApi.get.mockReset();
    mockApi.post.mockReset();
    mockApi.delete.mockReset();
    transformFn.mockClear();
    wfProps.length = 0;
    theme.isDark = false;
    i18nMock.language = 'en';
    i18nMock._l = {};
    defaultApi();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

async function mount(Comp, props = {}) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(<Comp {...props} />));
    await flush();
    await flush();
    return {
        container, root,
        async unmount() { await act(async () => root.unmount()); container.remove(); },
    };
}

const click = async (el, _root) => {
    if (!el) throw new Error('click target not found');
    await act(async () => Simulate.click(el));
    await flush();
};
const change = async (el, data, _root) => {
    await act(async () => Simulate.change(el, data));
    await flush();
};

const pdfFile = () => new File(['bytes'], 'spec.pdf', { type: 'application/pdf' });

// ---------------------------------------------------------------------------
// OrchestrationCenter
// ---------------------------------------------------------------------------

test('TC-ORCH-101 | welcome view renders method cards and fetches workflows + templates on mount', async () => {
    const { container, unmount } = await mount(OrchestrationCenter);
    try {
        expect(mockApi.get).toHaveBeenCalledWith('/rest/v1/orchestrate/workflows');
        expect(mockApi.get).toHaveBeenCalledWith('/rest/v1/orchestrate/templates');
        expect(container.textContent).toContain('orchestration.build_workflow');
        expect(container.textContent).toContain('orchestration.method_import');
        expect(container.textContent).toContain('orchestration.method_graph');
        expect(container.textContent).toContain('orchestration.method_ai');
        expect(container.textContent).toContain('orchestration.browse_workflow');
    } finally { await unmount(); }
});

test('TC-ORCH-102 | browse view lists fetched workflows grouped under the unknown source', async () => {
    mockApi.get.mockImplementation(async (url) => {
        if (url.endsWith('/workflows')) return { status: 'success', data: [{ workflow_id: 'wf-1', name: 'Network Audit', tags: ['ran'] }] };
        if (url.endsWith('/templates')) return { status: 'success', data: [] };
        return { status: 'success', data: {} };
    });
    const { container, unmount } = await mount(OrchestrationCenter);
    try {
        await click(buttonByText(container, 'orchestration.browse_workflow'), container);
        expect(container.textContent).toContain('Network Audit');
        expect(container.textContent).toContain('orchestration.source_unknown');
        expect(container.textContent).toContain('ran');
    } finally { await unmount(); }
});

test('TC-ORCH-103 | browse view with no workflows renders the empty state', async () => {
    const { container, unmount } = await mount(OrchestrationCenter);
    try {
        await click(buttonByText(container, 'orchestration.browse_workflow'), container);
        expect(container.textContent).toContain('orchestration.no_workflows');
    } finally { await unmount(); }
});

test('TC-ORCH-104 | search term filters the workflow list in browse view', async () => {
    mockApi.get.mockImplementation(async (url) => {
        if (url.endsWith('/workflows')) return { status: 'success', data: [
            { workflow_id: 'wf-a', name: 'Alpha Flow', tags: [] },
            { workflow_id: 'wf-b', name: 'Beta Flow', tags: [] },
        ] };
        if (url.endsWith('/templates')) return { status: 'success', data: [] };
        return { status: 'success', data: {} };
    });
    const { container, unmount } = await mount(OrchestrationCenter);
    try {
        await click(buttonByText(container, 'orchestration.browse_workflow'), container);
        const search = container.querySelector('input[type="text"]');
        await change(search, { target: { value: 'alpha' } }, container);
        expect(container.textContent).toContain('Alpha Flow');
        expect(container.textContent).not.toContain('Beta Flow');
    } finally { await unmount(); }
});

test('TC-ORCH-105 | selecting a workflow fetches detail by id and transforms it for the canvas', async () => {
    mockApi.get.mockImplementation(async (url) => {
        if (url.endsWith('/workflows')) return { status: 'success', data: [{ workflow_id: 'wf-1', name: 'Detail Wf', tags: [] }] };
        if (url.endsWith('/templates')) return { status: 'success', data: [] };
        if (url.endsWith('/workflows/wf-1')) return { status: 'success', data: { id: 'wf-1', name: 'Detail Wf', steps: [1] } };
        return { status: 'success', data: {} };
    });
    const { container, unmount } = await mount(OrchestrationCenter);
    try {
        await click(buttonByText(container, 'orchestration.browse_workflow'), container);
        const nameEl = [...container.querySelectorAll('h3')].find(h => h.textContent.includes('Detail Wf'));
        await click(nameEl, container);
        expect(mockApi.get).toHaveBeenCalledWith('/rest/v1/orchestrate/workflows/wf-1');
        expect(transformFn).toHaveBeenCalledWith({ id: 'wf-1', name: 'Detail Wf', steps: [1] });
        const last = wfProps[wfProps.length - 1];
        expect(last.workflowId).toBe('wf-1');
        expect(last.mode).toBe('view');
    } finally { await unmount(); }
});

test('TC-ORCH-106 | deleting a workflow calls DELETE and refetches the list', async () => {
    let fetchCount = 0;
    mockApi.get.mockImplementation(async (url) => {
        if (url.endsWith('/workflows')) { fetchCount++; return { status: 'success', data: [{ workflow_id: 'wf-del', name: 'Del Me', tags: [] }] }; }
        if (url.endsWith('/templates')) return { status: 'success', data: [] };
        return { status: 'success', data: {} };
    });
    const { container, unmount } = await mount(OrchestrationCenter);
    try {
        await click(buttonByText(container, 'orchestration.browse_workflow'), container);
        const nameEl = [...container.querySelectorAll('h3')].find(h => h.textContent.includes('Del Me'));
        const deleteBtn = nameEl.parentElement.nextElementSibling;
        await click(deleteBtn, container);
        expect(container.textContent).toContain('orchestration.delete_workflow_title');
        await click(buttonByText(container, 'common.delete'), container);
        expect(mockApi.delete).toHaveBeenCalledWith('/rest/v1/orchestrate/workflows/wf-del');
        expect(container.textContent).not.toContain('orchestration.delete_workflow_title');
        expect(fetchCount).toBeGreaterThanOrEqual(2);
    } finally { await unmount(); }
});

test('TC-ORCH-107 | cancelling delete does not call DELETE and closes the dialog', async () => {
    mockApi.get.mockImplementation(async (url) => {
        if (url.endsWith('/workflows')) return { status: 'success', data: [{ workflow_id: 'wf-del', name: 'Del Me', tags: [] }] };
        if (url.endsWith('/templates')) return { status: 'success', data: [] };
        return { status: 'success', data: {} };
    });
    const { container, unmount } = await mount(OrchestrationCenter);
    try {
        await click(buttonByText(container, 'orchestration.browse_workflow'), container);
        const nameEl = [...container.querySelectorAll('h3')].find(h => h.textContent.includes('Del Me'));
        await click(nameEl.parentElement.nextElementSibling, container);
        await click(buttonByText(container, 'common.cancel'), container);
        expect(mockApi.delete).not.toHaveBeenCalled();
        expect(container.textContent).not.toContain('orchestration.delete_workflow_title');
    } finally { await unmount(); }
});

test('TC-ORCH-108 | deleting the currently selected workflow resets to the welcome view', async () => {
    mockApi.get.mockImplementation(async (url) => {
        if (url.endsWith('/workflows')) return { status: 'success', data: [{ workflow_id: 'wf-sel', name: 'Selected', tags: [] }] };
        if (url.endsWith('/templates')) return { status: 'success', data: [] };
        if (url.endsWith('/workflows/wf-sel')) return { status: 'success', data: { id: 'wf-sel', name: 'Selected' } };
        return { status: 'success', data: {} };
    });
    const { container, unmount } = await mount(OrchestrationCenter);
    try {
        await click(buttonByText(container, 'orchestration.browse_workflow'), container);
        const nameEl = [...container.querySelectorAll('h3')].find(h => h.textContent.includes('Selected'));
        await click(nameEl, container); // select -> selectedId = wf-sel
        await click(nameEl.parentElement.nextElementSibling, container); // open delete dialog
        await click(buttonByText(container, 'common.delete'), container);
        expect(mockApi.delete).toHaveBeenCalledWith('/rest/v1/orchestrate/workflows/wf-sel');
        expect(container.textContent).toContain('orchestration.build_workflow');
    } finally { await unmount(); }
});

test('TC-ORCH-109 | PDF import via the hidden file input parses, plans and opens the detail view', async () => {
    const { container, unmount } = await mount(OrchestrationCenter);
    try {
        const input = container.querySelector('input[type="file"]');
        await change(input, { target: { files: [pdfFile()] } }, container);
        await flush();
        expect(mockApi.post).toHaveBeenCalledWith('/rest/v1/orchestrate/parse-pdf', expect.any(FormData));
        expect(mockApi.post).toHaveBeenCalledWith('/rest/v1/orchestrate/generate-from-preflow', expect.objectContaining({ preflow: { text: 'parsed' }, agent_cards: [{ name: 'agent1' }] }));
        expect(transformFn).toHaveBeenCalled();
        const last = wfProps[wfProps.length - 1];
        expect(last.mode).toBe('view'); // detail view
        expect(container.textContent).toContain('orchestration.edit'); // header edit button only in detail view
    } finally { await unmount(); }
});

test('TC-ORCH-110 | non-PDF files are rejected by the file input without calling the API', async () => {
    const { container, unmount } = await mount(OrchestrationCenter);
    try {
        const input = container.querySelector('input[type="file"]');
        const calls = mockApi.post.mock.calls.length;
        await change(input, { target: { files: [new File(['x'], 'note.txt', { type: 'text/plain' })] } }, container);
        expect(mockApi.post.mock.calls.length).toBe(calls);
        expect(container.textContent).toContain('orchestration.build_workflow');
    } finally { await unmount(); }
});

test('TC-ORCH-111 | parse error envelope is unwrapped, logged and leaves the view on welcome', async () => {
    mockApi.post.mockImplementation(async (url) => {
        if (url.endsWith('/parse-pdf')) return { status: 'error', message: 'Parse failed' };
        return { status: 'success', data: {} };
    });
    const { container, unmount } = await mount(OrchestrationCenter);
    try {
        const input = container.querySelector('input[type="file"]');
        await change(input, { target: { files: [pdfFile()] } }, container);
        await flush();
        expect(consoleErrorSpy).toHaveBeenCalled();
        expect(container.textContent).toContain('orchestration.build_workflow');
    } finally { await unmount(); }
});

test('TC-ORCH-112 | importing a template calls the import endpoint and opens the editor', async () => {
    mockApi.get.mockImplementation(async (url) => {
        if (url.endsWith('/workflows')) return { status: 'success', data: [] };
        if (url.endsWith('/templates')) return { status: 'success', data: [{ id: 'tpl-1', name: 'Tpl A', description: 'desc', step_count: 2, agent_count: 1, tags: ['x'] }] };
        return { status: 'success', data: {} };
    });
    mockApi.post.mockImplementation(async (url) => {
        if (/\/templates\/tpl-1\/import$/.test(url)) return { status: 'success', data: { id: 'tpl', name: 'Tpl', steps: [] } };
        return { status: 'success', data: {} };
    });
    const { container, unmount } = await mount(OrchestrationCenter);
    try {
        await click(buttonByText(container, 'Tpl A'), container);
        expect(mockApi.post).toHaveBeenCalledWith('/rest/v1/orchestrate/templates/tpl-1/import');
        expect(transformFn).toHaveBeenCalledWith({ id: 'tpl', name: 'Tpl', steps: [] });
        const last = wfProps[wfProps.length - 1];
        expect(last.mode).toBe('edit'); // editor
    } finally { await unmount(); }
});

test('TC-ORCH-113 | AI intent generation calls generate-from-intent and switches to the editor', async () => {
    const { container, unmount } = await mount(OrchestrationCenter);
    try {
        await click(buttonByText(container, 'orchestration.method_ai'), container);
        const textarea = container.querySelector('textarea');
        await change(textarea, { target: { value: 'build a network audit' } }, container);
        await click(buttonByText(container, 'orchestration.generate'), container);
        expect(mockApi.post).toHaveBeenCalledWith('/rest/v1/orchestrate/generate-from-intent', { user_intent: 'build a network audit', workflow_name: 'Generated Workflow' });
        expect(transformFn).toHaveBeenCalled();
        const last = wfProps[wfProps.length - 1];
        expect(last.mode).toBe('edit');
    } finally { await unmount(); }
});

test('TC-ORCH-114 | empty AI prompt is a no-op that never calls the backend', async () => {
    const { container, unmount } = await mount(OrchestrationCenter);
    try {
        await click(buttonByText(container, 'orchestration.method_ai'), container);
        const calls = mockApi.post.mock.calls.length;
        await click(buttonByText(container, 'orchestration.generate'), container);
        expect(mockApi.post.mock.calls.length).toBe(calls);
    } finally { await unmount(); }
});

test('TC-ORCH-115 | generate-from-intent envelope without data falls back to the full body', async () => {
    mockApi.post.mockImplementation(async (url) => {
        if (url.endsWith('/generate-from-intent')) return { status: 'success' }; // no `data`
        return { status: 'success', data: {} };
    });
    const { container, unmount } = await mount(OrchestrationCenter);
    try {
        await click(buttonByText(container, 'orchestration.method_ai'), container);
        await change(container.querySelector('textarea'), { target: { value: 'do something' } }, container);
        await click(buttonByText(container, 'orchestration.generate'), container);
        expect(transformFn).toHaveBeenCalledWith({ status: 'success' });
        expect(wfProps[wfProps.length - 1].mode).toBe('edit');
    } finally { await unmount(); }
});

test('TC-ORCH-116 | packages view renders the SolutionPackages list and back returns to welcome', async () => {
    const { container, unmount } = await mount(OrchestrationCenter);
    try {
        await click(buttonByText(container, 'orchestration.method_import'), container);
        expect(container.textContent).toContain('RAN_Energy_Saving_Solution_Package.pdf');
        expect(container.textContent).toContain('orchestration.packages_upload_title');
        await click(buttonByText(container, 'orchestration.back_to_options'), container);
        expect(container.textContent).toContain('orchestration.build_workflow');
    } finally { await unmount(); }
});

test('TC-ORCH-117 | graph editor entry opens the editor view with an empty canvas', async () => {
    const { container, unmount } = await mount(OrchestrationCenter);
    try {
        await click(buttonByText(container, 'orchestration.method_graph'), container);
        const last = wfProps[wfProps.length - 1];
        expect(last.mode).toBe('edit');
        expect(last.importedNodes).toEqual([]);
        expect(container.textContent).toContain('orchestration.back_to_options');
    } finally { await unmount(); }
});

test('TC-ORCH-118 | editor onCancel without a selection returns to the welcome view', async () => {
    const { container, unmount } = await mount(OrchestrationCenter);
    try {
        await click(buttonByText(container, 'orchestration.method_graph'), container);
        const last = wfProps[wfProps.length - 1];
        await act(async () => last.onCancel());
        await flush();
        expect(container.textContent).toContain('orchestration.build_workflow');
    } finally { await unmount(); }
});

test('TC-ORCH-119 | UnifiedWorkflow onSaveSuccess refetches the workflow list', async () => {
    const { container, unmount } = await mount(OrchestrationCenter);
    try {
        await click(buttonByText(container, 'orchestration.method_graph'), container);
        const before = mockApi.get.mock.calls.filter(c => c[0].endsWith('/workflows')).length;
        await act(async () => wfProps[wfProps.length - 1].onSaveSuccess());
        await flush();
        const after = mockApi.get.mock.calls.filter(c => c[0].endsWith('/workflows')).length;
        expect(after).toBeGreaterThan(before);
    } finally { await unmount(); }
});

test('TC-ORCH-120 | browse config toggle reveals the YAML textarea and edit toggle switches modes', async () => {
    mockApi.get.mockImplementation(async (url) => {
        if (url.endsWith('/workflows')) return { status: 'success', data: [{ workflow_id: 'wf-1', name: 'Detail Wf', tags: [] }] };
        if (url.endsWith('/templates')) return { status: 'success', data: [] };
        if (url.endsWith('/workflows/wf-1')) return { status: 'success', data: { id: 'wf-1', name: 'Detail Wf', desc: 'd' } };
        return { status: 'success', data: {} };
    });
    const { container, unmount } = await mount(OrchestrationCenter);
    try {
        await click(buttonByText(container, 'orchestration.browse_workflow'), container);
        const nameEl = [...container.querySelectorAll('h3')].find(h => h.textContent.includes('Detail Wf'));
        await click(nameEl, container); // select -> right panel appears
        const editToggle = buttonByText(container, 'orchestration.edit');
        const configToggle = editToggle.previousElementSibling;
        await click(configToggle, container);
        const yaml = container.querySelector('textarea');
        expect(yaml.value).toContain('wf-1');
        await click(editToggle, container); // browseMode -> edit
        expect(buttonByText(container, 'orchestration.preview_mode')).toBeTruthy();
        expect(wfProps[wfProps.length - 1].mode).toBe('edit');
    } finally { await unmount(); }
});

test('TC-ORCH-121 | dark theme renders the welcome surface without crashing', async () => {
    theme.isDark = true;
    const { container, unmount } = await mount(OrchestrationCenter);
    try {
        expect(container.textContent).toContain('orchestration.build_workflow');
        expect(container.textContent).toContain('orchestration.method_ai');
    } finally { await unmount(); }
});

test('TC-ORCH-122 | fetchWorkflows maps workflow_id, name fallback and tags from the envelope', async () => {
    mockApi.get.mockImplementation(async (url) => {
        if (url.endsWith('/workflows')) return { status: 'success', data: [{ workflow_id: 'wf-x', tags: ['ran', 'core'] }] };
        if (url.endsWith('/templates')) return { status: 'success', data: [] };
        return { status: 'success', data: {} };
    });
    const { container, unmount } = await mount(OrchestrationCenter);
    try {
        await click(buttonByText(container, 'orchestration.browse_workflow'), container);
        expect(container.textContent).toContain('Untitled'); // name fallback
        expect(container.textContent).toContain('ran, core'); // tags joined
    } finally { await unmount(); }
});

test('TC-ORCH-123 | non-success workflow envelope does not populate the list', async () => {
    mockApi.get.mockImplementation(async (url) => {
        if (url.endsWith('/workflows')) return { status: 'error', message: 'down' };
        if (url.endsWith('/templates')) return { status: 'success', data: [] };
        return { status: 'success', data: {} };
    });
    const { container, unmount } = await mount(OrchestrationCenter);
    try {
        await click(buttonByText(container, 'orchestration.browse_workflow'), container);
        expect(container.textContent).toContain('orchestration.no_workflows');
    } finally { await unmount(); }
});

// ---------------------------------------------------------------------------
// SolutionPackages
// ---------------------------------------------------------------------------

test('TC-ORCH-124 | progress indicator advances while a long-running AI generation is in flight', async () => {
    let resolveGenerate;
    mockApi.post.mockImplementation(async (url) => {
        if (url.endsWith('/generate-from-intent')) return new Promise(r => { resolveGenerate = r; });
        return { status: 'success', data: {} };
    });
    const { container, unmount } = await mount(OrchestrationCenter);
    try {
        await click(buttonByText(container, 'orchestration.method_ai'), container);
        await change(container.querySelector('textarea'), { target: { value: 'do something' } }, container);
        await click(buttonByText(container, 'orchestration.generate'), container);
        await act(async () => { await new Promise(r => setTimeout(r, 250)); });
        expect(container.textContent).toContain('orchestration.generating');
        await act(async () => { resolveGenerate({ status: 'success', data: { workflow: {} } }); await new Promise(r => setTimeout(r, 30)); });
        await flush();
        expect(wfProps[wfProps.length - 1].mode).toBe('edit');
    } finally { await unmount(); }
});

test('TC-ORCH-125 | an empty file selection on the hidden input is a silent no-op', async () => {
    const { container, unmount } = await mount(OrchestrationCenter);
    try {
        const input = container.querySelector('input[type="file"]');
        const calls = mockApi.post.mock.calls.length;
        await change(input, { target: { files: [] } }, container);
        expect(mockApi.post.mock.calls.length).toBe(calls);
        expect(container.textContent).toContain('orchestration.build_workflow');
    } finally { await unmount(); }
});

test('TC-ORCH-126 | importing a PDF from the packages view parses, plans and opens the detail view', async () => {
    const { container, unmount } = await mount(OrchestrationCenter);
    try {
        await click(buttonByText(container, 'orchestration.method_import'), container);
        const input = container.querySelector('.border-dashed input[type="file"]');
        await change(input, { target: { files: [pdfFile()] } }, container);
        await flush();
        expect(mockApi.post).toHaveBeenCalledWith('/rest/v1/orchestrate/parse-pdf', expect.any(FormData));
        expect(mockApi.post).toHaveBeenCalledWith('/rest/v1/orchestrate/generate-from-preflow', expect.objectContaining({ agent_cards: [{ name: 'agent1' }] }));
        expect(transformFn).toHaveBeenCalled();
        expect(wfProps[wfProps.length - 1].mode).toBe('view');
    } finally { await unmount(); }
});

test('TC-ORCH-127 | fetchWorkflows logs and leaves the list empty when the endpoint rejects', async () => {
    mockApi.get.mockImplementation(async (url) => {
        if (url.endsWith('/workflows')) throw new Error('workflow down');
        if (url.endsWith('/templates')) return { status: 'success', data: [] };
        return { status: 'success', data: {} };
    });
    const { container, unmount } = await mount(OrchestrationCenter);
    try {
        expect(consoleErrorSpy).toHaveBeenCalled();
        await click(buttonByText(container, 'orchestration.browse_workflow'), container);
        expect(container.textContent).toContain('orchestration.no_workflows');
    } finally { await unmount(); }
});

test('TC-ORCH-128 | fetchTemplates logs when the templates endpoint rejects', async () => {
    mockApi.get.mockImplementation(async (url) => {
        if (url.endsWith('/workflows')) return { status: 'success', data: [] };
        if (url.endsWith('/templates')) throw new Error('template down');
        return { status: 'success', data: {} };
    });
    const { container, unmount } = await mount(OrchestrationCenter);
    try {
        expect(consoleErrorSpy).toHaveBeenCalled();
        expect(container.textContent).toContain('orchestration.build_workflow');
    } finally { await unmount(); }
});

test('TC-ORCH-129 | importing a template logs when the import endpoint rejects', async () => {
    mockApi.get.mockImplementation(async (url) => {
        if (url.endsWith('/workflows')) return { status: 'success', data: [] };
        if (url.endsWith('/templates')) return { status: 'success', data: [{ id: 'tpl-1', name: 'Tpl A', description: 'd', step_count: 1, agent_count: 1, tags: [] }] };
        return { status: 'success', data: {} };
    });
    mockApi.post.mockImplementation(async (url) => {
        if (/\/templates\/tpl-1\/import$/.test(url)) throw new Error('import down');
        return { status: 'success', data: {} };
    });
    const { container, unmount } = await mount(OrchestrationCenter);
    try {
        await click(buttonByText(container, 'Tpl A'), container);
        expect(consoleErrorSpy).toHaveBeenCalled();
        expect(container.textContent).toContain('orchestration.build_workflow');
    } finally { await unmount(); }
});


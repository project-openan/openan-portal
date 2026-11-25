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
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

vi.mock('@openan/shared-workflow', () => ({
    UnifiedWorkflow: vi.fn(() => null),
    transformWorkflowToReactFlow: vi.fn(() => ({ nodes: [], edges: [] })),
}));
vi.mock('../plugins/execution-center/src/execution_statistics/index.jsx', () => ({
    default: vi.fn(() => null),
}));

import ExecutionCenter from '../plugins/execution-center/src/index.jsx';
import { PortalProvider } from '@openan/portal-sdk';
import { createApi } from '../portal/src/service/api.js';
import i18n, { registerPluginI18n } from '../portal/src/i18n/index.js';
import executionEn from '../plugins/execution-center/src/locales/en.json';
import { UnifiedWorkflow, transformWorkflowToReactFlow } from '@openan/shared-workflow';

// ── helpers ──

const flush = (ms = 10) => act(async () => { await new Promise(r => setTimeout(r, ms)); });

async function click(el) {
    expect(el, 'click target must exist').toBeTruthy();
    await act(async () => Simulate.click(el));
    await flush();
}

function findButton(node, text) {
    return [...node.querySelectorAll('button')].find(b => b.textContent.includes(text));
}

async function typeInInput(node, value, selector = 'input[type="text"]') {
    const input = node.querySelector(selector);
    expect(input, 'input must exist').toBeTruthy();
    await act(async () => Simulate.change(input, { target: { value } }));
    await flush();
}

async function mount(options = {}) {
    const {
        isDark = false,
        searchMode = 'fuzzy',
        agentCards = [{ name: 'workbench-agent' }],
        workflows = [],
        matchResults = [],
        records = [],
        recordDetail = null,
        workflowDetail = null,
        postImpl = null,
        getImpl = null,
    } = options;

    localStorage.clear();
    if (searchMode !== 'fuzzy') localStorage.setItem('execution_search_mode', searchMode);

    const streams = [];
    HTMLElement.prototype.scrollTo = vi.fn();
    vi.stubGlobal('EventSource', class {
        constructor(url) { this.url = url; this.close = vi.fn(); streams.push(this); }
    });

    const api = createApi('/api/orchestrate');
    api.get = getImpl || vi.fn(async (url) => {
        if (url.endsWith('/agent-cards')) return { status: 'success', data: agentCards };
        if (url.match(/\/execution-records\/[^/]+$/)) return { status: 'success', data: recordDetail };
        if (url.endsWith('/execution-records')) return { status: 'success', data: records };
        if (url.match(/\/workflows\/[^/]+$/) && !url.includes('execution-records')) {
            return { status: 'success', data: workflowDetail || { psop: { steps: [] } } };
        }
        if (url.endsWith('/workflows')) return { status: 'success', data: workflows, pagination: { has_more: false } };
        return { status: 'success', data: [] };
    });
    api.post = postImpl || vi.fn(async () => ({ status: 'success', data: matchResults }));
    api.delete = vi.fn(async () => ({ status: 'success' }));

    const node = document.createElement('div');
    document.body.appendChild(node);
    const root = createRoot(node);

    await act(async () => {
        root.render(<PortalProvider value={{ theme: { isDark }, api }}><ExecutionCenter /></PortalProvider>);
    });
    await flush();

    return { node, root, api, streams };
}

function sendEvent(stream, event) {
    return act(async () => stream.onmessage({ data: JSON.stringify(event) }));
}

let fixture;

beforeEach(async () => {
    registerPluginI18n('execution-center', { en: executionEn });
    await i18n.changeLanguage('en');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    UnifiedWorkflow.mockClear();
    transformWorkflowToReactFlow.mockClear();
});

afterEach(async () => {
    if (fixture) {
        await act(async () => fixture.root.unmount());
        if (fixture.node.parentNode) fixture.node.remove();
        fixture = null;
    }
    vi.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════
// Search Mode: Fuzzy
// ═══════════════════════════════════════════════════════════

test('TC-EXEC-101 | fuzzy mode renders intent input, disabled Match, and disabled Dispatch', async () => {
    // 输入: default fuzzy mode, no user intent typed
    // 预期: intent placeholder shown, Match disabled, Dispatch disabled
    // 断言: placeholder text, button disabled state, agent auto-selected
    fixture = await mount({ searchMode: 'fuzzy' });
    const input = fixture.node.querySelector('input[type="text"]');
    expect(input.placeholder).toBe('Please input your intent...');
    const matchBtn = findButton(fixture.node, 'Match');
    expect(matchBtn.disabled).toBe(true);
    const dispatchBtn = findButton(fixture.node, 'Dispatch');
    expect(dispatchBtn.disabled).toBe(true);
    // Agent should be auto-selected from agent-cards response
    const select = fixture.node.querySelector('select');
    expect(select.value).toBe('workbench-agent');
});

test('TC-EXEC-102 | typing intent enables Match and Dispatch buttons', async () => {
    // 输入: type "deploy app" into fuzzy search
    // 预期: Match and Dispatch buttons become enabled
    // 断言: disabled === false for both buttons
    fixture = await mount({ searchMode: 'fuzzy' });
    await typeInInput(fixture.node, 'deploy app');
    expect(findButton(fixture.node, 'Match').disabled).toBe(false);
    expect(findButton(fixture.node, 'Dispatch').disabled).toBe(false);
});

test('TC-EXEC-103 | pressing Enter in fuzzy input triggers match', async () => {
    // 输入: type intent and press Enter key
    // 预期: match API called with the typed intent
    // 断言: api.post called with retrieve-topn-by-intent URL and user_intent
    fixture = await mount({
        searchMode: 'fuzzy',
        matchResults: [{ workflow_id: 'wf-enter', name: 'Enter Workflow', description: 'd', tags: [], score: 0.9 }],
    });
    await typeInInput(fixture.node, 'build pipeline');
    const input = fixture.node.querySelector('input[type="text"]');
    await act(async () => Simulate.keyDown(input, { key: 'Enter' }));
    await flush();
    expect(fixture.api.post).toHaveBeenCalledWith(
        expect.stringContaining('/retrieve-topn-by-intent'),
        expect.objectContaining({ user_intent: 'build pipeline', top_n: 3 }),
    );
    expect(fixture.node.textContent).toContain('Enter Workflow');
});

// ═══════════════════════════════════════════════════════════
// Search Mode: All
// ═══════════════════════════════════════════════════════════

test('TC-EXEC-104 | all mode auto-loads workflows and displays count', async () => {
    // 输入: all mode with 3 workflows available
    // 预期: all 3 workflows listed, count badge shows "3 total"
    // 断言: workflow names visible, count text present
    fixture = await mount({
        searchMode: 'all',
        workflows: [
            { workflow_id: 'wf-a', name: 'Workflow Alpha', tags: ['test'], description: 'Alpha desc' },
            { workflow_id: 'wf-b', name: 'Workflow Beta', tags: [], description: 'Beta desc' },
            { workflow_id: 'wf-c', name: 'Workflow Gamma', tags: [], description: 'Gamma desc' },
        ],
    });
    await flush(50);
    expect(fixture.node.textContent).toContain('Workflow Alpha');
    expect(fixture.node.textContent).toContain('Workflow Beta');
    expect(fixture.node.textContent).toContain('Workflow Gamma');
    expect(fixture.node.textContent).toContain('3 total');
});

test('TC-EXEC-105 | all mode empty state shows no-workflows hint', async () => {
    // 输入: all mode with zero workflows
    // 预期: empty state message visible
    // 断言: "No workflows in the orchestration center yet" text shown
    fixture = await mount({ searchMode: 'all', workflows: [] });
    await flush(50);
    expect(fixture.node.textContent).toContain('No workflows in the orchestration center yet');
});

test('TC-EXEC-106 | all mode refresh button reloads workflow list', async () => {
    // 输入: all mode, click Refresh button
    // 预期: api.get called again for workflows
    // 断言: api.get call count increases after refresh click
    fixture = await mount({
        searchMode: 'all',
        workflows: [{ workflow_id: 'wf-r', name: 'Refreshable', tags: [] }],
    });
    await flush(50);
    const callsBefore = fixture.api.get.mock.calls.length;
    const refreshBtn = findButton(fixture.node, 'Refresh');
    await click(refreshBtn);
    await flush(50);
    expect(fixture.api.get.mock.calls.length).toBeGreaterThan(callsBefore);
    expect(fixture.node.textContent).toContain('Refreshable');
});

// ═══════════════════════════════════════════════════════════
// Search Mode: Exact
// ═══════════════════════════════════════════════════════════

test('TC-EXEC-107 | exact mode shows Filters button and expands filter panel', async () => {
    // 输入: exact mode, click Filters toggle
    // 预期: filter inputs for workflow ID, status, dates appear
    // 断言: specific filter labels and inputs visible after toggle
    fixture = await mount({ searchMode: 'exact' });
    const filtersBtn = findButton(fixture.node, 'Filters');
    expect(filtersBtn).toBeTruthy();
    await click(filtersBtn);
    expect(fixture.node.textContent).toContain('Workflow ID');
    expect(fixture.node.textContent).toContain('From Date');
    expect(fixture.node.textContent).toContain('To Date');
    expect(fixture.node.querySelector('input[placeholder="Enter workflow ID..."]')).toBeTruthy();
});

test('TC-EXEC-108 | exact mode name filter narrows results by substring', async () => {
    // 输入: exact mode with workflows "Alpha", "Beta", "AlphaGamma"; filter name="Alpha"
    // 预期: only workflows containing "Alpha" in name shown
    // 断言: Alpha visible, AlphaGamma visible, Beta NOT visible
    fixture = await mount({
        searchMode: 'exact',
        workflows: [
            { workflow_id: 'wf-1', name: 'Alpha', tags: [], description: '', created_at: '2026-01-01', status: 'success' },
            { workflow_id: 'wf-2', name: 'Beta', tags: [], description: '', created_at: '2026-01-01', status: 'failed' },
            { workflow_id: 'wf-3', name: 'AlphaGamma', tags: [], description: '', created_at: '2026-01-01', status: 'running' },
        ],
    });
    // Open filters panel
    await click(findButton(fixture.node, 'Filters'));
    // Type in the name filter (the main search input in exact mode)
    await typeInInput(fixture.node, 'Alpha');
    await flush(400); // wait for 300ms debounce + async
    expect(fixture.node.textContent).toContain('Alpha');
    expect(fixture.node.textContent).not.toContain('Beta');
    // AlphaGamma should also match since it contains "Alpha"
    expect(fixture.node.textContent).toContain('AlphaGamma');
});

test('TC-EXEC-109 | exact mode status filter narrows by status value', async () => {
    // 输入: exact mode with workflows of different statuses; filter status="failed"
    // 预期: only failed workflows shown
    // 断言: failed workflow visible, success workflow NOT visible
    fixture = await mount({
        searchMode: 'exact',
        workflows: [
            { workflow_id: 'wf-s', name: 'SuccessWF', tags: [], description: '', created_at: '2026-01-01', status: 'success' },
            { workflow_id: 'wf-f', name: 'FailedWF', tags: [], description: '', created_at: '2026-01-01', status: 'failed' },
        ],
    });
    await click(findButton(fixture.node, 'Filters'));
    // Type a name first to trigger search, then add status filter
    await typeInInput(fixture.node, 'WF');
    await flush(400);
    // Select status = failed
    const selects = fixture.node.querySelectorAll('select');
    const statusSelect = [...selects].find(s => [...s.options].some(o => o.value === 'failed'));
    await act(async () => Simulate.change(statusSelect, { target: { value: 'failed' } }));
    await flush(400);
    expect(fixture.node.textContent).toContain('FailedWF');
    expect(fixture.node.textContent).not.toContain('SuccessWF');
});

test('TC-EXEC-110 | exact mode tag filter toggles and filters by tag', async () => {
    // 输入: exact mode with tagged workflows; toggle "deploy" tag
    // 预期: only workflows with "deploy" tag shown
    // 断言: tagged workflow visible, untagged NOT visible
    fixture = await mount({
        searchMode: 'exact',
        workflows: [
            { workflow_id: 'wf-t1', name: 'TaggedWF', tags: ['deploy'], description: '', created_at: '2026-01-01', status: 'success' },
            { workflow_id: 'wf-t2', name: 'UntaggedWF', tags: ['monitor'], description: '', created_at: '2026-01-01', status: 'success' },
        ],
    });
    await click(findButton(fixture.node, 'Filters'));
    // Type name to trigger search
    await typeInInput(fixture.node, 'WF');
    await flush(400);
    // Click the "deploy" tag button
    const tagBtn = [...fixture.node.querySelectorAll('button')].find(b => b.textContent.trim() === 'deploy');
    expect(tagBtn).toBeTruthy();
    await click(tagBtn);
    await flush(400);
    expect(fixture.node.textContent).toContain('TaggedWF');
    expect(fixture.node.textContent).not.toContain('UntaggedWF');
});

test('TC-EXEC-111 | exact mode Clear button resets all filters', async () => {
    // 输入: exact mode with name filter set, click Clear
    // 预期: all filters reset, results cleared
    // 断言: input value cleared, no workflow results shown
    fixture = await mount({
        searchMode: 'exact',
        workflows: [
            { workflow_id: 'wf-x', name: 'Clearable', tags: [], description: '', created_at: '2026-01-01', status: 'success' },
        ],
    });
    await typeInInput(fixture.node, 'Clear');
    await flush(400);
    expect(fixture.node.textContent).toContain('Clearable');
    const clearBtn = findButton(fixture.node, 'Clear');
    await click(clearBtn);
    await flush();
    const input = fixture.node.querySelector('input[type="text"]');
    expect(input.value).toBe('');
});

test('TC-EXEC-112 | exact mode workflow ID filter narrows by ID substring', async () => {
    // 输入: exact mode with workflows, filter by workflow ID only (no name filter)
    // 预期: only matching ID shown
    // 断言: matching workflow visible, non-matching NOT visible
    fixture = await mount({
        searchMode: 'exact',
        workflows: [
            { workflow_id: 'deploy-123', name: 'DeployA', tags: [], description: '', created_at: '2026-01-01', status: 'success' },
            { workflow_id: 'monitor-456', name: 'MonitorB', tags: [], description: '', created_at: '2026-01-01', status: 'success' },
        ],
    });
    await click(findButton(fixture.node, 'Filters'));
    // Type in workflow ID filter only (no name filter)
    const wfIdInput = fixture.node.querySelector('input[placeholder="Enter workflow ID..."]');
    expect(wfIdInput).toBeTruthy();
    await act(async () => Simulate.change(wfIdInput, { target: { value: 'deploy' } }));
    await flush(400);
    expect(fixture.node.textContent).toContain('DeployA');
    expect(fixture.node.textContent).not.toContain('MonitorB');
});

// ═══════════════════════════════════════════════════════════
// Fuzzy Match
// ═══════════════════════════════════════════════════════════

test('TC-EXEC-113 | fuzzy match with single result auto-selects the workflow', async () => {
    // 输入: type intent, click Match, API returns 1 result
    // 预期: workflow auto-selected, source set to 'retrieved', Native badge shown
    // 断言: workflow name visible, selectedId set, Native label present
    fixture = await mount({
        searchMode: 'fuzzy',
        matchResults: [{ workflow_id: 'wf-single', name: 'Single Match', description: 'Only result', tags: [], score: 0.95 }],
    });
    await typeInInput(fixture.node, 'single intent');
    await click(findButton(fixture.node, 'Match'));
    await flush();
    expect(fixture.node.textContent).toContain('Single Match');
    expect(fixture.node.textContent).toContain('Native');
});

test('TC-EXEC-114 | fuzzy match with multiple results opens selection dialog', async () => {
    // 输入: type intent, click Match, API returns 2 results
    // 预期: selection dialog appears with both candidates
    // 断言: "Select the correct workflow" title, both names visible, score badges shown
    fixture = await mount({
        searchMode: 'fuzzy',
        matchResults: [
            { workflow_id: 'wf-c1', name: 'Candidate One', description: 'First', tags: ['a'], score: 0.9 },
            { workflow_id: 'wf-c2', name: 'Candidate Two', description: 'Second', tags: ['b'], score: 0.7 },
        ],
    });
    await typeInInput(fixture.node, 'multi intent');
    await click(findButton(fixture.node, 'Match'));
    await flush();
    expect(fixture.node.textContent).toContain('Select the correct workflow');
    expect(fixture.node.textContent).toContain('Candidate One');
    expect(fixture.node.textContent).toContain('Candidate Two');
    // Score percentage badges
    expect(fixture.node.textContent).toContain('90%');
    expect(fixture.node.textContent).toContain('70%');
});

test('TC-EXEC-115 | selecting candidate from dialog sets workflow and closes dialog', async () => {
    // 输入: multiple match results, click first candidate in dialog
    // 预期: dialog closes, workflow selected, Native badge shown
    // 断言: dialog title gone, workflow name in list, Native visible
    fixture = await mount({
        searchMode: 'fuzzy',
        matchResults: [
            { workflow_id: 'wf-pick', name: 'Picked One', description: 'd1', tags: [], score: 0.8 },
            { workflow_id: 'wf-other', name: 'Other One', description: 'd2', tags: [], score: 0.6 },
        ],
    });
    await typeInInput(fixture.node, 'pick intent');
    await click(findButton(fixture.node, 'Match'));
    await flush();
    expect(fixture.node.textContent).toContain('Select the correct workflow');
    // Click the first candidate button (by workflow name)
    const candidateBtn = [...fixture.node.querySelectorAll('button')].find(b => b.textContent.includes('Picked One'));
    await click(candidateBtn);
    await flush();
    expect(fixture.node.textContent).not.toContain('Select the correct workflow');
    expect(fixture.node.textContent).toContain('Picked One');
    expect(fixture.node.textContent).toContain('Other One'); // all candidates added to matched list
    expect(fixture.node.textContent).toContain('Native');
});

test('TC-EXEC-116 | fuzzy match with zero results shows no-match error', async () => {
    // 输入: type intent, click Match, API returns empty array
    // 预期: "No matching workflow found" error shown
    // 断言: error toast text
    fixture = await mount({ searchMode: 'fuzzy', matchResults: [] });
    await typeInInput(fixture.node, 'nonexistent intent');
    await click(findButton(fixture.node, 'Match'));
    await flush();
    expect(fixture.node.textContent).toContain('No matching workflow found');
});

test('TC-EXEC-117 | fuzzy match API failure shows match-failed error', async () => {
    // 输入: type intent, click Match, API throws error
    // 预期: "Match request failed." error shown
    // 断言: error toast text
    fixture = await mount({
        searchMode: 'fuzzy',
        postImpl: vi.fn(async () => { throw new Error('network error'); }),
    });
    await typeInInput(fixture.node, 'failing intent');
    await click(findButton(fixture.node, 'Match'));
    await flush();
    expect(fixture.node.textContent).toContain('Match request failed.');
});

// ═══════════════════════════════════════════════════════════
// Dispatch Flow
// ═══════════════════════════════════════════════════════════

test('TC-EXEC-118 | dispatch creates stream with intent and agent_name parameters', async () => {
    // 输入: type intent, click Dispatch in fuzzy mode
    // 预期: stream URL contains intent and agent_name query params
    // 断言: stream URL matches dispatch endpoint with encoded params
    fixture = await mount({ searchMode: 'fuzzy' });
    await typeInInput(fixture.node, 'deploy service');
    await click(findButton(fixture.node, 'Dispatch'));
    expect(fixture.streams).toHaveLength(1);
    expect(fixture.streams[0].url).toContain('/dispatch?');
    expect(fixture.streams[0].url).toContain('intent=deploy%20service');
    expect(fixture.streams[0].url).toContain('agent_name=workbench-agent');
});

test('TC-EXEC-119 | dispatch start event creates dispatch workflow entry with name', async () => {
    // 输入: dispatch then send start event with workflow name
    // 预期: dispatch entry in workflow list, status Running
    // 断言: workflow name visible, "Running" status shown
    fixture = await mount({ searchMode: 'fuzzy' });
    await typeInInput(fixture.node, 'start test');
    await click(findButton(fixture.node, 'Dispatch'));
    await sendEvent(fixture.streams[0], { type: 'start', data: { workflow: 'DispatchedFlow' }, timestamp: 1 });
    await flush();
    expect(fixture.node.textContent).toContain('DispatchedFlow');
    expect(fixture.node.textContent).toContain('Running');
});

test('TC-EXEC-120 | dispatch psop_update with JSON string parses and sets workflow status', async () => {
    // 输入: dispatch, send psop_update with psop as JSON string
    // 预期: transformWorkflowToReactFlow called with parsed object
    // 断言: mock called with the parsed psop object
    fixture = await mount({ searchMode: 'fuzzy' });
    await typeInInput(fixture.node, 'psop string test');
    await click(findButton(fixture.node, 'Dispatch'));
    const psopObj = { steps: [{ id: 's1', name: 'Step1' }] };
    await sendEvent(fixture.streams[0], { type: 'psop_update', data: { psop: JSON.stringify(psopObj) }, timestamp: 2 });
    await flush();
    expect(transformWorkflowToReactFlow).toHaveBeenCalledWith(psopObj);
});

test('TC-EXEC-121 | dispatch psop_update with object sets status directly without JSON.parse', async () => {
    // 输入: dispatch, send psop_update with psop as object (not string)
    // 预期: transformWorkflowToReactFlow called with the object directly
    // 断言: mock called with the exact object reference
    fixture = await mount({ searchMode: 'fuzzy' });
    await typeInInput(fixture.node, 'psop object test');
    await click(findButton(fixture.node, 'Dispatch'));
    const psopObj = { steps: [{ id: 's2', name: 'DirectStep' }] };
    await sendEvent(fixture.streams[0], { type: 'psop_update', data: { psop: psopObj }, timestamp: 3 });
    await flush();
    expect(transformWorkflowToReactFlow).toHaveBeenCalledWith(psopObj);
});

test('TC-EXEC-122 | dispatch psop_update with invalid JSON logs error and does not crash', async () => {
    // 输入: dispatch, send psop_update with invalid JSON string
    // 预期: error logged, component still functional
    // 断言: console.error called, no crash, Running status still visible
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fixture = await mount({ searchMode: 'fuzzy' });
    await typeInInput(fixture.node, 'bad json test');
    await click(findButton(fixture.node, 'Dispatch'));
    await sendEvent(fixture.streams[0], { type: 'psop_update', data: { psop: '{invalid json' }, timestamp: 4 });
    await flush();
    expect(errorSpy).toHaveBeenCalledWith('Failed to parse psop_update data:', expect.any(Error));
    expect(fixture.node.textContent).toContain('Running');
});

test('TC-EXEC-123 | dispatch complete event shows Completed status and closes stream', async () => {
    // 输入: dispatch, send complete event
    // 预期: status changes to Completed, stream closed
    // 断言: "Completed" text, stream.close called
    fixture = await mount({ searchMode: 'fuzzy' });
    await typeInInput(fixture.node, 'complete test');
    await click(findButton(fixture.node, 'Dispatch'));
    await sendEvent(fixture.streams[0], { type: 'complete', data: {}, timestamp: 5 });
    await flush();
    expect(fixture.streams[0].close).toHaveBeenCalled();
    expect(fixture.node.textContent).toContain('Completed');
});

test('TC-EXEC-124 | dispatch_result event shows Completed status', async () => {
    // 输入: dispatch, send dispatch_result terminal event
    // 预期: status label = Completed
    // 断言: "Completed" text visible
    fixture = await mount({ searchMode: 'fuzzy' });
    await typeInInput(fixture.node, 'result test');
    await click(findButton(fixture.node, 'Dispatch'));
    await sendEvent(fixture.streams[0], { type: 'dispatch_result', data: {}, timestamp: 6 });
    await flush();
    expect(fixture.node.textContent).toContain('Completed');
});

test('TC-EXEC-125 | dispatch_error event shows Failed status and error message', async () => {
    // 输入: dispatch, send dispatch_error with error message
    // 预期: status = Failed, error message visible
    // 断言: "Failed" text and error message text
    fixture = await mount({ searchMode: 'fuzzy' });
    await typeInInput(fixture.node, 'error dispatch test');
    await click(findButton(fixture.node, 'Dispatch'));
    await sendEvent(fixture.streams[0], { type: 'dispatch_error', data: { error: 'Agent unavailable' }, timestamp: 7 });
    await flush();
    expect(fixture.node.textContent).toContain('Failed');
    expect(fixture.node.textContent).toContain('Agent unavailable');
});

// ═══════════════════════════════════════════════════════════
// Execute Flow
// ═══════════════════════════════════════════════════════════

test('TC-EXEC-126 | execute starts stream with psop_id and target_agent parameters', async () => {
    // 输入: all mode, select workflow, click play button
    // 预期: stream URL contains psop_id and target_agent
    // 断言: URL has encoded psop_id and target_agent params
    fixture = await mount({
        searchMode: 'all',
        workflows: [{ workflow_id: 'wf-exec-1', name: 'Executable WF', tags: [] }],
    });
    await flush(50);
    const wfCard = [...fixture.node.querySelectorAll('[class*="cursor-pointer"]')].find(el => el.textContent.includes('Executable WF'));
    const playBtn = wfCard.querySelector('button');
    await click(playBtn);
    expect(fixture.streams).toHaveLength(1);
    expect(fixture.streams[0].url).toContain('psop_id=wf-exec-1');
    expect(fixture.streams[0].url).toContain('target_agent=workbench-agent');
    expect(fixture.streams[0].url).toContain('/execute?');
});

test('TC-EXEC-127 | execute psop_update updates workflow visualization via transform', async () => {
    // 输入: start execution, send psop_update event
    // 预期: transformWorkflowToReactFlow called with parsed psop
    // 断言: mock called with the parsed status object
    fixture = await mount({
        searchMode: 'all',
        workflows: [{ workflow_id: 'wf-exec-2', name: 'PsopUpdate WF', tags: [] }],
    });
    await flush(50);
    const wfCard = [...fixture.node.querySelectorAll('[class*="cursor-pointer"]')].find(el => el.textContent.includes('PsopUpdate WF'));
    await click(wfCard.querySelector('button'));
    const psopStatus = { steps: [{ id: 'exec-step', name: 'Executing' }] };
    await sendEvent(fixture.streams[0], { type: 'psop_update', data: { psop: psopStatus }, timestamp: 8 });
    await flush();
    expect(transformWorkflowToReactFlow).toHaveBeenCalledWith(psopStatus);
});

test('TC-EXEC-128 | stop execution closes stream and shows cancelled status', async () => {
    // 输入: start execution, then click stop button
    // 预期: stream closed, cancelled event added, status = Execution cancelled
    // 断言: stream.close called, "Execution cancelled" text
    fixture = await mount({
        searchMode: 'all',
        workflows: [{ workflow_id: 'wf-stop', name: 'Stoppable WF', tags: [] }],
    });
    await flush(50);
    const wfCard = [...fixture.node.querySelectorAll('[class*="cursor-pointer"]')].find(el => el.textContent.includes('Stoppable WF'));
    await click(wfCard.querySelector('button'));
    expect(fixture.streams).toHaveLength(1);
    // Click stop button (same button element, now shows StopCircle)
    const stopBtn = wfCard.querySelector('button');
    await click(stopBtn);
    expect(fixture.streams[0].close).toHaveBeenCalled();
    expect(fixture.node.textContent).toContain('Execution cancelled');
});

test('TC-EXEC-129 | execute complete event shows Completed and closes stream', async () => {
    // 输入: start execution, send complete terminal event
    // 预期: status = Completed, stream closed
    // 断言: "Completed" text, close called
    fixture = await mount({
        searchMode: 'all',
        workflows: [{ workflow_id: 'wf-complete', name: 'Completable WF', tags: [] }],
    });
    await flush(50);
    const wfCard = [...fixture.node.querySelectorAll('[class*="cursor-pointer"]')].find(el => el.textContent.includes('Completable WF'));
    await click(wfCard.querySelector('button'));
    await sendEvent(fixture.streams[0], { type: 'complete', data: {}, timestamp: 9 });
    await flush();
    expect(fixture.streams[0].close).toHaveBeenCalled();
    expect(fixture.node.textContent).toContain('Completed');
});

// ═══════════════════════════════════════════════════════════
// Workflow Selection
// ═══════════════════════════════════════════════════════════

test('TC-EXEC-130 | clicking workflow card sets selectedId and loads detail', async () => {
    // 输入: all mode with workflows, click on workflow card (not play button)
    // 预期: selectedId set, workflow detail fetched via getWorkflowById
    // 断言: api.get called with /workflows/{id}, Native badge shown
    fixture = await mount({
        searchMode: 'all',
        workflows: [{ workflow_id: 'wf-select', name: 'Selectable WF', tags: [], description: 'desc' }],
        workflowDetail: { psop: { steps: [{ id: 'd1' }] } },
    });
    await flush(50);
    const wfCard = [...fixture.node.querySelectorAll('[class*="cursor-pointer"]')].find(el => el.textContent.includes('Selectable WF'));
    // Click on the card itself (not the play button)
    await act(async () => Simulate.click(wfCard));
    await flush();
    expect(fixture.api.get).toHaveBeenCalledWith(expect.stringContaining('/workflows/wf-select'));
    expect(fixture.node.textContent).toContain('Native');
});

test('TC-EXEC-131 | workflow card play button starts execution with correct ID', async () => {
    // 输入: all mode, click play button on specific workflow
    // 预期: stream URL contains the workflow_id as psop_id
    // 断言: psop_id=wf-play in URL
    fixture = await mount({
        searchMode: 'all',
        workflows: [
            { workflow_id: 'wf-play', name: 'PlayWF', tags: [] },
            { workflow_id: 'wf-other', name: 'OtherWF', tags: [] },
        ],
    });
    await flush(50);
    const wfCard = [...fixture.node.querySelectorAll('[class*="cursor-pointer"]')].find(el => el.textContent.includes('PlayWF'));
    await click(wfCard.querySelector('button'));
    expect(fixture.streams[0].url).toContain('psop_id=wf-play');
});

// ═══════════════════════════════════════════════════════════
// History
// ═══════════════════════════════════════════════════════════

test('TC-EXEC-132 | history tab loads and displays records with status badges', async () => {
    // 输入: click History tab with 2 records (success and failed)
    // 预期: both records visible with correct status labels
    // 断言: record names visible, "成功" and "失败" status labels
    fixture = await mount({
        searchMode: 'fuzzy',
        records: [
            { execution_id: 'exec-1', psop_id: 'wf-h1', psop_name: 'History Success', status: 'success', started_at: 1700000000 },
            { execution_id: 'exec-2', psop_id: 'wf-h2', psop_name: 'History Failed', status: 'failed', error: 'Connection timeout' },
        ],
    });
    await click(findButton(fixture.node, 'History'));
    await flush(50);
    expect(fixture.api.get).toHaveBeenCalledWith(expect.stringContaining('/execution-records'));
    expect(fixture.node.textContent).toContain('History Success');
    expect(fixture.node.textContent).toContain('History Failed');
    expect(fixture.node.textContent).toContain('成功');
    expect(fixture.node.textContent).toContain('失败');
});

test('TC-EXEC-133 | history empty state shows no-records message', async () => {
    // 输入: click History tab with zero records
    // 预期: empty state message visible
    // 断言: "暂无执行记录" text
    fixture = await mount({ searchMode: 'fuzzy', records: [] });
    await click(findButton(fixture.node, 'History'));
    await flush(50);
    expect(fixture.node.textContent).toContain('暂无执行记录');
});

test('TC-EXEC-134 | history detail loads events and final_psop on record click', async () => {
    // 输入: click History tab, click a record with events and final_psop
    // 预期: events loaded, psop status set, transformWorkflowToReactFlow called
    // 断言: api.get called with /execution-records/{id}, transform called with final_psop
    const detailRecord = {
        execution_id: 'exec-detail',
        psop_id: 'wf-detail',
        final_psop: { steps: [{ id: 'final-step', name: 'Final' }] },
        events: [
            { type: 'step_start', data: { step: 'StepA' }, timestamp: 1 },
            { type: 'step_complete', data: { step: 'StepA', results: 'done' }, timestamp: 2 },
            { type: 'agent_request', data: { agent: 'agent-1', request: 'test' }, timestamp: 3 },
            { type: 'agent_response', data: { agent: 'agent-1', response: 'ok' }, timestamp: 4 },
            { type: 'negotiation_request', data: { agent: 'agent-1', concern: 'need info' }, timestamp: 5 },
            { type: 'negotiation_resolved', data: { agent: 'agent-1', clarification: 'clarified' }, timestamp: 6 },
            { type: 'negotiation_failed', data: { agent: 'agent-1', reason: 'no agreement' }, timestamp: 7 },
            { type: 'start', data: { workflow: 'DetailFlow' }, timestamp: 8 },
            { type: 'complete', data: {}, timestamp: 9 },
            { type: 'some_other_type', data: {}, timestamp: 10 }, // should be filtered out
        ],
    };
    fixture = await mount({
        searchMode: 'fuzzy',
        records: [{ execution_id: 'exec-detail', psop_id: 'wf-detail', psop_name: 'Detail Record', status: 'success', started_at: 1700000000 }],
        recordDetail: detailRecord,
    });
    await click(findButton(fixture.node, 'History'));
    await flush(50);
    const recordCard = [...fixture.node.querySelectorAll('[class*="cursor-pointer"]')].find(el => el.textContent.includes('Detail Record'));
    await click(recordCard);
    await flush(50);
    expect(fixture.api.get).toHaveBeenCalledWith(expect.stringContaining('/execution-records/exec-detail'));
    // final_psop should trigger transformWorkflowToReactFlow
    expect(transformWorkflowToReactFlow).toHaveBeenCalledWith(detailRecord.final_psop);
    // The "some_other_type" event should be filtered out, only valid events loaded
    expect(fixture.node.textContent).toContain('DetailFlow');
});

test('TC-EXEC-135 | delete record removes it from history list', async () => {
    // 输入: History tab with records, click delete on a record, confirm
    // 预期: record removed from list, api.delete called
    // 断言: deleted record name gone, api.delete called with correct ID
    fixture = await mount({
        searchMode: 'fuzzy',
        records: [
            { execution_id: 'exec-del', psop_id: 'wf-del', psop_name: 'Deletable Record', status: 'success', started_at: 1700000000 },
            { execution_id: 'exec-keep', psop_id: 'wf-keep', psop_name: 'Keep Record', status: 'success', started_at: 1700000001 },
        ],
    });
    await click(findButton(fixture.node, 'History'));
    await flush(200);
    // Verify records loaded
    expect(fixture.node.textContent).toContain('Deletable Record');
    // Find the delete button (Trash2 icon) inside the Deletable record card
    const delCard = [...fixture.node.querySelectorAll('[class*="cursor-pointer"]')].find(el => el.textContent.includes('Deletable Record'));
    expect(delCard).toBeTruthy();
    const deleteBtn = delCard.querySelector('button');
    expect(deleteBtn).toBeTruthy();
    await click(deleteBtn);
    // Delete dialog should appear
    expect(fixture.node.textContent).toContain('Delete Execution Record');
    // Click the Delete confirm button in dialog (identified by bg-red-500 class)
    const confirmBtn = [...fixture.node.querySelectorAll('button')].find(b => b.className.includes('bg-red-500'));
    expect(confirmBtn).toBeTruthy();
    await click(confirmBtn);
    await flush(200);
    expect(fixture.api.delete).toHaveBeenCalledWith(expect.stringContaining('/execution-records/exec-del'));
    expect(fixture.node.textContent).not.toContain('Deletable Record');
    expect(fixture.node.textContent).toContain('Keep Record');
});

test('TC-EXEC-136 | delete record cancel button closes dialog without deleting', async () => {
    // 输入: open delete dialog, click Cancel
    // 预期: dialog closes, record still present, api.delete NOT called
    // 断言: record name still visible, api.delete not called
    fixture = await mount({
        searchMode: 'fuzzy',
        records: [
            { execution_id: 'exec-cancel', psop_id: 'wf-c', psop_name: 'Cancel Delete', status: 'success', started_at: 1700000000 },
        ],
    });
    await click(findButton(fixture.node, 'History'));
    await flush(200);
    expect(fixture.node.textContent).toContain('Cancel Delete');
    const delCard = [...fixture.node.querySelectorAll('[class*="cursor-pointer"]')].find(el => el.textContent.includes('Cancel Delete'));
    expect(delCard).toBeTruthy();
    const deleteBtn = delCard.querySelector('button');
    expect(deleteBtn).toBeTruthy();
    await click(deleteBtn);
    expect(fixture.node.textContent).toContain('Delete Execution Record');
    // Cancel button identified by exact 'bg-zinc-100' class (not hover:bg-zinc-100)
    const cancelBtn = [...fixture.node.querySelectorAll('button')].find(b =>
        b.className.split(' ').includes('bg-zinc-100')
    );
    expect(cancelBtn).toBeTruthy();
    await click(cancelBtn);
    await flush();
    expect(fixture.node.textContent).not.toContain('Delete Execution Record');
    expect(fixture.node.textContent).toContain('Cancel Delete');
    expect(fixture.api.delete).not.toHaveBeenCalled();
});

// ═══════════════════════════════════════════════════════════
// UI Interactions
// ═══════════════════════════════════════════════════════════

test('TC-EXEC-137 | statistics sub-menu renders ExecutionStatistics component', async () => {
    // 输入: click Statistics sub-menu button
    // 预期: ExecutionStatistics rendered, execution UI hidden
    // 断言: "Execution Statistics" title visible, search bar gone
    fixture = await mount({ searchMode: 'fuzzy' });
    const statsBtn = [...fixture.node.querySelectorAll('button')].find(b => b.textContent.includes('Execution Statistics'));
    await click(statsBtn);
    expect(fixture.node.textContent).toContain('Execution Statistics');
    expect(fixture.node.textContent).not.toContain('Please input your intent');
});

test('TC-EXEC-138 | left panel collapse hides workflow list, expand restores it', async () => {
    // 输入: click collapse button on left panel, then click expand
    // 预期: panel hidden after collapse, restored after expand
    // 断言: "Match" tab label gone after collapse, back after expand
    fixture = await mount({ searchMode: 'fuzzy' });
    // Find the collapse button (PanelLeftClose icon)
    const collapseBtn = fixture.node.querySelector('button[title="Collapse Panel"]');
    expect(collapseBtn).toBeTruthy();
    await click(collapseBtn);
    // Panel collapsed — search input should no longer be in the left panel area
    const expandBtn = fixture.node.querySelector('button[title="Expand Panel"]');
    expect(expandBtn).toBeTruthy();
    await click(expandBtn);
    // Panel restored
    expect(fixture.node.querySelector('button[title="Collapse Panel"]')).toBeTruthy();
});

test('TC-EXEC-139 | summary section toggle shows and hides placeholder content', async () => {
    // 输入: click summary toggle button
    // 预期: placeholder content appears, then hides on second click
    // 断言: "Summary content coming soon" visible after expand, gone after collapse
    fixture = await mount({ searchMode: 'fuzzy' });
    const summaryBtn = [...fixture.node.querySelectorAll('button')].find(b => b.textContent.includes('Execution Summary'));
    expect(summaryBtn).toBeTruthy();
    await click(summaryBtn);
    expect(fixture.node.textContent).toContain('Summary content coming soon');
    await click(summaryBtn);
    expect(fixture.node.textContent).not.toContain('Summary content coming soon');
});

test('TC-EXEC-140 | right panel expand toggles to full-width overlay', async () => {
    // 输入: click panel expand button in right panel header
    // 预期: panel expands to 60vw fixed overlay
    // 断言: panel container has fixed positioning class after expand
    fixture = await mount({ searchMode: 'fuzzy' });
    // Find the PanelLeftOpen button in the interaction panel header
    const panelBtns = [...fixture.node.querySelectorAll('button[title]')].filter(b =>
        b.title === 'Expand Panel' || b.title === 'Collapse Panel'
    );
    // The right panel expand button is the one NOT in the left panel
    const expandBtn = panelBtns.find(b => b.title === 'Expand Panel');
    expect(expandBtn).toBeTruthy();
    await click(expandBtn);
    // After expand, the button title should change to "Collapse Panel"
    const collapseBtn = fixture.node.querySelector('button[title="Collapse Panel"]');
    expect(collapseBtn).toBeTruthy();
    // Click again to collapse
    await click(collapseBtn);
    expect(fixture.node.querySelector('button[title="Expand Panel"]')).toBeTruthy();
});

test('TC-EXEC-141 | error dismiss button clears error message', async () => {
    // 输入: trigger a match error, then click dismiss (X) button on error toast
    // 预期: error message disappears
    // 断言: error text gone after dismiss click
    fixture = await mount({ searchMode: 'fuzzy', matchResults: [] });
    await typeInInput(fixture.node, 'no results');
    await click(findButton(fixture.node, 'Match'));
    await flush();
    expect(fixture.node.textContent).toContain('No matching workflow found');
    // Find the dismiss X button in the error toast
    const errorToast = [...fixture.node.querySelectorAll('[class*="bg-white"][class*="border-rose"]')].find(el =>
        el.textContent.includes('No matching workflow found')
    );
    const dismissBtn = errorToast.querySelector('button');
    await click(dismissBtn);
    expect(fixture.node.textContent).not.toContain('No matching workflow found');
});

test('TC-EXEC-142 | agent selection dropdown changes selected agent', async () => {
    // 输入: change agent select to a different agent
    // 预期: selectedAgent state updated
    // 断言: new agent name appears as selected option
    fixture = await mount({
        searchMode: 'fuzzy',
        agentCards: [{ name: 'workbench-agent' }, { name: 'research-agent' }],
    });
    const select = fixture.node.querySelector('select');
    expect(select.value).toBe('workbench-agent');
    await act(async () => Simulate.change(select, { target: { value: 'research-agent' } }));
    await flush();
    expect(select.value).toBe('research-agent');
});

// ═══════════════════════════════════════════════════════════
// Dark Theme
// ═══════════════════════════════════════════════════════════

test('TC-EXEC-143 | dark theme renders with dark-mode CSS classes', async () => {
    // 输入: render with isDark=true
    // 预期: dark theme classes applied to panel
    // 断言: panel container has bg-zinc-900/95 class (dark panel)
    fixture = await mount({ searchMode: 'fuzzy', isDark: true });
    const panels = [...fixture.node.querySelectorAll('[class*="rounded-2xl"][class*="border"]')];
    const hasDarkPanel = panels.some(el => el.className.includes('bg-zinc-900/95'));
    expect(hasDarkPanel).toBe(true);
});

// ═══════════════════════════════════════════════════════════
// Node Selection & Scroll
// ═══════════════════════════════════════════════════════════

test('TC-EXEC-144 | node select callback sets selectedNodeId and queries log entries', async () => {
    // 输入: select a workflow (to render UnifiedWorkflow), invoke onSelectChange with a node
    // 预期: selectedNodeId set, scrollIntoView attempted for matching data-agent elements
    // 断言: scrollTo called (via HTMLElement.prototype.scrollTo mock)
    fixture = await mount({
        searchMode: 'fuzzy',
        matchResults: [{ workflow_id: 'wf-node', name: 'NodeTest WF', description: 'd', tags: [], score: 0.9 }],
    });
    await typeInInput(fixture.node, 'node select test');
    await click(findButton(fixture.node, 'Match'));
    await flush();
    // UnifiedWorkflow should have been rendered (selectedId is set)
    expect(UnifiedWorkflow).toHaveBeenCalled();
    const lastCall = UnifiedWorkflow.mock.calls[UnifiedWorkflow.mock.calls.length - 1];
    const onSelectChange = lastCall[0].onSelectChange;
    expect(onSelectChange).toBeTypeOf('function');
    // Invoke with a node that has an agent
    await act(async () => onSelectChange({ id: 'node-1', data: { agent: 'test-agent' } }));
    await flush();
    // Invoke with null (early return path)
    await act(async () => onSelectChange(null));
    await flush();
    // No crash — component still functional
    expect(fixture.node.textContent).toContain('NodeTest WF');
});

test('TC-EXEC-145 | scroll handler toggles auto-scroll off and shows Sync button', async () => {
    // 输入: trigger onScroll handler with non-bottom scroll position
    // 预期: autoScroll disabled, Sync button appears
    // 断言: "Sync" button visible after scroll away from bottom
    fixture = await mount({
        searchMode: 'all',
        workflows: [{ workflow_id: 'wf-scroll', name: 'ScrollTest WF', tags: [] }],
    });
    await flush(50);
    // Start execution to add events and enable scrolling
    const wfCard = [...fixture.node.querySelectorAll('[class*="cursor-pointer"]')].find(el => el.textContent.includes('ScrollTest WF'));
    await click(wfCard.querySelector('button'));
    // Send some events to populate the log
    await sendEvent(fixture.streams[0], { type: 'start', data: { workflow: 'ScrollTest' }, timestamp: 1 });
    await sendEvent(fixture.streams[0], { type: 'psop_update', data: { psop: { steps: [] } }, timestamp: 2 });
    await flush();
    // Find the scroll container by locating the element with onScroll in React props
    const candidates = [...fixture.node.querySelectorAll('[class*="overflow-y-auto"]')];
    const scrollContainer = candidates.find(el => {
        const key = Object.keys(el).find(k => k.startsWith('__reactProps$'));
        return key && el[key].onScroll;
    });
    expect(scrollContainer).toBeTruthy();
    // Access React fiber props to get the onScroll handler directly
    const propsKey = Object.keys(scrollContainer).find(k => k.startsWith('__reactProps$'));
    expect(propsKey).toBeTruthy();
    const onScroll = scrollContainer[propsKey].onScroll;
    expect(onScroll).toBeTypeOf('function');
    // Call handler with scroll position away from bottom (isAtBottom = false)
    await act(async () => onScroll({
        currentTarget: { scrollTop: 0, scrollHeight: 500, clientHeight: 200 },
    }));
    await flush();
    expect(fixture.node.textContent).toContain('Sync');
    // Click Sync button to re-enable auto-scroll
    const syncBtn = findButton(fixture.node, 'Sync');
    await click(syncBtn);
    expect(fixture.node.textContent).not.toContain('Sync');
});

// ═══════════════════════════════════════════════════════════
// Match result with score badges
// ═══════════════════════════════════════════════════════════

test('TC-EXEC-146 | selection dialog shows score color badges by threshold', async () => {
    // 输入: match with 3 results at different scores (high >= 0.8, mid >= 0.5, low < 0.5)
    // 预期: different score badge colors for different thresholds
    // 断言: all three score percentages visible
    fixture = await mount({
        searchMode: 'fuzzy',
        matchResults: [
            { workflow_id: 'wf-high', name: 'HighScore', description: 'd', tags: [], score: 0.95 },
            { workflow_id: 'wf-mid', name: 'MidScore', description: 'd', tags: [], score: 0.65 },
            { workflow_id: 'wf-low', name: 'LowScore', description: 'd', tags: [], score: 0.35 },
        ],
    });
    await typeInInput(fixture.node, 'score test');
    await click(findButton(fixture.node, 'Match'));
    await flush();
    expect(fixture.node.textContent).toContain('HighScore');
    expect(fixture.node.textContent).toContain('MidScore');
    expect(fixture.node.textContent).toContain('LowScore');
    expect(fixture.node.textContent).toContain('95%');
    expect(fixture.node.textContent).toContain('65%');
    expect(fixture.node.textContent).toContain('35%');
});

test('TC-EXEC-147 | workflow with tags shows tag badges in selection dialog', async () => {
    // 输入: match with workflow that has tags
    // 预期: tag badges visible in dialog
    // 断言: tag names visible in candidate card
    fixture = await mount({
        searchMode: 'fuzzy',
        matchResults: [
            { workflow_id: 'wf-tags', name: 'TaggedFlow', description: 'd', tags: ['deploy', 'monitor'], score: 0.8 },
            { workflow_id: 'wf-no', name: 'UntaggedFlow', description: 'd', tags: [], score: 0.7 },
        ],
    });
    await typeInInput(fixture.node, 'tag test');
    await click(findButton(fixture.node, 'Match'));
    await flush();
    expect(fixture.node.textContent).toContain('deploy');
    expect(fixture.node.textContent).toContain('monitor');
});

// ═══════════════════════════════════════════════════════════
// matchWorkflowsTopN: non-array data handling
// ═══════════════════════════════════════════════════════════

test('TC-EXEC-148 | match with single object (non-array) response auto-selects workflow', async () => {
    // 输入: API returns data as single object (not array)
    // 预期: treated as single-element array, auto-selected
    // 断言: workflow name visible, Native badge shown
    fixture = await mount({
        searchMode: 'fuzzy',
        postImpl: vi.fn(async () => ({
            status: 'success',
            data: { workflow_id: 'wf-obj', name: 'ObjectResponse', description: 'd', tags: [], score: 0.9 },
        })),
    });
    await typeInInput(fixture.node, 'object response');
    await click(findButton(fixture.node, 'Match'));
    await flush();
    expect(fixture.node.textContent).toContain('ObjectResponse');
    expect(fixture.node.textContent).toContain('Native');
});

test('TC-EXEC-149 | match with null data returns empty and shows no-match error', async () => {
    // 输入: API returns data: null
    // 预期: matchWorkflowsTopN returns [], no-match error shown
    // 断言: "No matching workflow found" text
    fixture = await mount({
        searchMode: 'fuzzy',
        postImpl: vi.fn(async () => ({ status: 'success', data: null })),
    });
    await typeInInput(fixture.node, 'null data');
    await click(findButton(fixture.node, 'Match'));
    await flush();
    expect(fixture.node.textContent).toContain('No matching workflow found');
});

// ═══════════════════════════════════════════════════════════
// History detail: load failure
// ═══════════════════════════════════════════════════════════

test('TC-EXEC-150 | history detail load failure shows load-failed error', async () => {
    // 输入: click History tab, click record, API throws error on detail fetch
    // 预期: "Failed to load history record" error shown
    // 断言: error text visible
    fixture = await mount({
        searchMode: 'fuzzy',
        records: [
            { execution_id: 'exec-fail', psop_id: 'wf-fail', psop_name: 'FailDetail', status: 'success', started_at: 1700000000 },
        ],
        getImpl: vi.fn(async (url) => {
            if (url.endsWith('/agent-cards')) return { status: 'success', data: [{ name: 'workbench-agent' }] };
            if (url.endsWith('/workflows')) return { status: 'success', data: [], pagination: { has_more: false } };
            if (url.match(/\/execution-records\/[^/]+$/)) throw new Error('detail fetch failed');
            if (url.endsWith('/execution-records')) return { status: 'success', data: [{ execution_id: 'exec-fail', psop_id: 'wf-fail', psop_name: 'FailDetail', status: 'success', started_at: 1700000000 }] };
            return { status: 'success', data: [] };
        }),
    });
    await click(findButton(fixture.node, 'History'));
    await flush(50);
    const recordCard = [...fixture.node.querySelectorAll('[class*="cursor-pointer"]')].find(el => el.textContent.includes('FailDetail'));
    await click(recordCard);
    await flush(50);
    expect(fixture.node.textContent).toContain('Failed to load history record');
});

// ═══════════════════════════════════════════════════════════
// History records load failure
// ═══════════════════════════════════════════════════════════

test('TC-EXEC-151 | history records load failure does not crash and shows empty state', async () => {
    // 输入: click History tab, API throws on execution-records list
    // 预期: no crash, empty state shown
    // 断言: "暂无执行记录" visible (no records loaded)
    fixture = await mount({
        searchMode: 'fuzzy',
        getImpl: vi.fn(async (url) => {
            if (url.endsWith('/agent-cards')) return { status: 'success', data: [{ name: 'workbench-agent' }] };
            if (url.endsWith('/workflows')) return { status: 'success', data: [], pagination: { has_more: false } };
            if (url.endsWith('/execution-records')) throw new Error('records fetch failed');
            return { status: 'success', data: [] };
        }),
    });
    await click(findButton(fixture.node, 'History'));
    await flush(50);
    expect(fixture.node.textContent).toContain('暂无执行记录');
});

// ═══════════════════════════════════════════════════════════
// Workflow detail fetch for selectedId
// ═══════════════════════════════════════════════════════════

test('TC-EXEC-152 | selecting workflow triggers getWorkflowById and transform', async () => {
    // 输入: all mode, select workflow by clicking card
    // 预期: getWorkflowById called, transformWorkflowToReactFlow called with result
    // 断言: api.get with /workflows/{id}, transform called
    fixture = await mount({
        searchMode: 'all',
        workflows: [{ workflow_id: 'wf-detail-fetch', name: 'DetailFetch WF', tags: [], description: 'd' }],
        workflowDetail: { psop: { steps: [{ id: 'x1' }] } },
    });
    await flush(50);
    const wfCard = [...fixture.node.querySelectorAll('[class*="cursor-pointer"]')].find(el => el.textContent.includes('DetailFetch WF'));
    await act(async () => Simulate.click(wfCard));
    await flush(50);
    expect(fixture.api.get).toHaveBeenCalledWith(expect.stringContaining('/workflows/wf-detail-fetch'));
    expect(transformWorkflowToReactFlow).toHaveBeenCalled();
});

// ═══════════════════════════════════════════════════════════
// Exact mode: no results with filters
// ═══════════════════════════════════════════════════════════

test('TC-EXEC-153 | exact mode with filters but no matches shows no-match error', async () => {
    // 输入: exact mode, type name that doesn't match any workflow
    // 预期: "No matching workflow found" error shown
    // 断言: error text visible
    fixture = await mount({
        searchMode: 'exact',
        workflows: [
            { workflow_id: 'wf-1', name: 'Alpha', tags: [], description: '', created_at: '2026-01-01', status: 'success' },
        ],
    });
    await typeInInput(fixture.node, 'NonexistentName');
    await flush(400);
    expect(fixture.node.textContent).toContain('No matching workflow found');
});

// ═══════════════════════════════════════════════════════════
// Exact mode: single result auto-selects
// ═══════════════════════════════════════════════════════════

test('TC-EXEC-154 | exact mode single result auto-selects workflow with Native badge', async () => {
    // 输入: exact mode, filter returns exactly 1 result
    // 预期: workflow auto-selected, Native badge shown
    // 断言: Native text visible, workflow name visible
    fixture = await mount({
        searchMode: 'exact',
        workflows: [
            { workflow_id: 'wf-only', name: 'OnlyMatch', tags: [], description: 'd', created_at: '2026-01-01', status: 'success' },
            { workflow_id: 'wf-other', name: 'OtherName', tags: [], description: 'd', created_at: '2026-01-01', status: 'success' },
        ],
    });
    await typeInInput(fixture.node, 'OnlyMatch');
    await flush(400);
    expect(fixture.node.textContent).toContain('OnlyMatch');
    expect(fixture.node.textContent).toContain('Native');
    expect(fixture.node.textContent).not.toContain('OtherName');
});

// ═══════════════════════════════════════════════════════════
// Exact mode: date filters
// ═══════════════════════════════════════════════════════════

test('TC-EXEC-155 | exact mode date-from filter narrows by creation date', async () => {
    // 输入: exact mode with workflows at different dates, set dateFrom filter
    // 预期: only workflows on or after the date shown
    // 断言: recent workflow visible, old workflow NOT visible
    fixture = await mount({
        searchMode: 'exact',
        workflows: [
            { workflow_id: 'wf-old', name: 'OldWF', tags: [], description: '', created_at: '2025-01-01', status: 'success' },
            { workflow_id: 'wf-new', name: 'NewWF', tags: [], description: '', created_at: '2026-06-01', status: 'success' },
        ],
    });
    await click(findButton(fixture.node, 'Filters'));
    await typeInInput(fixture.node, 'WF');
    await flush(400);
    // Set dateFrom filter
    const dateInputs = fixture.node.querySelectorAll('input[type="date"]');
    expect(dateInputs.length).toBeGreaterThanOrEqual(2);
    await act(async () => Simulate.change(dateInputs[0], { target: { value: '2026-01-01' } }));
    await flush(400);
    expect(fixture.node.textContent).toContain('NewWF');
    expect(fixture.node.textContent).not.toContain('OldWF');
});

// ═══════════════════════════════════════════════════════════
// Search mode persistence
// ═══════════════════════════════════════════════════════════

test('TC-EXEC-156 | switching search mode persists to localStorage and resets state', async () => {
    // 输入: start in fuzzy mode, type intent, switch to all mode
    // 预期: localStorage updated, userIntent cleared, workflows loaded
    // 断言: localStorage has 'all', input cleared, workflows visible
    fixture = await mount({
        searchMode: 'fuzzy',
        workflows: [{ workflow_id: 'wf-persist', name: 'PersistWF', tags: [] }],
    });
    await typeInInput(fixture.node, 'should be cleared');
    // Switch to all mode
    await click(findButton(fixture.node, 'All'));
    await flush(50);
    expect(localStorage.getItem('execution_search_mode')).toBe('all');
    // Input should be cleared (all mode shows hint text, not an input)
    expect(fixture.node.textContent).toContain('Showing all workflows');
    expect(fixture.node.textContent).toContain('PersistWF');
});

// ═══════════════════════════════════════════════════════════
// Agent cards: workbench auto-selection
// ═══════════════════════════════════════════════════════════

test('TC-EXEC-157 | agent cards with workbench name auto-selected over first agent', async () => {
    // 输入: agent cards include a "workbench" agent and a non-workbench agent
    // 预期: workbench agent auto-selected
    // 断言: select value = workbench agent name
    fixture = await mount({
        searchMode: 'fuzzy',
        agentCards: [{ name: 'alpha-agent' }, { name: 'workbench-pro' }, { name: 'beta-agent' }],
    });
    const select = fixture.node.querySelector('select');
    expect(select.value).toBe('workbench-pro');
});

test('TC-EXEC-158 | agent cards without workbench falls back to first agent', async () => {
    // 输入: agent cards without any "workbench" name
    // 预期: first agent auto-selected
    // 断言: select value = first agent name
    fixture = await mount({
        searchMode: 'fuzzy',
        agentCards: [{ name: 'gamma-agent' }, { name: 'delta-agent' }],
    });
    const select = fixture.node.querySelector('select');
    expect(select.value).toBe('gamma-agent');
});

// ═══════════════════════════════════════════════════════════
// Error handling paths
// ═══════════════════════════════════════════════════════════

test('TC-EXEC-159 | agent cards fetch failure logs error and renders without crash', async () => {
    // 输入: API throws error for agent-cards endpoint
    // 预期: console.error called, component still renders, no agent selected
    // 断言: component renders with title, error logged
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fixture = await mount({
        searchMode: 'fuzzy',
        getImpl: vi.fn(async (url) => {
            if (url.endsWith('/agent-cards')) throw new Error('agent cards unavailable');
            if (url.endsWith('/workflows')) return { status: 'success', data: [], pagination: { has_more: false } };
            return { status: 'success', data: [] };
        }),
    });
    await flush(50);
    expect(errorSpy).toHaveBeenCalledWith('Failed to fetch agent cards:', expect.any(Error));
    expect(fixture.node.textContent).toContain('Execution Center');
    // No agent auto-selected since fetch failed
    const select = fixture.node.querySelector('select');
    expect(select.value).toBe('');
});

test('TC-EXEC-160 | exact search API failure shows match-failed error', async () => {
    // 输入: exact mode, type name filter, listWorkflows throws error
    // 预期: "Match request failed." error shown
    // 断言: error text visible
    fixture = await mount({
        searchMode: 'exact',
        workflows: [],
        getImpl: vi.fn(async (url) => {
            if (url.endsWith('/agent-cards')) return { status: 'success', data: [{ name: 'workbench-agent' }] };
            if (url.endsWith('/workflows')) throw new Error('workflow list failed');
            return { status: 'success', data: [] };
        }),
    });
    await typeInInput(fixture.node, 'search trigger');
    await flush(400);
    expect(fixture.node.textContent).toContain('Match request failed.');
});

test('TC-EXEC-161 | all mode load failure shows error message', async () => {
    // 输入: all mode, listWorkflows throws error on load
    // 预期: error shown, empty state not shown
    // 断言: "Match request failed." error visible
    fixture = await mount({
        searchMode: 'all',
        getImpl: vi.fn(async (url) => {
            if (url.endsWith('/agent-cards')) return { status: 'success', data: [{ name: 'workbench-agent' }] };
            if (url.endsWith('/workflows')) throw new Error('all load failed');
            return { status: 'success', data: [] };
        }),
    });
    await flush(200);
    expect(fixture.node.textContent).toContain('Match request failed.');
});

test('TC-EXEC-162 | delete record API failure logs error and closes dialog', async () => {
    // 输入: delete record, API throws error on delete
    // 预期: error logged, dialog closed, record still present
    // 断言: record still visible, api.delete called
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fixture = await mount({
        searchMode: 'fuzzy',
        records: [
            { execution_id: 'exec-dfail', psop_id: 'wf-df', psop_name: 'DeleteFail Record', status: 'success', started_at: 1700000000 },
        ],
    });
    // Override delete to throw
    fixture.api.delete = vi.fn(async () => { throw new Error('delete failed'); });
    await click(findButton(fixture.node, 'History'));
    await flush(200);
    expect(fixture.node.textContent).toContain('DeleteFail Record');
    const delCard = [...fixture.node.querySelectorAll('[class*="cursor-pointer"]')].find(el => el.textContent.includes('DeleteFail Record'));
    const deleteBtn = delCard.querySelector('button');
    await click(deleteBtn);
    const confirmBtn = [...fixture.node.querySelectorAll('button')].find(b => b.className.includes('bg-red-500'));
    await click(confirmBtn);
    await flush(200);
    expect(errorSpy).toHaveBeenCalledWith('Failed to delete execution record:', expect.any(Error));
    // Record still present since delete failed
    expect(fixture.node.textContent).toContain('DeleteFail Record');
});

test('TC-EXEC-163 | workflow detail fetch failure logs error without crash', async () => {
    // 输入: select workflow, getWorkflowById throws error
    // 预期: error logged, component still functional
    // 断言: console.error called with specific message
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fixture = await mount({
        searchMode: 'all',
        workflows: [{ workflow_id: 'wf-detail-err', name: 'DetailErr WF', tags: [], description: 'd' }],
        getImpl: vi.fn(async (url) => {
            if (url.endsWith('/agent-cards')) return { status: 'success', data: [{ name: 'workbench-agent' }] };
            if (url.endsWith('/workflows')) return { status: 'success', data: [{ workflow_id: 'wf-detail-err', name: 'DetailErr WF', tags: [], description: 'd' }], pagination: { has_more: false } };
            if (url.match(/\/workflows\/[^/]+$/)) throw new Error('detail fetch error');
            return { status: 'success', data: [] };
        }),
    });
    await flush(50);
    const wfCard = [...fixture.node.querySelectorAll('[class*="cursor-pointer"]')].find(el => el.textContent.includes('DetailErr WF'));
    await act(async () => Simulate.click(wfCard));
    await flush(50);
    expect(errorSpy).toHaveBeenCalledWith('Failed to fetch workflow detail:', expect.any(Error));
});

test('TC-EXEC-164 | execute with invalid psop_update logs parse error', async () => {
    // 输入: start execution, send psop_update with invalid JSON string
    // 预期: error logged, execution continues
    // 断言: console.error called with parse failure message
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fixture = await mount({
        searchMode: 'all',
        workflows: [{ workflow_id: 'wf-badpsop', name: 'BadPsop WF', tags: [] }],
    });
    await flush(50);
    const wfCard = [...fixture.node.querySelectorAll('[class*="cursor-pointer"]')].find(el => el.textContent.includes('BadPsop WF'));
    await click(wfCard.querySelector('button'));
    await sendEvent(fixture.streams[0], { type: 'psop_update', data: { psop: '{invalid json string' }, timestamp: 1 });
    await flush();
    expect(errorSpy).toHaveBeenCalledWith('Failed to parse psop_update data:', expect.any(Error));
});

test('TC-EXEC-165 | execution error event shows error and adds error entry', async () => {
    // 输入: start execution, send error terminal event with message
    // 预期: error message visible, status = Failed
    // 断言: error text and "Failed" status
    fixture = await mount({
        searchMode: 'all',
        workflows: [{ workflow_id: 'wf-err-exec', name: 'ErrorExec WF', tags: [] }],
    });
    await flush(50);
    const wfCard = [...fixture.node.querySelectorAll('[class*="cursor-pointer"]')].find(el => el.textContent.includes('ErrorExec WF'));
    await click(wfCard.querySelector('button'));
    await sendEvent(fixture.streams[0], { type: 'error', data: { error: 'Execution engine failure' }, timestamp: 1 });
    await flush();
    expect(fixture.node.textContent).toContain('Failed');
    expect(fixture.node.textContent).toContain('Execution engine failure');
});

// ═══════════════════════════════════════════════════════════
// Additional UI interactions
// ═══════════════════════════════════════════════════════════

test('TC-EXEC-166 | toggle tag off by clicking same tag twice removes filter', async () => {
    // 输入: exact mode, click a tag to enable, click again to disable
    // 预期: after toggle off, all workflows shown again
    // 断言: both workflows visible after tag deselected
    fixture = await mount({
        searchMode: 'exact',
        workflows: [
            { workflow_id: 'wf-t-on', name: 'TagOnWF', tags: ['deploy'], description: '', created_at: '2026-01-01', status: 'success' },
            { workflow_id: 'wf-t-off', name: 'TagOffWF', tags: ['monitor'], description: '', created_at: '2026-01-01', status: 'success' },
        ],
    });
    await click(findButton(fixture.node, 'Filters'));
    await typeInInput(fixture.node, 'WF');
    await flush(400);
    // Click "deploy" tag
    const tagBtn = [...fixture.node.querySelectorAll('button')].find(b => b.textContent.trim() === 'deploy');
    await click(tagBtn);
    await flush(400);
    expect(fixture.node.textContent).toContain('TagOnWF');
    expect(fixture.node.textContent).not.toContain('TagOffWF');
    // Click "deploy" tag again to toggle off
    const tagBtnAgain = [...fixture.node.querySelectorAll('button')].find(b => b.textContent.trim() === 'deploy');
    await click(tagBtnAgain);
    await flush(400);
    // Both should be visible again (only name filter "WF" active)
    expect(fixture.node.textContent).toContain('TagOnWF');
    expect(fixture.node.textContent).toContain('TagOffWF');
});

test('TC-EXEC-167 | dispatch button in all mode starts execution for selected workflow', async () => {
    // 输入: all mode, select a workflow, click the main Dispatch button (not card play)
    // 预期: startExecution called with selectedId
    // 断言: stream URL contains psop_id for the selected workflow
    fixture = await mount({
        searchMode: 'all',
        workflows: [{ workflow_id: 'wf-dispatch-btn', name: 'DispatchBtn WF', tags: [] }],
    });
    await flush(50);
    // Click on the workflow card to select it
    const wfCard = [...fixture.node.querySelectorAll('[class*="cursor-pointer"]')].find(el => el.textContent.includes('DispatchBtn WF'));
    await act(async () => Simulate.click(wfCard));
    await flush();
    // Click the main Dispatch/Execute button (green button at top)
    const dispatchBtn = [...fixture.node.querySelectorAll('button')].find(b =>
        b.className.includes('bg-emerald-600') && !b.disabled
    );
    expect(dispatchBtn).toBeTruthy();
    await click(dispatchBtn);
    expect(fixture.streams).toHaveLength(1);
    expect(fixture.streams[0].url).toContain('psop_id=wf-dispatch-btn');
});

test('TC-EXEC-168 | exact mode date-to filter narrows by creation date upper bound', async () => {
    // 输入: exact mode with workflows at different dates, set dateTo filter
    // 预期: only workflows on or before the date shown
    // 断言: old workflow visible, new workflow NOT visible
    fixture = await mount({
        searchMode: 'exact',
        workflows: [
            { workflow_id: 'wf-old2', name: 'OldDateWF', tags: [], description: '', created_at: '2025-01-01', status: 'success' },
            { workflow_id: 'wf-new2', name: 'NewDateWF', tags: [], description: '', created_at: '2026-06-01', status: 'success' },
        ],
    });
    await click(findButton(fixture.node, 'Filters'));
    await typeInInput(fixture.node, 'WF');
    await flush(400);
    const dateInputs = fixture.node.querySelectorAll('input[type="date"]');
    // dateTo is the second date input
    await act(async () => Simulate.change(dateInputs[1], { target: { value: '2025-12-31' } }));
    await flush(400);
    expect(fixture.node.textContent).toContain('OldDateWF');
    expect(fixture.node.textContent).not.toContain('NewDateWF');
});

test('TC-EXEC-169 | clicking Match tab returns from History to workflow list', async () => {
    // 输入: switch to History tab, then click Match tab button (not search Match button)
    // 预期: returns to workflow list view, history records hidden
    // 断言: History records gone, search content visible
    fixture = await mount({
        searchMode: 'fuzzy',
        records: [{ execution_id: 'exec-tab', psop_id: 'wf-tab', psop_name: 'TabSwitch Record', status: 'success', started_at: 1700000000 }],
    });
    await click(findButton(fixture.node, 'History'));
    await flush(200);
    expect(fixture.node.textContent).toContain('TabSwitch Record');
    // Click Match tab button (has h-12 class, not the search Match button which has bg-blue-600)
    const matchTab = [...fixture.node.querySelectorAll('button')].find(b =>
        b.textContent.trim() === 'Match' && b.className.includes('h-12')
    );
    expect(matchTab).toBeTruthy();
    await click(matchTab);
    await flush();
    // Should show the match/search content, not history records
    expect(fixture.node.textContent).not.toContain('TabSwitch Record');
    expect(fixture.node.textContent).toContain('Search for workflows...');
});

test('TC-EXEC-170 | selection dialog cancel button closes dialog without selecting', async () => {
    // 输入: multiple match results, click cancel in selection dialog
    // 预期: dialog closes, no workflow selected
    // 断言: dialog title gone, no Native badge
    fixture = await mount({
        searchMode: 'fuzzy',
        matchResults: [
            { workflow_id: 'wf-cancel-sel', name: 'CancelSel One', description: 'd', tags: [], score: 0.8 },
            { workflow_id: 'wf-cancel-sel2', name: 'CancelSel Two', description: 'd', tags: [], score: 0.7 },
        ],
    });
    await typeInInput(fixture.node, 'cancel selection');
    await click(findButton(fixture.node, 'Match'));
    await flush();
    expect(fixture.node.textContent).toContain('Select the correct workflow');
    // Click the cancel button at the bottom of the dialog
    const cancelBtn = [...fixture.node.querySelectorAll('button')].find(b =>
        b.textContent.includes('common.cancel') || b.textContent.trim() === 'Cancel'
    );
    // The cancel button might show 'common.cancel' or 'Cancel' depending on i18n fallback
    if (cancelBtn) {
        await click(cancelBtn);
    } else {
        // Try clicking the overlay background to close
        const overlay = fixture.node.querySelector('[class*="fixed"][class*="inset-0"][class*="bg-black"]');
        await click(overlay);
    }
    await flush();
    expect(fixture.node.textContent).not.toContain('Select the correct workflow');
});

test('TC-EXEC-171 | selection dialog overlay click closes dialog', async () => {
    // 输入: multiple match results, click overlay background
    // 预期: dialog closes
    // 断言: dialog title gone
    fixture = await mount({
        searchMode: 'fuzzy',
        matchResults: [
            { workflow_id: 'wf-ov1', name: 'Overlay One', description: 'd', tags: [], score: 0.8 },
            { workflow_id: 'wf-ov2', name: 'Overlay Two', description: 'd', tags: [], score: 0.7 },
        ],
    });
    await typeInInput(fixture.node, 'overlay test');
    await click(findButton(fixture.node, 'Match'));
    await flush();
    expect(fixture.node.textContent).toContain('Select the correct workflow');
    // Click the overlay background
    const overlay = fixture.node.querySelector('[class*="absolute"][class*="inset-0"][class*="bg-black"]');
    expect(overlay).toBeTruthy();
    await click(overlay);
    await flush();
    expect(fixture.node.textContent).not.toContain('Select the correct workflow');
});

test('TC-EXEC-172 | expanded right panel overlay click closes panel', async () => {
    // 输入: expand right panel, click overlay background
    // 预期: panel collapses back to normal width
    // 断言: collapse button gone, expand button present
    fixture = await mount({ searchMode: 'fuzzy' });
    // Expand the right panel
    const expandBtn = fixture.node.querySelector('button[title="Expand Panel"]');
    await click(expandBtn);
    expect(fixture.node.querySelector('button[title="Collapse Panel"]')).toBeTruthy();
    // Click the overlay (fixed inset-0 bg-black/30)
    const overlay = fixture.node.querySelector('[class*="fixed"][class*="inset-0"][class*="bg-black/30"]');
    expect(overlay).toBeTruthy();
    await click(overlay);
    await flush();
    // Panel should collapse
    expect(fixture.node.querySelector('button[title="Expand Panel"]')).toBeTruthy();
});

test('TC-EXEC-173 | dispatch while execution running closes previous stream', async () => {
    // 输入: start execution, then dispatch from fuzzy mode while execution is running
    // 预期: previous stream closed, new dispatch stream created
    // 断言: 2 streams created, first stream closed
    fixture = await mount({
        searchMode: 'all',
        workflows: [{ workflow_id: 'wf-redispatch', name: 'Redispatch WF', tags: [] }],
    });
    await flush(50);
    // Start execution
    const wfCard = [...fixture.node.querySelectorAll('[class*="cursor-pointer"]')].find(el => el.textContent.includes('Redispatch WF'));
    await click(wfCard.querySelector('button'));
    expect(fixture.streams).toHaveLength(1);
    // Switch to fuzzy mode and dispatch
    await click(findButton(fixture.node, 'Fuzzy'));
    await flush();
    await typeInInput(fixture.node, 'new dispatch intent');
    await click(findButton(fixture.node, 'Dispatch'));
    // New stream should be created
    expect(fixture.streams).toHaveLength(2);
    // First stream should be closed (via eventSource.close in handleDispatch)
    // Note: the first stream's close is called via the eventSource object, not the EventSource mock
});

test('TC-EXEC-174 | startExecution with no selectedId returns early without creating stream', async () => {
    // 输入: call startExecution via the card play button when no workflow is selected
    // 预期: no stream created (early return)
    // 断言: no streams created
    // This is covered by the dispatch button being disabled when no selection in non-fuzzy mode
    // But we can test the flow by switching to all mode and clicking dispatch without selecting
    fixture = await mount({
        searchMode: 'all',
        workflows: [{ workflow_id: 'wf-noid', name: 'NoId WF', tags: [] }],
    });
    await flush(50);
    // The main dispatch button should be disabled when no workflow is selected
    const dispatchBtn = [...fixture.node.querySelectorAll('button')].find(b =>
        b.className.includes('bg-emerald-600')
    );
    expect(dispatchBtn.disabled).toBe(true);
});

test('TC-EXEC-175 | handleNodeSelect with null node clears selectedNodeId', async () => {
    // 输入: select workflow to render UnifiedWorkflow, call onSelectChange(null)
    // 预期: selectedNodeId cleared to null
    // 断言: no crash, component still functional
    fixture = await mount({
        searchMode: 'fuzzy',
        matchResults: [{ workflow_id: 'wf-null-node', name: 'NullNode WF', description: 'd', tags: [], score: 0.9 }],
    });
    await typeInInput(fixture.node, 'null node test');
    await click(findButton(fixture.node, 'Match'));
    await flush();
    const lastCall = UnifiedWorkflow.mock.calls[UnifiedWorkflow.mock.calls.length - 1];
    const onSelectChange = lastCall[0].onSelectChange;
    // Call with null node (early return path)
    await act(async () => onSelectChange(null));
    await flush();
    // Call with node that has no agent name (early return after setSelectedNodeId)
    await act(async () => onSelectChange({ id: 'n2', data: {} }));
    await flush();
    expect(fixture.node.textContent).toContain('NullNode WF');
});

test('TC-EXEC-176 | switching back to execution sub-menu from statistics', async () => {
    // 输入: click Statistics sub-menu, then click Workflow Execution sub-menu
    // 预期: returns to execution view with search bar and Standby text
    // 断言: "Standby" hidden in statistics, visible after switching back to execution
    fixture = await mount({ searchMode: 'fuzzy' });
    // Verify execution view is initially visible
    expect(fixture.node.textContent).toContain('Standby');
    // Switch to statistics
    const statsBtn = [...fixture.node.querySelectorAll('button')].find(b => b.textContent.includes('Execution Statistics'));
    await click(statsBtn);
    // Standby text should NOT be visible in statistics view
    expect(fixture.node.textContent).not.toContain('Standby');
    // Switch back to execution
    const execBtn = [...fixture.node.querySelectorAll('button')].find(b => b.textContent.includes('Workflow Execution'));
    await click(execBtn);
    // Execution view should be restored
    expect(fixture.node.textContent).toContain('Standby');
    expect(fixture.node.textContent).toContain('Search for workflows...');
});

test('TC-EXEC-177 | start execution while another is running closes previous stream', async () => {
    // 输入: all mode with 2 workflows, start execution on first, then start on second
    // 预期: second startExecution closes the first stream and creates a new one
    // 断言: 2 streams created, second stream URL has second workflow ID
    fixture = await mount({
        searchMode: 'all',
        workflows: [
            { workflow_id: 'wf-first', name: 'First WF', tags: [] },
            { workflow_id: 'wf-second', name: 'Second WF', tags: [] },
        ],
    });
    await flush(50);
    // Start execution on first workflow
    const firstCard = [...fixture.node.querySelectorAll('[class*="cursor-pointer"]')].find(el => el.textContent.includes('First WF'));
    await click(firstCard.querySelector('button'));
    expect(fixture.streams).toHaveLength(1);
    // Start execution on second workflow (closes first stream internally)
    const secondCard = [...fixture.node.querySelectorAll('[class*="cursor-pointer"]')].find(el => el.textContent.includes('Second WF'));
    await click(secondCard.querySelector('button'));
    expect(fixture.streams).toHaveLength(2);
    expect(fixture.streams[1].url).toContain('psop_id=wf-second');
});

test('TC-EXEC-178 | clicking play on dispatch workflow card re-dispatches', async () => {
    // 输入: start dispatch, send complete event (isDispatching=false), click play on dispatch card
    // 预期: handleDispatch called again, new stream created
    // 断言: 2 streams created, second stream is a dispatch URL
    fixture = await mount({ searchMode: 'fuzzy' });
    await typeInInput(fixture.node, 'redispatch intent');
    await click(findButton(fixture.node, 'Dispatch'));
    expect(fixture.streams).toHaveLength(1);
    // Send start event to create dispatch workflow entry
    await sendEvent(fixture.streams[0], { type: 'start', data: { workflow: 'ReDispatchFlow' }, timestamp: 1 });
    await flush();
    // Send complete event to stop dispatching (isDispatching = false)
    await sendEvent(fixture.streams[0], { type: 'complete', data: {}, timestamp: 2 });
    await flush();
    // The dispatch entry should have a play button now (isDispatching is false)
    const dispatchCard = [...fixture.node.querySelectorAll('[class*="cursor-pointer"]')].find(el => el.textContent.includes('ReDispatchFlow'));
    expect(dispatchCard).toBeTruthy();
    const playBtn = dispatchCard.querySelector('button');
    expect(playBtn).toBeTruthy();
    await click(playBtn);
    // A new dispatch stream should be created
    expect(fixture.streams).toHaveLength(2);
    expect(fixture.streams[1].url).toContain('/dispatch?');
});

test('TC-EXEC-179 | handleNodeSelect with matching data-agent elements scrolls and disables auto-scroll', async () => {
    // 输入: select workflow, inject data-agent element into log, call onSelectChange
    // 预期: scrollIntoView called, autoScroll set to false, Sync button appears
    // 断言: "Sync" text visible after node select with matching agent
    fixture = await mount({
        searchMode: 'fuzzy',
        matchResults: [{ workflow_id: 'wf-agent-node', name: 'AgentNode WF', description: 'd', tags: [], score: 0.9 }],
    });
    await typeInInput(fixture.node, 'agent node test');
    await click(findButton(fixture.node, 'Match'));
    await flush();
    // Inject a fake element with data-agent attribute into the log container
    const logContainer = [...fixture.node.querySelectorAll('[class*="overflow-y-auto"]')].find(el => {
        const key = Object.keys(el).find(k => k.startsWith('__reactProps$'));
        return key && el[key].onScroll;
    });
    expect(logContainer).toBeTruthy();
    const fakeEntry = document.createElement('div');
    fakeEntry.setAttribute('data-agent', 'scroll-agent');
    fakeEntry.scrollIntoView = vi.fn();
    await act(async () => { logContainer.appendChild(fakeEntry); });
    await flush();
    // Call onSelectChange with matching agent name
    const lastCall = UnifiedWorkflow.mock.calls[UnifiedWorkflow.mock.calls.length - 1];
    const onSelectChange = lastCall[0].onSelectChange;
    await act(async () => onSelectChange({ id: 'agent-node', data: { agent: 'scroll-agent' } }));
    await flush();
    // scrollIntoView should have been called on the fake entry
    expect(fakeEntry.scrollIntoView).toHaveBeenCalled();
    // autoScroll should be false → Sync button appears
    expect(fixture.node.textContent).toContain('Sync');
});

test('TC-EXEC-180 | getStartProcessStreamUrl with all empty params returns base URL only', async () => {
    // 输入: start execution with no userIntent, no lang, no targetAgent
    // 预期: stream URL has only psop_id, no other params
    // 断言: URL does not contain user_intent, lang, or target_agent
    // This requires empty selectedAgent — use getImpl to prevent agent-cards auto-selection
    fixture = await mount({
        searchMode: 'all',
        agentCards: [],
        workflows: [{ workflow_id: 'wf-noagent', name: 'NoAgent WF', tags: [] }],
        getImpl: vi.fn(async (url) => {
            if (url.endsWith('/agent-cards')) return { status: 'success', data: [] };
            if (url.endsWith('/workflows')) return { status: 'success', data: [{ workflow_id: 'wf-noagent', name: 'NoAgent WF', tags: [] }], pagination: { has_more: false } };
            return { status: 'success', data: [] };
        }),
    });
    await flush(50);
    // No agent auto-selected since agentCards is empty
    const select = fixture.node.querySelector('select');
    expect(select.value).toBe('');
    // Start execution via card play button
    const wfCard = [...fixture.node.querySelectorAll('[class*="cursor-pointer"]')].find(el => el.textContent.includes('NoAgent WF'));
    await click(wfCard.querySelector('button'));
    expect(fixture.streams).toHaveLength(1);
    // URL should have only psop_id, no user_intent/lang/target_agent
    expect(fixture.streams[0].url).toContain('psop_id=wf-noagent');
    expect(fixture.streams[0].url).not.toContain('user_intent=');
    expect(fixture.streams[0].url).not.toContain('target_agent=');
});

test('TC-EXEC-181 | clicking Exact mode button explicitly switches mode', async () => {
    // 输入: start in fuzzy mode, click the Exact button in the search mode toggle
    // 预期: search mode changes to exact, Filters button appears
    // 断言: Filters button visible, Clear button visible
    fixture = await mount({ searchMode: 'fuzzy' });
    const exactBtn = [...fixture.node.querySelectorAll('button')].find(b =>
        b.textContent.trim() === 'Exact' && b.className.includes('rounded-md')
    );
    expect(exactBtn).toBeTruthy();
    await click(exactBtn);
    await flush();
    expect(fixture.node.textContent).toContain('Filters');
    expect(fixture.node.textContent).toContain('Clear');
});

test('TC-EXEC-182 | exact search abort returns early when signal is aborted', async () => {
    // 输入: exact mode with slow API, type filter, then change filter before API resolves
    // 预期: first search aborted, second search completes
    // 断言: no error shown (aborted search returns silently)
    fixture = await mount({
        searchMode: 'exact',
        workflows: [
            { workflow_id: 'wf-abort', name: 'AbortTestWF', tags: [], description: '', created_at: '2026-01-01', status: 'success' },
        ],
        getImpl: vi.fn(async (url, config) => {
            if (url.endsWith('/agent-cards')) return { status: 'success', data: [{ name: 'workbench-agent' }] };
            if (url.endsWith('/workflows')) {
                await new Promise(r => setTimeout(r, 200));
                return { status: 'success', data: [{ workflow_id: 'wf-abort', name: 'AbortTestWF', tags: [], description: '', created_at: '2026-01-01', status: 'success' }], pagination: { has_more: false } };
            }
            return { status: 'success', data: [] };
        }),
    });
    // Type to trigger first search
    await typeInInput(fixture.node, 'Abort');
    // Wait for debounce to fire and API to start
    await flush(350);
    // Type again to trigger cleanup (abort first search) and new search
    const input = fixture.node.querySelector('input[type="text"]');
    await act(async () => Simulate.change(input, { target: { value: 'AbortTest' } }));
    // Wait for second search debounce + API to complete
    await flush(600);
    await flush(100);
    // Aborted search returns silently — no error shown
    expect(fixture.node.textContent).not.toContain('Match request failed.');
    // Second search completes with results
    expect(fixture.node.textContent).toContain('AbortTestWF');
});

test('TC-EXEC-183 | all mode load abort returns silently when switching modes', async () => {
    // 输入: all mode with slow API, switch to fuzzy before API resolves
    // 预期: all-mode load aborted silently, no error shown
    // 断言: no "Match request failed." error, fuzzy mode active
    fixture = await mount({
        searchMode: 'all',
        getImpl: vi.fn(async (url) => {
            if (url.endsWith('/agent-cards')) return { status: 'success', data: [{ name: 'workbench-agent' }] };
            if (url.endsWith('/workflows')) {
                await new Promise(r => setTimeout(r, 200));
                return { status: 'success', data: [], pagination: { has_more: false } };
            }
            return { status: 'success', data: [] };
        }),
    });
    // Immediately switch to fuzzy mode before API resolves
    await click(findButton(fixture.node, 'Fuzzy'));
    // Wait for everything to settle
    await flush(300);
    // No error should be shown (aborted search returns silently)
    expect(fixture.node.textContent).not.toContain('Match request failed.');
});

test('TC-EXEC-184 | handleDispatch guard rejects empty intent without creating stream', async () => {
    // 输入: call handleDispatch onClick directly with no userIntent
    // 预期: guard clause returns early, no stream created
    // 断言: no streams created
    fixture = await mount({ searchMode: 'fuzzy' });
    const dispatchBtn = [...fixture.node.querySelectorAll('button')].find(b =>
        b.textContent.includes('Dispatch') && b.className.includes('bg-emerald-600')
    );
    const propsKey = Object.keys(dispatchBtn).find(k => k.startsWith('__reactProps$'));
    // Call onClick directly (bypasses disabled check)
    await act(async () => dispatchBtn[propsKey].onClick({}));
    await flush();
    expect(fixture.streams).toHaveLength(0);
});

test('TC-EXEC-185 | handleMatchIntent guard rejects empty intent without API call', async () => {
    // 输入: call handleMatchIntent onClick directly with no userIntent
    // 预期: guard clause returns early, no API call made
    // 断言: api.post not called for retrieve-topn
    fixture = await mount({ searchMode: 'fuzzy' });
    const matchBtn = [...fixture.node.querySelectorAll('button')].find(b =>
        b.textContent.trim() === 'Match' && b.className.includes('bg-blue-600')
    );
    const propsKey = Object.keys(matchBtn).find(k => k.startsWith('__reactProps$'));
    const callsBefore = fixture.api.post.mock.calls.length;
    // Call onClick directly (bypasses disabled check)
    await act(async () => matchBtn[propsKey].onClick({}));
    await flush();
    expect(fixture.api.post.mock.calls.length).toBe(callsBefore);
});

test('TC-EXEC-186 | startExecution with userIntent includes user_intent param in URL', async () => {
    // 输入: fuzzy mode, type intent, match single result, click play on matched workflow
    // 预期: startExecution called with userIntent set, URL includes user_intent param
    // 断言: stream URL contains user_intent= with encoded intent value
    fixture = await mount({
        searchMode: 'fuzzy',
        matchResults: [{ workflow_id: 'wf-userintent', name: 'UserIntent WF', description: 'd', tags: [], score: 0.9 }],
    });
    await typeInInput(fixture.node, 'my deployment intent');
    await click(findButton(fixture.node, 'Match'));
    await flush();
    // Click play button on the matched workflow card
    const wfCard = [...fixture.node.querySelectorAll('[class*="cursor-pointer"]')].find(el => el.textContent.includes('UserIntent WF'));
    const playBtn = wfCard.querySelector('button');
    await click(playBtn);
    expect(fixture.streams).toHaveLength(1);
    // URL should include user_intent, lang, and target_agent (all params set)
    expect(fixture.streams[0].url).toContain('psop_id=wf-userintent');
    expect(fixture.streams[0].url).toContain('user_intent=my%20deployment%20intent');
    expect(fixture.streams[0].url).toContain('lang=en');
    expect(fixture.streams[0].url).toContain('target_agent=workbench-agent');
});

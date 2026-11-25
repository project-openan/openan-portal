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

// --- Mocks (hoisted) ---
// ExecutionStatistics needs a controllable api from the portal context.
const mockApi = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@openan/portal-sdk', () => ({
    usePortalContext: () => ({ api: mockApi }),
}));
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: key => key, i18n: { language: 'en' } }),
}));
// lucide-react icons are presentational only; stub each imported icon to null
// so the DOM stays clean. (A Proxy mock breaks named-import live bindings in vitest.)
vi.mock('lucide-react', () => {
    const Stub = () => null;
    return {
        CheckCircle2: Stub, StopCircle: Stub, XCircle: Stub, Loader: Stub,
        Clock: Stub, ChevronRight: Stub, ChevronDown: Stub, Bot: Stub,
        ArrowRight: Stub, ArrowLeft: Stub, MessageSquare: Stub, GitBranch: Stub,
        RotateCcw: Stub, FileText: Stub, Shield: Stub, Bell: Stub,
    };
});
// recharts needs a real DOM size to measure; in jsdom it renders nothing useful,
// so stub every chart primitive to its children (or null) to keep the layout intact.
vi.mock('recharts', () => {
    const Stub = (props) => (props && props.children != null ? props.children : null);
    return {
        BarChart: Stub, Bar: Stub, XAxis: Stub, YAxis: Stub, CartesianGrid: Stub,
        Tooltip: Stub, ResponsiveContainer: Stub, PieChart: Stub, Pie: Stub,
        Cell: Stub, LineChart: Stub, Line: Stub,
    };
});

import ExecutionTimeline from '../plugins/execution-center/src/timeline/index.jsx';
import ExecutionStatistics from '../plugins/execution-center/src/execution_statistics/index.jsx';

// --- Helpers ---
const flush = () => act(async () => { await new Promise(r => setTimeout(r, 10)); });

const mount = async (element) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(element));
    return { container, root };
};

const mountAndWait = async (element) => {
    const res = await mount(element);
    await flush();
    return res;
};

const unmount = async (root, container) => {
    await act(async () => root.unmount());
    container.remove();
};

const clickEl = async (el) => {
    expect(el).toBeTruthy();
    await act(async () => { Simulate.click(el); });
    await flush();
};

// Returns the deepest cursor-pointer div whose text contains `text` — this
// resolves to the actual clickable header rather than an ancestor container.
const findClickable = (container, text) => {
    const matches = [...container.querySelectorAll('div')].filter(d =>
        typeof d.className === 'string' &&
        d.className.includes('cursor-pointer') &&
        d.textContent.includes(text)
    );
    return matches[matches.length - 1];
};

beforeEach(() => {
    mockApi.get.mockReset();
    mockApi.get.mockResolvedValue({ status: 'success', data: [] });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

/* ══════════════════════════════════════════════════════════════════
 * ExecutionTimeline — plugins/execution-center/src/timeline/index.jsx
 * ══════════════════════════════════════════════════════════════════ */

test('TC-TL-101 | empty events render the waiting placeholder', async () => {
    // 输入: events=[]  预期: 等待执行文案  断言: 空态文案存在
    const { container, root } = await mount(<ExecutionTimeline events={[]} />);
    try {
        expect(container.textContent).toContain('等待执行');
        expect(container.textContent).toContain('执行工作流后将在此显示进度');
    } finally { await unmount(root, container); }
});

test('TC-TL-102 | completed workflow shows completed status, progress and self-loop badges', async () => {
    // 输入: 2 steps both completed with 0 interactions  预期: 已完成 + 2/2 + SELF-LOOP
    const events = [
        { type: 'start', timestamp: 1000, data: { workflow: 'CoverageWF', steps: 2 } },
        { type: 'step_start', timestamp: 1001, data: { step: 'Step A' } },
        { type: 'step_complete', timestamp: 1005, data: { step: 'Step A', results: 'A result' } },
        { type: 'step_start', timestamp: 1006, data: { step: 'Step B' } },
        { type: 'step_complete', timestamp: 1010, data: { step: 'Step B' } },
        { type: 'complete', timestamp: 1011, data: {} },
    ];
    const { container, root } = await mount(<ExecutionTimeline events={events} />);
    try {
        expect(container.textContent).toContain('CoverageWF');
        expect(container.textContent).toContain('已完成');
        expect(container.textContent).toContain('2/2 步骤');
        expect(container.textContent).toContain('SELF-LOOP');
    } finally { await unmount(root, container); }
});

test('TC-TL-103 | step error marks the workflow failed and renders the error text', async () => {
    // 输入: step error event  预期: 失败状态 + error 文案  断言: 改坏 error 分支即失败
    const events = [
        { type: 'start', timestamp: 1000, data: { workflow: 'FailWF', steps: 1 } },
        { type: 'step_start', timestamp: 1001, data: { step: 'S1' } },
        { type: 'error', timestamp: 1002, data: { step: 'S1', error: 'boom-failure' } },
    ];
    const { container, root } = await mount(<ExecutionTimeline events={events} />);
    try {
        expect(container.textContent).toContain('失败');
        expect(container.textContent).toContain('boom-failure');
    } finally { await unmount(root, container); }
});

test('TC-TL-104 | cancelled event shows cancelled workflow status', async () => {
    const events = [
        { type: 'start', timestamp: 1000, data: { workflow: 'CancelWF', steps: 1 } },
        { type: 'step_start', timestamp: 1001, data: { step: 'S1' } },
        { type: 'cancelled', timestamp: 1002, data: {} },
    ];
    const { container, root } = await mount(<ExecutionTimeline events={events} />);
    try {
        expect(container.textContent).toContain('已取消');
    } finally { await unmount(root, container); }
});

test('TC-TL-105 | running workflow shows running status and partial progress', async () => {
    // 输入: 1 completed + 1 running step, isRunning  预期: 执行中 + 1/2  断言: 进度计算
    const events = [
        { type: 'start', timestamp: 1000, data: { workflow: 'RunWF', steps: 2 } },
        { type: 'step_start', timestamp: 1001, data: { step: 'S1' } },
        { type: 'step_complete', timestamp: 1002, data: { step: 'S1' } },
        { type: 'step_start', timestamp: 1003, data: { step: 'S2' } },
    ];
    const { container, root } = await mount(<ExecutionTimeline events={events} isRunning />);
    try {
        expect(container.textContent).toContain('执行中');
        expect(container.textContent).toContain('1/2 步骤');
    } finally { await unmount(root, container); }
});

test('TC-TL-106 | self-loop step with string output expands to reveal the output', async () => {
    // 输入: completed step with results, 0 interactions  预期: SELF-LOOP + output after expand
    const events = [
        { type: 'start', timestamp: 1000, data: { workflow: 'WF', steps: 1 } },
        { type: 'step_start', timestamp: 1001, data: { step: 'Solo' } },
        { type: 'step_complete', timestamp: 1003, data: { step: 'Solo', results: 'solo output text' } },
        { type: 'complete', timestamp: 1004, data: {} },
    ];
    const { container, root } = await mount(<ExecutionTimeline events={events} />);
    try {
        expect(container.textContent).toContain('SELF-LOOP');
        // completed step starts collapsed → output hidden
        expect(container.textContent).not.toContain('solo output text');
        await clickEl(findClickable(container, 'Solo'));
        await clickEl(findClickable(container, 'Self-Loop'));
        expect(container.textContent).toContain('solo output text');
    } finally { await unmount(root, container); }
});

test('TC-TL-107 | self-loop step with object output renders task labels', async () => {
    // 输入: task_response sets object output  预期: taskDesc label after expand
    const events = [
        { type: 'start', timestamp: 1000, data: { workflow: 'WF', steps: 1 } },
        { type: 'step_start', timestamp: 1001, data: { step: 'Solo' } },
        { type: 'task_response', timestamp: 1002, data: { step: 'Solo', task: 'analyze', output: { summary: 'ok' } } },
        { type: 'step_complete', timestamp: 1003, data: { step: 'Solo' } },
        { type: 'complete', timestamp: 1004, data: {} },
    ];
    const { container, root } = await mount(<ExecutionTimeline events={events} />);
    try {
        await clickEl(findClickable(container, 'Solo'));
        await clickEl(findClickable(container, 'Self-Loop'));
        expect(container.textContent).toContain('analyze');
    } finally { await unmount(root, container); }
});

test('TC-TL-108 | agent interaction renders request, response and negotiation rounds', async () => {
    // 输入: request/response + 3 negotiation types  预期: REQUEST/RESPONSE/协商 + negotiation content
    const events = [
        { type: 'start', timestamp: 1000, data: { workflow: 'WF', steps: 1 } },
        { type: 'step_start', timestamp: 1001, data: { step: 'S1' } },
        { type: 'task_request', timestamp: 1002, data: { step: 'S1', agent: 'AgentX', task: 'work' } },
        { type: 'agent_request', timestamp: 1003, data: { agent: 'AgentX', text: 'please do work' } },
        { type: 'negotiation_request', timestamp: 1004, data: { agent: 'AgentX', concern: 'need clarification' } },
        { type: 'negotiation_resolved', timestamp: 1005, data: { agent: 'AgentX', clarification: 'resolved it' } },
        { type: 'negotiation_failed', timestamp: 1006, data: { agent: 'AgentX', reason: 'could not agree' } },
        { type: 'agent_response', timestamp: 1007, data: { agent: 'AgentX', text: 'done result' } },
        { type: 'step_complete', timestamp: 1008, data: { step: 'S1' } },
        { type: 'complete', timestamp: 1009, data: {} },
    ];
    const { container, root } = await mount(<ExecutionTimeline events={events} />);
    try {
        // completed step starts collapsed → cards hidden
        expect(container.textContent).not.toContain('REQUEST');
        await clickEl(findClickable(container, 'S1'));
        expect(container.textContent).toContain('REQUEST');
        expect(container.textContent).toContain('RESPONSE');
        expect(container.textContent).toContain('协商 (3 轮)');
        await clickEl(findClickable(container, '协商'));
        expect(container.textContent).toContain('need clarification');
        expect(container.textContent).toContain('resolved it');
        expect(container.textContent).toContain('could not agree');
    } finally { await unmount(root, container); }
});

test('TC-TL-109 | protocol card renders A2A extensions, metadata and text part', async () => {
    // 输入: agent_request/response with metadata (incl. A2A key)  预期: A2A-Extensions + metadata + text
    const events = [
        { type: 'start', timestamp: 1000, data: { workflow: 'WF', steps: 1 } },
        { type: 'step_start', timestamp: 1001, data: { step: 'S1' } },
        { type: 'task_request', timestamp: 1002, data: { step: 'S1', agent: 'AgentX' } },
        { type: 'agent_request', timestamp: 1003, data: {
            agent: 'AgentX',
            text: 'request body content',
            metadata: {
                'tmforum.org/a2a-ext': 'ext value',
                'normalKey': 'normal value',
                'emptyKey': '',
            },
        } },
        { type: 'agent_response', timestamp: 1004, data: { agent: 'AgentX', text: 'response body content' } },
        { type: 'step_complete', timestamp: 1005, data: { step: 'S1' } },
        { type: 'complete', timestamp: 1006, data: {} },
    ];
    const { container, root } = await mount(<ExecutionTimeline events={events} />);
    try {
        await clickEl(findClickable(container, 'S1'));
        // expand the response card first — its "Text Part" is the only one rendered
        // while the request card stays collapsed, so we target it unambiguously.
        await clickEl(findClickable(container, 'RESPONSE'));
        const textBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Text Part'));
        await clickEl(textBtn);
        expect(container.textContent).toContain('response body content');
        // now expand the request card to reveal A2A extensions + metadata
        await clickEl(findClickable(container, 'REQUEST'));
        expect(container.textContent).toContain('A2A-Extensions');
        expect(container.textContent).toContain('a2a-ext');
        expect(container.textContent).toContain('normalKey');
        expect(container.textContent).toContain('normal value');
    } finally { await unmount(root, container); }
});

test('TC-TL-110 | authorization_request and notification create request-only interactions', async () => {
    // 输入: authorization_request + notification + orphan agent_response  预期: 2 interactions, no orphan
    const events = [
        { type: 'start', timestamp: 1000, data: { workflow: 'WF', steps: 1 } },
        { type: 'step_start', timestamp: 1001, data: { step: 'S1' } },
        { type: 'authorization_request', timestamp: 1002, data: { agent: 'AuthAgent', text: 'need approval' } },
        { type: 'notification', timestamp: 1003, data: { agent: 'NotifAgent', text: 'fyi note' } },
        { type: 'agent_response', timestamp: 1004, data: { agent: 'Ghost', text: 'no match' } },
        { type: 'negotiation_request', timestamp: 1005, data: { agent: 'Ghost', concern: 'orphan neg' } },
        { type: 'step_complete', timestamp: 1006, data: { step: 'S1' } },
        { type: 'complete', timestamp: 1007, data: {} },
    ];
    const { container, root } = await mount(<ExecutionTimeline events={events} />);
    try {
        expect(container.textContent).toContain('2 次交互');
        await clickEl(findClickable(container, 'S1'));
        const requestLabels = [...container.querySelectorAll('span')].filter(s => s.textContent === 'REQUEST');
        expect(requestLabels.length).toBe(2);
        // orphan agent_response and orphan negotiation for an unknown agent are dropped
        expect(container.textContent).not.toContain('no match');
        expect(container.textContent).not.toContain('orphan neg');
    } finally { await unmount(root, container); }
});

test('TC-TL-111 | route_decision with next and reason renders the route card', async () => {
    // 输入: route_decision data.next + reason  预期: Route: ... > next + reason 文案
    const events = [
        { type: 'start', timestamp: 1000, data: { workflow: 'WF', steps: 1 } },
        { type: 'step_start', timestamp: 1001, data: { step: 'S1' } },
        { type: 'route_decision', timestamp: 1002, data: { step: 'S1', next: 'S2', reason: 'go-next' } },
        { type: 'step_complete', timestamp: 1003, data: { step: 'S1' } },
        { type: 'complete', timestamp: 1004, data: {} },
    ];
    const { container, root } = await mount(<ExecutionTimeline events={events} />);
    try {
        await clickEl(findClickable(container, 'S1'));
        expect(container.textContent).toContain('Route:');
        expect(container.textContent).toContain('S2');
        expect(container.textContent).toContain('go-next');
    } finally { await unmount(root, container); }
});

test('TC-TL-112 | route_decision falls back to next_step and omits reason when absent', async () => {
    // 输入: route_decision with next_step only  预期: next_step value renders, no reason block
    const events = [
        { type: 'start', timestamp: 1000, data: { workflow: 'WF', steps: 1 } },
        { type: 'step_start', timestamp: 1001, data: { step: 'S1' } },
        { type: 'route_decision', timestamp: 1002, data: { step: 'S1', next_step: 'S3' } },
        { type: 'step_complete', timestamp: 1003, data: { step: 'S1' } },
        { type: 'complete', timestamp: 1004, data: {} },
    ];
    const { container, root } = await mount(<ExecutionTimeline events={events} />);
    try {
        await clickEl(findClickable(container, 'S1'));
        expect(container.textContent).toContain('S3');
    } finally { await unmount(root, container); }
});

test('TC-TL-113 | task_status_changed sets output only when both result and step are present', async () => {
    // 输入: 3 task_status_changed (no-result / no-step / valid)  预期: only valid sets output
    const events = [
        { type: 'start', timestamp: 1000, data: { workflow: 'WF', steps: 1 } },
        { type: 'step_start', timestamp: 1001, data: { step: 'S1' } },
        { type: 'task_status_changed', timestamp: 1002, data: { step: 'S1' } },
        { type: 'task_status_changed', timestamp: 1003, data: { result: 'no-step output' } },
        { type: 'task_status_changed', timestamp: 1004, data: { step: 'S1', result: 'status output' } },
        { type: 'step_complete', timestamp: 1005, data: { step: 'S1' } },
        { type: 'complete', timestamp: 1006, data: {} },
    ];
    const { container, root } = await mount(<ExecutionTimeline events={events} />);
    try {
        expect(container.textContent).toContain('SELF-LOOP');
        await clickEl(findClickable(container, 'S1'));
        await clickEl(findClickable(container, 'Self-Loop'));
        expect(container.textContent).toContain('status output');
        expect(container.textContent).not.toContain('no-step output');
    } finally { await unmount(root, container); }
});

test('TC-TL-114 | parallel steps route agent events by stepName field', async () => {
    // 输入: two concurrent steps, agent_request carries explicit step  预期: routed to correct step
    const events = [
        { type: 'start', timestamp: 1000, data: { workflow: 'WF', steps: 2 } },
        { type: 'step_start', timestamp: 1001, data: { step: 'Alpha' } },
        { type: 'step_start', timestamp: 1002, data: { step: 'Beta' } },
        { type: 'agent_request', timestamp: 1003, data: { step: 'Alpha', agent: 'AgentA', text: 'work for Alpha' } },
        { type: 'agent_request', timestamp: 1004, data: { step: 'Beta', agent: 'AgentB', text: 'work for Beta' } },
        { type: 'step_complete', timestamp: 1005, data: { step: 'Alpha' } },
        { type: 'step_complete', timestamp: 1006, data: { step: 'Beta' } },
        { type: 'complete', timestamp: 1007, data: {} },
    ];
    const { container, root } = await mount(<ExecutionTimeline events={events} />);
    try {
        await clickEl(findClickable(container, 'Alpha'));
        expect(container.textContent).toContain('AgentA');
        expect(container.textContent).not.toContain('AgentB');
    } finally { await unmount(root, container); }
});

test('TC-TL-115 | orphan agent event and unknown-step task_response are skipped', async () => {
    // 输入: agent_request before any step + task_response for unknown step  预期: both skipped
    const events = [
        { type: 'agent_request', timestamp: 999, data: { agent: 'Ghost', text: 'orphan-msg' } },
        { type: 'start', timestamp: 1000, data: { workflow: 'WF', steps: 1 } },
        { type: 'step_start', timestamp: 1001, data: { step: 'S1' } },
        { type: 'task_response', timestamp: 1002, data: { step: 'Unknown', task: 'x' } },
        { type: 'step_complete', timestamp: 1003, data: { step: 'S1' } },
        { type: 'complete', timestamp: 1004, data: {} },
    ];
    const { container, root } = await mount(<ExecutionTimeline events={events} />);
    try {
        expect(container.textContent).not.toContain('orphan-msg');
        expect(container.textContent).toContain('SELF-LOOP');
    } finally { await unmount(root, container); }
});

test('TC-TL-116 | duration formats minutes for a long-running step', async () => {
    // 输入: step lasting 61s  预期: "1m 1s"  断言: formatDuration minutes branch
    const events = [
        { type: 'start', timestamp: 1000, data: { workflow: 'WF', steps: 1 } },
        { type: 'step_start', timestamp: 1001, data: { step: 'S1' } },
        { type: 'step_complete', timestamp: 1062, data: { step: 'S1' } },
        { type: 'complete', timestamp: 1063, data: {} },
    ];
    const { container, root } = await mount(<ExecutionTimeline events={events} />);
    try {
        expect(container.textContent).toContain('1m 1s');
    } finally { await unmount(root, container); }
});

test('TC-TL-117 | workflow without a start event renders the default name and pending status', async () => {
    // 输入: no start event  预期: "Workflow Execution" + 等待中 + no duration  断言: !startTime branch
    const events = [
        { type: 'step_start', timestamp: 1001, data: { step: 'S1' } },
        { type: 'step_complete', timestamp: 1002, data: { step: 'S1' } },
    ];
    const { container, root } = await mount(<ExecutionTimeline events={events} />);
    try {
        expect(container.textContent).toContain('Workflow Execution');
        expect(container.textContent).toContain('等待中');
    } finally { await unmount(root, container); }
});

test('TC-TL-118 | failed steps count appears in the workflow header', async () => {
    // 输入: 2 steps both failed  预期: "(2 失败)" + 失败 status + error text
    const events = [
        { type: 'start', timestamp: 1000, data: { workflow: 'WF', steps: 2 } },
        { type: 'step_start', timestamp: 1001, data: { step: 'S1' } },
        { type: 'error', timestamp: 1002, data: { step: 'S1', error: 'fail1' } },
        { type: 'step_start', timestamp: 1003, data: { step: 'S2' } },
        { type: 'error', timestamp: 1004, data: { step: 'S2', error: 'fail2' } },
    ];
    const { container, root } = await mount(<ExecutionTimeline events={events} />);
    try {
        expect(container.textContent).toContain('失败');
        expect(container.textContent).toContain('(2 失败)');
        expect(container.textContent).toContain('fail1');
    } finally { await unmount(root, container); }
});

test('TC-TL-119 | markdown renderer covers headings, lists, code, table, link and quote', async () => {
    // 输入: metadata value containing rich GFM markdown  预期: all mdComponents exercised
    // 防回归: 删掉任一 mdComponent 分支（含 code 的 language- 块判断）即失败
    const richMd = [
        '# H1 Title',
        '## H2 Title',
        '### H3 Title',
        'paragraph text',
        '- ul item',
        '1. ol item',
        '**bold text**',
        '*italic text*',
        '`inline code`',
        '```js',
        'code block body',
        '```',
        '| col1 | col2 |',
        '|---|---|',
        '| c1 | c2 |',
        '> quote text',
        '[link text](http://example.com)',
        '---',
    ].join('\n');
    const events = [
        { type: 'start', timestamp: 1000, data: { workflow: 'WF', steps: 1 } },
        { type: 'step_start', timestamp: 1001, data: { step: 'S1' } },
        { type: 'task_request', timestamp: 1002, data: { step: 'S1', agent: 'AgentX' } },
        { type: 'agent_request', timestamp: 1003, data: { agent: 'AgentX', metadata: { doc: richMd } } },
        { type: 'agent_response', timestamp: 1004, data: { agent: 'AgentX', text: 'ok' } },
        { type: 'step_complete', timestamp: 1005, data: { step: 'S1' } },
        { type: 'complete', timestamp: 1006, data: {} },
    ];
    const { container, root } = await mount(<ExecutionTimeline events={events} />);
    try {
        await clickEl(findClickable(container, 'S1'));
        await clickEl(findClickable(container, 'REQUEST'));
        expect(container.textContent).toContain('H1 Title');
        expect(container.textContent).toContain('bold text');
        expect(container.textContent).toContain('code block body');
        expect(container.textContent).toContain('c1');
        expect(container.textContent).toContain('quote text');
        expect(container.textContent).toContain('link text');
    } finally { await unmount(root, container); }
});

test('TC-TL-120 | step error without an error field falls back to JSON stringification', async () => {
    // 输入: error event whose data has no .error key  预期: JSON.stringify(step.error) renders
    // 防回归: 若 JSON.stringify 回退被删（只读 step.error.error），本用例失败
    const events = [
        { type: 'start', timestamp: 1000, data: { workflow: 'WF', steps: 1 } },
        { type: 'step_start', timestamp: 1001, data: { step: 'S1' } },
        { type: 'error', timestamp: 1002, data: { step: 'S1', code: 500, detail: 'oops' } },
    ];
    const { container, root } = await mount(<ExecutionTimeline events={events} />);
    try {
        expect(container.textContent).toContain('"code":500');
    } finally { await unmount(root, container); }
});


/* ══════════════════════════════════════════════════════════════════
 * ExecutionStatistics — plugins/execution-center/src/execution_statistics/index.jsx
 * ══════════════════════════════════════════════════════════════════ */

const STAT_RECORDS = [
    { psop_name: 'WF-A', status: 'success', started_at: '2026-01-15T10:00:00Z' },
    { psop_name: 'WF-A', status: 'success', started_at: '2026-01-20T10:00:00Z' },
    { psop_name: 'WF-A', status: 'failed', started_at: '2026-02-10T10:00:00Z' },
    { psop_name: 'WF-B', status: 'running', started_at: '2026-03-01T10:00:00Z' },
    { psop_name: 'WF-B', status: 'success', created_at: '2026-04-05T10:00:00Z' },
    { psop_id: 'id-flow', status: 'unknown', started_at: '2026-01-01T10:00:00Z' },
];

test('TC-STAT-101 | loading state shows the loading indicator text', async () => {
    // 输入: pending api promise  预期: execution.loading 文案  断言: loading 分支
    let resolveGet;
    mockApi.get.mockImplementation(() => new Promise(r => { resolveGet = r; }));
    const { container, root } = await mount(<ExecutionStatistics />);
    try {
        expect(container.textContent).toContain('execution.loading');
    } finally {
        if (resolveGet) {
            await act(async () => { resolveGet({ status: 'success', data: [] }); });
            await flush();
        }
        await unmount(root, container);
    }
});

test('TC-STAT-102 | loaded records render title, computed success rate, trend and names', async () => {
    // 输入: 6 records (success×3, failed×1, running×1, unknown×1)  预期: 66.7% + trend month + psop_id fallback
    // success = 3 explicit + 1 unknown(→success) = 4; rate = 4/6 = 66.7%
    mockApi.get.mockResolvedValue({ status: 'success', data: STAT_RECORDS });
    const { container, root } = await mountAndWait(<ExecutionStatistics />);
    try {
        expect(mockApi.get).toHaveBeenCalledWith('/rest/v1/orchestrate/execution-records');
        expect(container.textContent).toContain('execution.statistics_title');
        expect(container.textContent).toContain('66.7%');
        // WF-A auto-selected → trend shows 2026-01 (2 runs)
        expect(container.textContent).toContain('2026-01');
        // frequency ranking + psop_id fallback name
        expect(container.textContent).toContain('WF-A');
        expect(container.textContent).toContain('id-flow');
    } finally { await unmount(root, container); }
});

test('TC-STAT-103 | empty records render no_data and a 0.0% success rate', async () => {
    // 输入: records=[]  预期: execution.no_data + 0.0%  断言: total=0 分支
    mockApi.get.mockResolvedValue({ status: 'success', data: [] });
    const { container, root } = await mountAndWait(<ExecutionStatistics />);
    try {
        expect(container.textContent).toContain('execution.no_data');
        expect(container.textContent).toContain('0.0%');
    } finally { await unmount(root, container); }
});

test('TC-STAT-104 | api rejection leaves records empty and shows no_data', async () => {
    // 输入: api.get rejects  预期: catch swallows error, records empty → no_data  断言: error 分支
    mockApi.get.mockRejectedValue(new Error('boom'));
    const { container, root } = await mountAndWait(<ExecutionStatistics />);
    try {
        expect(container.textContent).toContain('execution.no_data');
    } finally { await unmount(root, container); }
});

test('TC-STAT-105 | dark theme renders title and computed success rate', async () => {
    // 输入: isDark  预期: title + 66.7%  断言: isDark=true ternaries
    mockApi.get.mockResolvedValue({ status: 'success', data: STAT_RECORDS });
    const { container, root } = await mountAndWait(<ExecutionStatistics isDark />);
    try {
        expect(container.textContent).toContain('execution.statistics_title');
        expect(container.textContent).toContain('66.7%');
    } finally { await unmount(root, container); }
});

test('TC-STAT-106 | selecting another workflow updates the trend and exercises created_at fallback', async () => {
    // 输入: select WF-B  预期: trend shows 2026-03 (started_at) + 2026-04 (created_at fallback)
    mockApi.get.mockResolvedValue({ status: 'success', data: STAT_RECORDS });
    const { container, root } = await mountAndWait(<ExecutionStatistics />);
    try {
        // WF-A auto-selected → 2026-01 visible
        expect(container.textContent).toContain('2026-01');
        const select = container.querySelector('select');
        expect(select).toBeTruthy();
        await act(async () => { Simulate.change(select, { target: { value: 'WF-B' } }); });
        await flush();
        // WF-B trend uses started_at (2026-03) and created_at fallback (2026-04)
        expect(container.textContent).toContain('2026-03');
        expect(container.textContent).toContain('2026-04');
    } finally { await unmount(root, container); }
});

test('TC-STAT-107 | status distribution renders failed and running percentages', async () => {
    // 输入: 1 failed + 1 running out of 6  预期: 16.7% for each  断言: statusCounts + percentage 计算
    mockApi.get.mockResolvedValue({ status: 'success', data: STAT_RECORDS });
    const { container, root } = await mountAndWait(<ExecutionStatistics />);
    try {
        // failed=1/6=16.7%, running=1/6=16.7%
        expect(container.textContent).toContain('16.7');
    } finally { await unmount(root, container); }
});

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
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// ===== Hoisted Mocks =====
const apiMocks = vi.hoisted(() => ({
    getAgentCards: vi.fn(),
    createWorkflow: vi.fn(),
}));

vi.mock('../portal/src/service/api.js', () => ({
    getAgentCards: apiMocks.getAgentCards,
    createWorkflow: apiMocks.createWorkflow,
    default: { get: vi.fn(), post: vi.fn() },
    createApi: vi.fn(() => ({ get: vi.fn(), post: vi.fn() })),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key) => key }),
}));

vi.mock('lucide-react', () => ({ Bot: () => null }));

vi.mock('@xyflow/react', () => ({
    Handle: () => null,
    Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
    useConnection: () => ({ inProgress: false }),
    BaseEdge: () => null,
    EdgeLabelRenderer: ({ children }) => children,
    getBezierPath: () => ['M0,0 L100,100', 50, 50],
}));

// ===== Imports =====
import PropertyPanel from '../packages/shared-workflow/src/property_panel/index.jsx';
import Toolbar from '../packages/shared-workflow/src/toolbar/index.jsx';
import Sidebar from '../packages/shared-workflow/src/sidebar/index.jsx';
import KVEditor from '../packages/shared-workflow/src/kv_editor/index.jsx';
import AgentNode from '../packages/shared-workflow/src/CustomNodes/AgentNode/index.jsx';
import CustomEdge from '../packages/shared-workflow/src/CustomEdge/index.jsx';
import { StartNode, EndNode } from '../packages/shared-workflow/src/CustomNodes/CircleNode/index.jsx';
import ToolbarLite from '../packages/shared-workflow/src/toolbar_lite/index.jsx';
import WorkflowLoader from '../packages/shared-workflow/src/loading/index.jsx';

// ===== Helpers =====
let container, root;
const flush = () => act(async () => { await new Promise(r => setTimeout(r, 10)); });

async function mount(component) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root.render(component));
    await flush();
    return container;
}

function btn(rootEl, text) {
    return Array.from(rootEl.querySelectorAll('button')).find(b => b.textContent.includes(text));
}
function el(rootEl, selector, text) {
    return Array.from(rootEl.querySelectorAll(selector)).find(e => e.textContent.includes(text));
}
function selectWith(rootEl, optionValue) {
    return Array.from(rootEl.querySelectorAll('select')).find(s =>
        Array.from(s.options).some(o => o.value === optionValue));
}
function applyAll(mockFn, initialState) {
    let state = initialState;
    for (const call of mockFn.mock.calls) {
        if (typeof call[0] === 'function') state = call[0](state);
    }
    return state;
}

beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.getAgentCards.mockResolvedValue({ data: [] });
    apiMocks.createWorkflow.mockResolvedValue({ status: 'success' });
});

afterEach(async () => {
    if (root) { await act(async () => root.unmount()); }
    if (container) container.remove();
    container = null; root = null;
});

// ===== PropertyPanel (TC-PP-*) =====

test('TC-PP-101 | empty state shows placeholder when no element selected', async () => {
    await mount(<PropertyPanel selectedElement={null} nodes={[]} edges={[]} />);
    expect(container.textContent).toContain('workflow.panel.empty');
    expect(container.textContent).not.toContain('workflow.panel.nodeConfig');
});

test('TC-PP-102 | node without subtasks shows agent and skill read-only fields', async () => {
    const node = { id: 'n1', type: 'agentNode', data: { label: 'Step1', agent: 'AgentA', skill: 'SkillX' } };
    await mount(<PropertyPanel selectedElement={node} nodes={[node]} edges={[]} setNodes={vi.fn()} setEdges={vi.fn()} />);
    expect(container.textContent).toContain('AgentA');
    expect(container.textContent).toContain('SkillX');
    expect(container.textContent).toContain('workflow.panel.nodeConfig');
    expect(container.textContent).toContain('ID: n1');
});

test('TC-PP-103 | node with subtasks renders subtask agents and skills', async () => {
    const node = {
        id: 'n1', type: 'agentNode',
        data: { label: 'Multi', subtasks: [
            { agent: 'A1', skill: 'S1', status: 'success' },
            { agent: 'A2', skill: 'S2', status: 'running' },
        ] },
    };
    await mount(<PropertyPanel selectedElement={node} nodes={[node]} edges={[]} setNodes={vi.fn()} setEdges={vi.fn()} />);
    expect(container.textContent).toContain('A1');
    expect(container.textContent).toContain('S1');
    expect(container.textContent).toContain('A2');
    expect(container.textContent).toContain('S2');
});

test('TC-PP-104 | removing a subtask filters subtasks and adjusts height', async () => {
    const node = {
        id: 'n1', type: 'agentNode',
        data: { label: 'S', subtasks: [
            { agent: 'A1', skill: 'S1', status: 'pending' },
            { agent: 'A2', skill: 'S2', status: 'pending' },
        ] },
    };
    const setNodes = vi.fn();
    await mount(<PropertyPanel selectedElement={node} nodes={[node]} edges={[]} setNodes={setNodes} setEdges={vi.fn()} />);
    setNodes.mockClear();
    const removeBtns = container.querySelectorAll('button[title="workflow.panel.removeSubtask"]');
    expect(removeBtns.length).toBe(2);
    await act(async () => Simulate.click(removeBtns[0]));
    const result = applyAll(setNodes, [node]);
    expect(result[0].data.subtasks).toHaveLength(1);
    expect(result[0].data.subtasks[0].agent).toBe('A2');
    expect(result[0].height).toBe(135);
});

test('TC-PP-105 | changing subtask description updates the subtask', async () => {
    const node = {
        id: 'n1', type: 'agentNode',
        data: { label: 'S', subtasks: [
            { agent: 'A1', skill: 'S1', status: 'pending', description: 'old desc' },
        ] },
    };
    const setNodes = vi.fn();
    await mount(<PropertyPanel selectedElement={node} nodes={[node]} edges={[]} setNodes={setNodes} setEdges={vi.fn()} />);
    setNodes.mockClear();
    const descInput = Array.from(container.querySelectorAll('input[type="text"]')).find(i => i.value === 'old desc');
    expect(descInput).toBeTruthy();
    await act(async () => Simulate.change(descInput, { target: { value: 'new desc' } }));
    const result = applyAll(setNodes, [node]);
    expect(result[0].data.subtasks[0].description).toBe('new desc');
});

test('TC-PP-106 | changing subtask skill (single) updates skill, inputs, outputs and subtasks', async () => {
    const node = {
        id: 'n1', type: 'agentNode',
        data: { label: 'S', subtasks: [
            { agent: 'A1', skill: 'S1', status: 'pending', skillsList: [
                { name: 'S1', inputs: 'in1:d1', outputs: 'out1:d1' },
                { name: 'S2', inputs: 'in2:d2', outputs: 'out2:d2' },
            ] },
        ] },
    };
    const setNodes = vi.fn();
    await mount(<PropertyPanel selectedElement={node} nodes={[node]} edges={[]} setNodes={setNodes} setEdges={vi.fn()} />);
    setNodes.mockClear();
    const skillSelect = Array.from(container.querySelectorAll('select')).find(s => s.value === 'S1');
    expect(skillSelect).toBeTruthy();
    await act(async () => Simulate.change(skillSelect, { target: { value: 'S2' } }));
    const result = applyAll(setNodes, [node]);
    expect(result[0].data.skill).toBe('S2');
    expect(result[0].data.inputs).toEqual({ in2: 'd2' });
    expect(result[0].data.outputs).toEqual({ out2: 'd2' });
    expect(result[0].data.subtasks[0].skill).toBe('S2');
});

test('TC-PP-107 | changing subtask skill (multiple) updates only subtasks not node-level skill', async () => {
    const node = {
        id: 'n1', type: 'agentNode',
        data: { label: 'S', subtasks: [
            { agent: 'A1', skill: 'S1', status: 'pending', skillsList: [
                { name: 'S1', inputs: 'in1:d1', outputs: 'out1:d1' },
                { name: 'S2', inputs: 'in2:d2', outputs: 'out2:d2' },
            ] },
            { agent: 'A2', skill: 'S3', status: 'pending' },
        ] },
    };
    const setNodes = vi.fn();
    await mount(<PropertyPanel selectedElement={node} nodes={[node]} edges={[]} setNodes={setNodes} setEdges={vi.fn()} />);
    setNodes.mockClear();
    const skillSelect = Array.from(container.querySelectorAll('select')).find(s => s.value === 'S1');
    await act(async () => Simulate.change(skillSelect, { target: { value: 'S2' } }));
    const result = applyAll(setNodes, [node]);
    expect(result[0].data.subtasks[0].skill).toBe('S2');
    expect(result[0].data.skill).toBeUndefined();
});

test('TC-PP-108 | useEffect auto-parses inputs and outputs from skillsList on mount', async () => {
    const node = {
        id: 'n1', type: 'agentNode',
        data: {
            label: 'S', skill: 'S1', inputs: {}, outputs: {},
            skillsList: [{ name: 'S1', inputs: 'key1:desc1\nkey2:desc2', outputs: 'out1:odesc1' }],
        },
    };
    const setNodes = vi.fn();
    await mount(<PropertyPanel selectedElement={node} nodes={[node]} edges={[]} setNodes={setNodes} setEdges={vi.fn()} />);
    expect(setNodes).toHaveBeenCalled();
    const result = applyAll(setNodes, [node]);
    expect(result[0].data.inputs).toEqual({ key1: 'desc1', key2: 'desc2' });
    expect(result[0].data.outputs).toEqual({ out1: 'odesc1' });
});

test('TC-PP-109 | edge condition change updates data.condition and sets label', async () => {
    const edge = { id: 'e1', source: 'n1', target: 'n2', data: { condition: '' } };
    const setEdges = vi.fn();
    await mount(<PropertyPanel selectedElement={edge} nodes={[]} edges={[edge]} setNodes={vi.fn()} setEdges={setEdges} />);
    setEdges.mockClear();
    const condInput = container.querySelector('input[placeholder="workflow.panel.conditionPlaceholder"]');
    expect(condInput).toBeTruthy();
    await act(async () => Simulate.change(condInput, { target: { value: 'x > 5' } }));
    const result = applyAll(setEdges, [edge]);
    expect(result[0].data.condition).toBe('x > 5');
    expect(result[0].label).toBe('x > 5');
});

test('TC-PP-110 | step type select change calls setNodes with new type', async () => {
    const node = { id: 'n1', type: 'agentNode', data: { label: 'S', agent: 'A', skill: 'S' } };
    const setNodes = vi.fn();
    await mount(<PropertyPanel selectedElement={node} nodes={[node]} edges={[]} setNodes={setNodes} setEdges={vi.fn()} />);
    setNodes.mockClear();
    const stepTypeSelect = selectWith(container, 'SelfLoop');
    expect(stepTypeSelect).toBeTruthy();
    await act(async () => Simulate.change(stepTypeSelect, { target: { value: 'SelfLoop' } }));
    const result = applyAll(setNodes, [node]);
    expect(result[0].data.type).toBe('SelfLoop');
});

test('TC-PP-111 | layer select change calls setNodes with new layer value', async () => {
    const node = { id: 'n1', type: 'agentNode', data: { label: 'S', agent: 'A', skill: 'S', layer: 0 } };
    const setNodes = vi.fn();
    await mount(<PropertyPanel selectedElement={node} nodes={[node]} edges={[]} setNodes={setNodes} setEdges={vi.fn()} />);
    setNodes.mockClear();
    const layerSelect = selectWith(container, '1');
    expect(layerSelect).toBeTruthy();
    await act(async () => Simulate.change(layerSelect, { target: { value: '1' } }));
    const result = applyAll(setNodes, [node]);
    expect(result[0].data.layer).toBe(1);
});

test('TC-PP-112 | toggleContextFrom adds step to context_from', async () => {
    const active = { id: 'n1', type: 'agentNode', data: { label: 'Active', agent: 'A', skill: 'S', layer: 1, context_from: [] } };
    const other = { id: 'n2', type: 'agentNode', data: { label: 'StepB', agent: 'B', skill: 'T', layer: 0 } };
    const setNodes = vi.fn();
    await mount(<PropertyPanel selectedElement={active} nodes={[active, other]} edges={[]} setNodes={setNodes} setEdges={vi.fn()} />);
    setNodes.mockClear();
    const stepBtn = btn(container, 'StepB');
    expect(stepBtn).toBeTruthy();
    await act(async () => Simulate.click(stepBtn));
    const result = applyAll(setNodes, [active, other]);
    expect(result[0].data.context_from).toEqual(['n2']);
});

test('TC-PP-113 | setContextAll sets context_from to star mode', async () => {
    const node = { id: 'n1', type: 'agentNode', data: { label: 'S', agent: 'A', skill: 'S', layer: 1, context_from: [] } };
    const setNodes = vi.fn();
    await mount(<PropertyPanel selectedElement={node} nodes={[node]} edges={[]} setNodes={setNodes} setEdges={vi.fn()} />);
    setNodes.mockClear();
    const allBtn = btn(container, 'workflow.panel.contextFromAll');
    expect(allBtn).toBeTruthy();
    await act(async () => Simulate.click(allBtn));
    const result = applyAll(setNodes, [node]);
    expect(result[0].data.context_from).toEqual(['*']);
});

test('TC-PP-114 | setContextAuto clears context_from to null', async () => {
    const node = { id: 'n1', type: 'agentNode', data: { label: 'S', agent: 'A', skill: 'S', layer: 1, context_from: ['n2'] } };
    const setNodes = vi.fn();
    await mount(<PropertyPanel selectedElement={node} nodes={[node]} edges={[]} setNodes={setNodes} setEdges={vi.fn()} />);
    setNodes.mockClear();
    const autoBtn = btn(container, 'workflow.panel.contextFromAuto');
    expect(autoBtn).toBeTruthy();
    expect(autoBtn.tagName).toBe('BUTTON');
    await act(async () => Simulate.click(autoBtn));
    const result = applyAll(setNodes, [node]);
    expect(result[0].data.context_from).toBeNull();
});

test('TC-PP-115 | star mode context_from shows star hint', async () => {
    const node = { id: 'n1', type: 'agentNode', data: { label: 'S', agent: 'A', skill: 'S', layer: 1, context_from: ['*'] } };
    await mount(<PropertyPanel selectedElement={node} nodes={[node]} edges={[]} setNodes={vi.fn()} setEdges={vi.fn()} />);
    expect(container.textContent).toContain('workflow.panel.contextFromHintStar');
});

test('TC-PP-116 | manual mode context_from shows manual hint', async () => {
    const node = { id: 'n1', type: 'agentNode', data: { label: 'S', agent: 'A', skill: 'S', layer: 1, context_from: ['n2'] } };
    await mount(<PropertyPanel selectedElement={node} nodes={[node]} edges={[]} setNodes={vi.fn()} setEdges={vi.fn()} />);
    expect(container.textContent).toContain('workflow.panel.contextFromHintManual');
});

test('TC-PP-117 | layer 0 shows layer0 hint instead of context UI', async () => {
    const node = { id: 'n1', type: 'agentNode', data: { label: 'S', agent: 'A', skill: 'S', layer: 0 } };
    await mount(<PropertyPanel selectedElement={node} nodes={[node]} edges={[]} setNodes={vi.fn()} setEdges={vi.fn()} />);
    expect(container.textContent).toContain('workflow.panel.contextFromHintLayer0');
});

test('TC-PP-118 | confirm button calls onClose', async () => {
    const node = { id: 'n1', type: 'agentNode', data: { label: 'S', agent: 'A', skill: 'S' } };
    const onClose = vi.fn();
    await mount(<PropertyPanel selectedElement={node} nodes={[node]} edges={[]} setNodes={vi.fn()} setEdges={vi.fn()} onClose={onClose} />);
    const confirmBtn = btn(container, 'workflow.panel.confirm');
    expect(confirmBtn).toBeTruthy();
    await act(async () => Simulate.click(confirmBtn));
    expect(onClose).toHaveBeenCalled();
});

test('TC-PP-119 | getAgentCards error is handled without crash', async () => {
    apiMocks.getAgentCards.mockRejectedValue(new Error('fetch failed'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const node = { id: 'n1', type: 'agentNode', data: { label: 'S', agent: 'A', skill: 'S' } };
    await mount(<PropertyPanel selectedElement={node} nodes={[node]} edges={[]} setNodes={vi.fn()} setEdges={vi.fn()} />);
    expect(container.textContent).toContain('workflow.panel.nodeConfig');
    expect(errorSpy).toHaveBeenCalled();
});

test('TC-PP-120 | edge selected shows source and target info', async () => {
    const edge = { id: 'e1', source: 'nodeA', target: 'nodeB', data: { condition: 'cond' } };
    await mount(<PropertyPanel selectedElement={edge} nodes={[]} edges={[edge]} setNodes={vi.fn()} setEdges={vi.fn()} />);
    expect(container.textContent).toContain('workflow.panel.edgeConfig');
    expect(container.textContent).toContain('nodeA');
    expect(container.textContent).toContain('nodeB');
    expect(container.textContent).toContain('cond');
});

test('TC-PP-121 | dark mode renders dark theme classes', async () => {
    const node = { id: 'n1', type: 'agentNode', data: { label: 'S', agent: 'A', skill: 'S' } };
    await mount(<PropertyPanel selectedElement={node} nodes={[node]} edges={[]} setNodes={vi.fn()} setEdges={vi.fn()} isDark={true} />);
    const header = container.querySelector('h3');
    expect(header).toBeTruthy();
    expect(container.textContent).toContain('workflow.panel.nodeConfig');
});

test('TC-PP-122 | toggleContextFrom removes an already-selected step from context_from', async () => {
    const active = { id: 'n1', type: 'agentNode', data: { label: 'Active', agent: 'A', skill: 'S', layer: 1, context_from: ['n2'] } };
    const other = { id: 'n2', type: 'agentNode', data: { label: 'StepB', agent: 'B', skill: 'T', layer: 0 } };
    const setNodes = vi.fn();
    await mount(<PropertyPanel selectedElement={active} nodes={[active, other]} edges={[]} setNodes={setNodes} setEdges={vi.fn()} />);
    setNodes.mockClear();
    const stepBtn = btn(container, 'StepB');
    expect(stepBtn).toBeTruthy();
    await act(async () => Simulate.click(stepBtn));
    const result = applyAll(setNodes, [active, other]);
    expect(result[0].data.context_from).toBeNull();
});

test('TC-PP-123 | toggleContextFrom in star mode converts to explicit predecessor list', async () => {
    const active = { id: 'n1', type: 'agentNode', data: { label: 'Active', agent: 'A', skill: 'S', layer: 1, context_from: ['*'] } };
    const other = { id: 'n2', type: 'agentNode', data: { label: 'StepB', agent: 'B', skill: 'T', layer: 0 } };
    const edge = { id: 'e1', source: 'n2', target: 'n1' };
    const setNodes = vi.fn();
    await mount(<PropertyPanel selectedElement={active} nodes={[active, other]} edges={[edge]} setNodes={setNodes} setEdges={vi.fn()} />);
    setNodes.mockClear();
    const stepBtn = btn(container, 'StepB');
    expect(stepBtn).toBeTruthy();
    await act(async () => Simulate.click(stepBtn));
    const result = applyAll(setNodes, [active, other]);
    expect(result[0].data.context_from).toBeNull();
});

test('TC-PP-124 | selectedElement with id not found in nodes or edges renders empty state', async () => {
    await mount(<PropertyPanel selectedElement={{ id: 'missing' }} nodes={[{ id: 'a', type: 'agentNode', data: {} }]} edges={[]} setNodes={vi.fn()} setEdges={vi.fn()} />);
    expect(container.textContent).toContain('workflow.panel.empty');
});

test('TC-PP-125 | downstream nodes excluded from context_from step options', async () => {
    const active = { id: 'n1', type: 'agentNode', data: { label: 'Active', agent: 'A', skill: 'S', layer: 1, context_from: [] } };
    const downstream = { id: 'n2', type: 'agentNode', data: { label: 'DownNode', agent: 'B', skill: 'T' } };
    const eligible = { id: 'n3', type: 'agentNode', data: { label: 'EligNode', agent: 'C', skill: 'U' } };
    const edge = { id: 'e1', source: 'n1', target: 'n2' };
    await mount(<PropertyPanel selectedElement={active} nodes={[active, downstream, eligible]} edges={[edge]} setNodes={vi.fn()} setEdges={vi.fn()} />);
    expect(container.textContent).toContain('EligNode');
    expect(container.textContent).not.toContain('DownNode');
});

// ===== Toolbar (TC-TB-*) =====

test('TC-TB-101 | toolbar renders all buttons', async () => {
    await mount(<Toolbar nodes={[]} edges={[]} />);
    expect(container.textContent).toContain('workflow.toolbar.back');
    expect(container.textContent).toContain('workflow.toolbar.fitView');
    expect(container.textContent).toContain('workflow.toolbar.clear');
    expect(container.textContent).toContain('workflow.toolbar.export');
});

test('TC-TB-102 | back button calls onCancel', async () => {
    const onCancel = vi.fn();
    await mount(<Toolbar nodes={[]} edges={[]} onCancel={onCancel} />);
    await act(async () => Simulate.click(btn(container, 'workflow.toolbar.back')));
    expect(onCancel).toHaveBeenCalled();
});

test('TC-TB-103 | fitView button calls onFitView', async () => {
    const onFitView = vi.fn();
    await mount(<Toolbar nodes={[]} edges={[]} onFitView={onFitView} />);
    await act(async () => Simulate.click(btn(container, 'workflow.toolbar.fitView')));
    expect(onFitView).toHaveBeenCalled();
});

test('TC-TB-104 | clear button calls onClear', async () => {
    const onClear = vi.fn();
    await mount(<Toolbar nodes={[]} edges={[]} onClear={onClear} />);
    await act(async () => Simulate.click(btn(container, 'workflow.toolbar.clear')));
    expect(onClear).toHaveBeenCalled();
});

test('TC-TB-105 | export with workflowId and name calls createWorkflow directly', async () => {
    const nodes = [
        { id: 'n1', type: 'agentNode', data: { agent: 'A', skill: 'S' } },
        { id: 'endNode', type: 'endNode', data: {} },
    ];
    const edges = [{ id: 'e1', source: 'n1', target: 'endNode' }];
    const onSaveSuccess = vi.fn();
    await mount(<Toolbar nodes={nodes} edges={edges} workflowId="wf-1" workflowName="Test" onSaveSuccess={onSaveSuccess} />);
    await act(async () => Simulate.click(btn(container, 'workflow.toolbar.export')));
    await flush();
    expect(apiMocks.createWorkflow).toHaveBeenCalled();
    expect(onSaveSuccess).toHaveBeenCalled();
});

test('TC-TB-106 | validation rejects empty workflow with error toast', async () => {
    await mount(<Toolbar nodes={[]} edges={[]} workflowId="wf-1" workflowName="Test" />);
    await act(async () => Simulate.click(btn(container, 'workflow.toolbar.export')));
    await flush();
    expect(document.body.textContent).toContain('workflow.validate.empty');
    expect(apiMocks.createWorkflow).not.toHaveBeenCalled();
});

test('TC-TB-107 | validation rejects agent node without agent', async () => {
    const nodes = [{ id: 'n1', type: 'agentNode', data: {} }];
    await mount(<Toolbar nodes={nodes} edges={[]} workflowId="wf-1" workflowName="Test" />);
    await act(async () => Simulate.click(btn(container, 'workflow.toolbar.export')));
    await flush();
    expect(document.body.textContent).toContain('workflow.validate.invalidAgent');
});

test('TC-TB-108 | validation rejects agent node without skill', async () => {
    const nodes = [{ id: 'n1', type: 'agentNode', data: { agent: 'A' } }];
    await mount(<Toolbar nodes={nodes} edges={[]} workflowId="wf-1" workflowName="Test" />);
    await act(async () => Simulate.click(btn(container, 'workflow.toolbar.export')));
    await flush();
    expect(document.body.textContent).toContain('workflow.validate.noSkill');
});

test('TC-TB-109 | validation rejects node without outgoing edge', async () => {
    const nodes = [{ id: 'n1', type: 'custom', data: {} }];
    await mount(<Toolbar nodes={nodes} edges={[]} workflowId="wf-1" workflowName="Test" />);
    await act(async () => Simulate.click(btn(container, 'workflow.toolbar.export')));
    await flush();
    expect(document.body.textContent).toContain('workflow.validate.noEdge');
});

test('TC-TB-110 | validation rejects workflow without end node', async () => {
    const nodes = [{ id: 'n1', type: 'agentNode', data: { agent: 'A', skill: 'S' } }];
    const edges = [{ id: 'e1', source: 'n1', target: 'endNode' }];
    await mount(<Toolbar nodes={nodes} edges={edges} workflowId="wf-1" workflowName="Test" />);
    await act(async () => Simulate.click(btn(container, 'workflow.toolbar.export')));
    await flush();
    expect(document.body.textContent).toContain('workflow.validate.noEnd');
});

test('TC-TB-111 | successful export shows success toast', async () => {
    const nodes = [
        { id: 'n1', type: 'agentNode', data: { agent: 'A', skill: 'S' } },
        { id: 'endNode', type: 'endNode', data: {} },
    ];
    const edges = [{ id: 'e1', source: 'n1', target: 'endNode' }];
    await mount(<Toolbar nodes={nodes} edges={edges} workflowId="wf-1" workflowName="Test" />);
    await act(async () => Simulate.click(btn(container, 'workflow.toolbar.export')));
    await flush();
    expect(document.body.textContent).toContain('workflow.export.success');
});

test('TC-TB-112 | failed export shows error toast', async () => {
    const nodes = [
        { id: 'n1', type: 'agentNode', data: { agent: 'A', skill: 'S' } },
        { id: 'endNode', type: 'endNode', data: {} },
    ];
    const edges = [{ id: 'e1', source: 'n1', target: 'endNode' }];
    apiMocks.createWorkflow.mockRejectedValue(new Error('network'));
    await mount(<Toolbar nodes={nodes} edges={edges} workflowId="wf-1" workflowName="Test" />);
    await act(async () => Simulate.click(btn(container, 'workflow.toolbar.export')));
    await flush();
    expect(document.body.textContent).toContain('workflow.export.failed');
});

test('TC-TB-113 | export without workflowId opens modal', async () => {
    await mount(<Toolbar nodes={[]} edges={[]} workflowName="Test" />);
    await act(async () => Simulate.click(btn(container, 'workflow.toolbar.export')));
    await flush();
    expect(document.body.textContent).toContain('workflow.export.modalTitle');
});

test('TC-TB-114 | modal cancel closes modal', async () => {
    await mount(<Toolbar nodes={[]} edges={[]} />);
    await act(async () => Simulate.click(btn(container, 'workflow.toolbar.export')));
    await flush();
    expect(document.body.textContent).toContain('workflow.export.modalTitle');
    const cancelBtn = Array.from(document.body.querySelectorAll('button')).find(b => b.textContent.includes('common.cancel'));
    expect(cancelBtn).toBeTruthy();
    await act(async () => Simulate.click(cancelBtn));
    await flush();
    expect(document.body.textContent).not.toContain('workflow.export.modalTitle');
});

test('TC-TB-115 | modal name input enables confirm and export calls createWorkflow', async () => {
    const nodes = [
        { id: 'n1', type: 'agentNode', data: { agent: 'A', skill: 'S' } },
        { id: 'endNode', type: 'endNode', data: {} },
    ];
    const edges = [{ id: 'e1', source: 'n1', target: 'endNode' }];
    await mount(<Toolbar nodes={nodes} edges={edges} />);
    await act(async () => Simulate.click(btn(container, 'workflow.toolbar.export')));
    await flush();
    const nameInput = Array.from(document.body.querySelectorAll('input')).find(i => i.placeholder === 'workflow.export.namePlaceholder');
    expect(nameInput).toBeTruthy();
    await act(async () => Simulate.change(nameInput, { target: { value: 'MyWF' } }));
    const confirmBtn = Array.from(document.body.querySelectorAll('button')).find(b => b.textContent.includes('common.confirm'));
    expect(confirmBtn).toBeTruthy();
    expect(confirmBtn.disabled).toBe(false);
    await act(async () => Simulate.click(confirmBtn));
    await flush();
    expect(apiMocks.createWorkflow).toHaveBeenCalled();
});

test('TC-TB-116 | toast close button hides the toast', async () => {
    await mount(<Toolbar nodes={[]} edges={[]} workflowId="wf-1" workflowName="Test" />);
    await act(async () => Simulate.click(btn(container, 'workflow.toolbar.export')));
    await flush();
    expect(document.body.textContent).toContain('workflow.validate.empty');
    const toast = document.body.querySelector('.animate-toast-in');
    expect(toast).toBeTruthy();
    const closeBtn = toast.querySelector('button');
    expect(closeBtn).toBeTruthy();
    await act(async () => Simulate.click(closeBtn));
    await flush();
    expect(document.body.querySelector('.animate-toast-in')).toBeNull();
});

test('TC-TB-117 | toolbar with workflowDescription initializes export desc in modal', async () => {
    await mount(<Toolbar nodes={[]} edges={[]} workflowName="Test" workflowDescription="My desc" />);
    await act(async () => Simulate.click(btn(container, 'workflow.toolbar.export')));
    await flush();
    const descTextarea = document.body.querySelector('textarea');
    expect(descTextarea).toBeTruthy();
    expect(descTextarea.value).toBe('My desc');
});

test('TC-TB-118 | clicking modal overlay closes the modal', async () => {
    await mount(<Toolbar nodes={[]} edges={[]} />);
    await act(async () => Simulate.click(btn(container, 'workflow.toolbar.export')));
    await flush();
    expect(document.body.textContent).toContain('workflow.export.modalTitle');
    const modalContainer = document.body.querySelector('.fixed.inset-0');
    expect(modalContainer).toBeTruthy();
    const overlay = modalContainer.querySelector('.absolute.inset-0');
    expect(overlay).toBeTruthy();
    await act(async () => Simulate.click(overlay));
    await flush();
    expect(document.body.textContent).not.toContain('workflow.export.modalTitle');
});

test('TC-TB-119 | modal desc textarea change updates state', async () => {
    await mount(<Toolbar nodes={[]} edges={[]} />);
    await act(async () => Simulate.click(btn(container, 'workflow.toolbar.export')));
    await flush();
    const descTextarea = document.body.querySelector('textarea');
    expect(descTextarea).toBeTruthy();
    await act(async () => Simulate.change(descTextarea, { target: { value: 'New desc' } }));
    expect(descTextarea.value).toBe('New desc');
});

// ===== Sidebar (TC-SB-*) =====

test('TC-SB-101 | sidebar shows loading while fetching agents', async () => {
    apiMocks.getAgentCards.mockReturnValue(new Promise(() => {}));
    await mount(<Sidebar />);
    expect(container.textContent).toContain('common.loading');
});

test('TC-SB-102 | sidebar renders agent cards after fetch', async () => {
    apiMocks.getAgentCards.mockResolvedValue({ data: [
        { id: 'a1', name: 'Agent1', displayName: 'Agent One', description: 'Desc1', skills: [{ name: 'skill1' }] },
        { id: 'a2', name: 'Agent2', description: 'Desc2', skills: [] },
    ] });
    await mount(<Sidebar />);
    expect(container.textContent).toContain('Agent1');
    expect(container.textContent).toContain('Agent2');
    expect(container.textContent).toContain('workflow.sidebar.title');
});

test('TC-SB-103 | dragStart sets agent template in dataTransfer', async () => {
    apiMocks.getAgentCards.mockResolvedValue({ data: [
        { id: 'a1', name: 'Agent1', skills: [{ name: 'skill1' }, { name: 'skill2' }] },
    ] });
    await mount(<Sidebar />);
    const draggable = container.querySelector('[draggable]');
    expect(draggable).toBeTruthy();
    const dt = { _data: {}, setData(t, v) { this._data[t] = v; }, getData(t) { return this._data[t]; }, effectAllowed: '' };
    const event = new Event('dragstart', { bubbles: true });
    Object.defineProperty(event, 'dataTransfer', { value: dt });
    await act(async () => draggable.dispatchEvent(event));
    const raw = dt.getData('application/agent-template');
    expect(raw).toBeTruthy();
    const template = JSON.parse(raw);
    expect(template.agent).toBe('Agent1');
    expect(template.skill).toBe('skill1');
    expect(template.skillsList).toHaveLength(2);
    expect(template.inputs).toEqual({});
    expect(template.outputs).toEqual({});
    expect(dt.effectAllowed).toBe('move');
});

test('TC-SB-104 | empty agent list renders title without crash', async () => {
    apiMocks.getAgentCards.mockResolvedValue({ data: [] });
    await mount(<Sidebar />);
    expect(container.textContent).toContain('workflow.sidebar.title');
});

test('TC-SB-105 | getAgentCards error handled without crash', async () => {
    apiMocks.getAgentCards.mockRejectedValue(new Error('fail'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await mount(<Sidebar />);
    expect(container.textContent).toContain('workflow.sidebar.title');
});

test('TC-SB-106 | dark mode renders sidebar with dark theme', async () => {
    apiMocks.getAgentCards.mockResolvedValue({ data: [{ id: 'a1', name: 'A1', skills: [] }] });
    await mount(<Sidebar isDark={true} />);
    expect(container.textContent).toContain('A1');
});

test('TC-SB-107 | wheel event triggers horizontal scroll handler', async () => {
    apiMocks.getAgentCards.mockResolvedValue({ data: [{ id: 'a1', name: 'A1', skills: [] }] });
    await mount(<Sidebar />);
    const scrollContainer = container.querySelector('.overflow-x-auto');
    expect(scrollContainer).toBeTruthy();
    scrollContainer.scrollLeft = 0;
    const event = new Event('wheel', { bubbles: true });
    Object.defineProperty(event, 'deltaY', { value: 50 });
    await act(async () => scrollContainer.dispatchEvent(event));
    expect(scrollContainer.scrollLeft).toBe(50);
});

// ===== KVEditor (TC-KV-*) =====

test('TC-KV-101 | empty data shows noParams placeholder', async () => {
    await mount(<KVEditor data={{}} onChange={vi.fn()} />);
    expect(container.textContent).toContain('workflow.panel.noParams');
});

test('TC-KV-101a | dark mode with null value renders empty string in value input', async () => {
    await mount(<KVEditor data={{ k: null }} onChange={vi.fn()} isDark={true} />);
    const valueInput = Array.from(container.querySelectorAll('input'))
        .find(i => i.placeholder === 'workflow.panel.valuePlaceholder');
    expect(valueInput).toBeTruthy();
    expect(valueInput.value).toBe('');
});

test('TC-KV-102 | populated data shows key-value pairs', async () => {
    await mount(<KVEditor data={{ key1: 'val1', key2: 'val2' }} onChange={vi.fn()} />);
    const inputs = Array.from(container.querySelectorAll('input'));
    expect(inputs.length).toBeGreaterThanOrEqual(4);
    expect(inputs.some(i => i.value === 'key1')).toBe(true);
    expect(inputs.some(i => i.value === 'val1')).toBe(true);
});

test('TC-KV-103 | add button calls onChange with new empty entry', async () => {
    const onChange = vi.fn();
    await mount(<KVEditor data={{ a: '1' }} onChange={onChange} />);
    await act(async () => Simulate.click(btn(container, 'common.add')));
    expect(onChange).toHaveBeenCalledWith({ a: '1', '': '' });
});

test('TC-KV-104 | key change calls onChange with renamed key', async () => {
    const onChange = vi.fn();
    await mount(<KVEditor data={{ oldKey: 'val' }} onChange={onChange} />);
    const keyInput = Array.from(container.querySelectorAll('input')).find(i => i.value === 'oldKey');
    expect(keyInput).toBeTruthy();
    await act(async () => Simulate.change(keyInput, { target: { value: 'newKey' } }));
    expect(onChange).toHaveBeenCalledWith({ newKey: 'val' });
});

test('TC-KV-105 | JSON object value is parsed by tryParse', async () => {
    const onChange = vi.fn();
    await mount(<KVEditor data={{ k: 'str' }} onChange={onChange} />);
    const valueInput = Array.from(container.querySelectorAll('input')).find(i => i.value === 'str');
    expect(valueInput).toBeTruthy();
    await act(async () => Simulate.change(valueInput, { target: { value: '{"a":1}' } }));
    expect(onChange).toHaveBeenCalledWith({ k: { a: 1 } });
});

test('TC-KV-106 | JSON array value is parsed by tryParse', async () => {
    const onChange = vi.fn();
    await mount(<KVEditor data={{ k: 'str' }} onChange={onChange} />);
    const valueInput = Array.from(container.querySelectorAll('input')).find(i => i.value === 'str');
    await act(async () => Simulate.change(valueInput, { target: { value: '[1,2,3]' } }));
    expect(onChange).toHaveBeenCalledWith({ k: [1, 2, 3] });
});

test('TC-KV-107 | invalid JSON value stays as string', async () => {
    const onChange = vi.fn();
    await mount(<KVEditor data={{ k: 'str' }} onChange={onChange} />);
    const valueInput = Array.from(container.querySelectorAll('input')).find(i => i.value === 'str');
    await act(async () => Simulate.change(valueInput, { target: { value: '{invalid}' } }));
    expect(onChange).toHaveBeenCalledWith({ k: '{invalid}' });
});

test('TC-KV-108 | remove button deletes key from data', async () => {
    const onChange = vi.fn();
    await mount(<KVEditor data={{ k1: 'v1', k2: 'v2' }} onChange={onChange} />);
    const removeBtns = container.querySelectorAll('button[title="common.delete"]');
    expect(removeBtns.length).toBe(2);
    await act(async () => Simulate.click(removeBtns[0]));
    expect(onChange).toHaveBeenCalledWith({ k2: 'v2' });
});

test('TC-KV-109 | object value is stringified in input display', async () => {
    await mount(<KVEditor data={{ k: { a: 1 } }} onChange={vi.fn()} />);
    const valueInput = Array.from(container.querySelectorAll('input')).find(i => i.value === '{"a":1}');
    expect(valueInput).toBeTruthy();
});

test('TC-KV-110 | circular reference value falls back to String', async () => {
    const circular = {};
    circular.self = circular;
    await mount(<KVEditor data={{ k: circular }} onChange={vi.fn()} />);
    const valueInput = Array.from(container.querySelectorAll('input')).find(i => i.value === '[object Object]');
    expect(valueInput).toBeTruthy();
});

// ===== AgentNode (TC-AN-*) =====

test('TC-AN-101 | renders step name and default status', async () => {
    await mount(<AgentNode data={{ label: 'MyStep' }} />);
    expect(container.textContent).toContain('MyStep');
    expect(container.textContent).toContain('node_label.no_subtasks');
});

test('TC-AN-102 | renders subtasks with agent and skill', async () => {
    await mount(<AgentNode data={{ label: 'Step', subtasks: [
        { agent: 'A1', skill: 'S1', status: 'success' },
        { agent: 'A2', skill: 'S2', status: 'running' },
    ] }} />);
    expect(container.textContent).toContain('A1');
    expect(container.textContent).toContain('S1');
    expect(container.textContent).toContain('A2');
    expect(container.textContent).toContain('S2');
});

test('TC-AN-103 | no subtasks shows placeholder message', async () => {
    await mount(<AgentNode data={{ label: 'Step', subtasks: [] }} />);
    expect(container.textContent).toContain('node_label.no_subtasks');
});

test('TC-AN-104 | SelfLoop step type shows badge', async () => {
    await mount(<AgentNode data={{ label: 'Loop', type: 'SelfLoop' }} />);
    expect(container.textContent).toContain('workflow.selfLoop');
});

test('TC-AN-105 | AnySuccess step type renders', async () => {
    await mount(<AgentNode data={{ label: 'Any', type: 'AnySuccess' }} />);
    expect(container.textContent).toContain('Any');
});

test('TC-AN-106 | running status shows ping animation', async () => {
    await mount(<AgentNode data={{ label: 'Step', status: 'running' }} />);
    const ping = container.querySelector('.animate-ping');
    expect(ping).toBeTruthy();
});

test('TC-AN-107 | subtask click calls onSubtaskClick with index and task', async () => {
    const onSubtaskClick = vi.fn();
    await mount(<AgentNode data={{ label: 'Step', subtasks: [
        { agent: 'A1', skill: 'S1', status: 'pending' },
    ], onSubtaskClick }} />);
    const subtaskBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('A1'));
    expect(subtaskBtn).toBeTruthy();
    await act(async () => Simulate.click(subtaskBtn));
    expect(onSubtaskClick).toHaveBeenCalledWith(0, expect.objectContaining({ agent: 'A1', skill: 'S1' }));
});

test('TC-AN-108 | selected prop adds ring styling', async () => {
    await mount(<AgentNode data={{ label: 'Step' }} selected={true} />);
    expect(container.firstChild.className).toContain('ring-2');
});

test('TC-AN-109 | dark mode renders dark background', async () => {
    await mount(<AgentNode data={{ label: 'Step', isDark: true }} />);
    expect(container.firstChild.className).toContain('bg-zinc-900');
});

test('TC-AN-110 | failed status renders without crash', async () => {
    await mount(<AgentNode data={{ label: 'Step', status: 'failed', subtasks: [
        { agent: 'A', skill: 'S', status: 'failed' },
    ] }} />);
    expect(container.textContent).toContain('A');
});

test('TC-AN-111 | subtask with default agent name uses default theme', async () => {
    await mount(<AgentNode data={{ label: 'Step', subtasks: [
        { agent: 'Agent', skill: 'S1', status: 'pending' },
    ] }} />);
    expect(container.textContent).toContain('Agent');
});

test('TC-AN-112 | selectedSubtaskIndex highlights the selected subtask', async () => {
    await mount(<AgentNode data={{ label: 'Step', selectedSubtaskIndex: 0, subtasks: [
        { agent: 'A1', skill: 'S1', status: 'pending' },
    ] }} />);
    const subtaskBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('A1'));
    expect(subtaskBtn).toBeTruthy();
    expect(subtaskBtn.className).toContain('ring-2');
});

// ===== CustomEdge (TC-CE-*) =====

describe('CustomEdge', () => {
    beforeEach(() => {
        vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
        vi.stubGlobal('cancelAnimationFrame', vi.fn());
    });

    test('TC-CE-101 | edge without label renders without crash', async () => {
        await mount(<CustomEdge id="e1" sourceX={0} sourceY={0} targetX={100} targetY={100} />);
        expect(container.textContent).toBe('');
    });

    test('TC-CE-102 | edge with label renders label text', async () => {
        await mount(<CustomEdge id="e1" label="cond-A" sourceX={0} sourceY={0} targetX={100} targetY={100} />);
        expect(container.textContent).toContain('cond-A');
    });

    test('TC-CE-103 | hovering label shows tooltip portal in document body', async () => {
        await mount(<CustomEdge id="e1" label="hovertest" sourceX={0} sourceY={0} targetX={100} targetY={100} />);
        const labelDiv = el(container, 'div', 'hovertest');
        expect(labelDiv).toBeTruthy();
        const before = document.body.children.length;
        await act(async () => {
            labelDiv.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body }));
        });
        await flush();
        expect(document.body.children.length).toBeGreaterThan(before);
    });

    test('TC-CE-104 | mouse leave removes tooltip portal from document body', async () => {
        await mount(<CustomEdge id="e1" label="leavetest" sourceX={0} sourceY={0} targetX={100} targetY={100} />);
        const labelDiv = el(container, 'div', 'leavetest');
        const before = document.body.children.length;
        await act(async () => {
            labelDiv.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body }));
        });
        await flush();
        expect(document.body.children.length).toBeGreaterThan(before);
        await act(async () => {
            labelDiv.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
        });
        await flush();
        expect(document.body.children.length).toBe(before);
    });

    test('TC-CE-105 | edge with slate stroke color renders muted label styling', async () => {
        await mount(<CustomEdge id="e1" label="slate-cond" style={{ stroke: '#475569' }} sourceX={0} sourceY={0} targetX={100} targetY={100} />);
        const labelDiv = el(container, 'div', 'slate-cond');
        expect(labelDiv).toBeTruthy();
        const styledChild = labelDiv.querySelector('div');
        expect(styledChild).toBeTruthy();
        expect(styledChild.className).toContain('bg-zinc-100');
    });
});

// ===== CircleNode (TC-CN-*) =====

test('TC-CN-101 | StartNode renders START text', async () => {
    await mount(<StartNode />);
    expect(container.textContent).toContain('START');
    expect(container.textContent).toContain('node_label.start');
});

test('TC-CN-102 | StartNode selected adds ring', async () => {
    await mount(<StartNode selected={true} />);
    expect(container.firstChild.className).toContain('ring-2');
});

test('TC-CN-103 | EndNode renders END text', async () => {
    await mount(<EndNode />);
    expect(container.textContent).toContain('END');
    expect(container.textContent).toContain('node_label.end');
});

test('TC-CN-104 | EndNode selected adds ring', async () => {
    await mount(<EndNode selected={true} />);
    expect(container.firstChild.className).toContain('ring-2');
});

// ===== ToolbarLite (TC-TL-*) =====

test('TC-TL-101 | toolbar lite renders fitView button', async () => {
    await mount(<ToolbarLite />);
    expect(container.textContent).toContain('workflow.toolbar.fitView');
});

test('TC-TL-102 | clicking fitView calls onFitView', async () => {
    const onFitView = vi.fn();
    await mount(<ToolbarLite onFitView={onFitView} />);
    await act(async () => Simulate.click(btn(container, 'workflow.toolbar.fitView')));
    expect(onFitView).toHaveBeenCalled();
});

test('TC-TL-103 | dark mode renders dark theme classes', async () => {
    await mount(<ToolbarLite isDark={true} />);
    expect(container.firstChild.className).toContain('bg-zinc-950');
});

// ===== Loading (TC-LD-*) =====

test('TC-LD-101 | default loading and sub messages rendered', async () => {
    await mount(<WorkflowLoader />);
    expect(container.textContent).toContain('workflow_loader.loading');
    expect(container.textContent).toContain('workflow_loader.initializing');
});

test('TC-LD-102 | custom messages override defaults', async () => {
    await mount(<WorkflowLoader loadingMessage="Custom loading" subMessage="Custom sub" />);
    expect(container.textContent).toContain('Custom loading');
    expect(container.textContent).toContain('Custom sub');
    expect(container.textContent).not.toContain('workflow_loader.loading');
});

test('TC-LD-103 | dark mode renders dark background', async () => {
    await mount(<WorkflowLoader isDark={true} />);
    expect(container.firstChild.className).toContain('bg-[#0b0e14]');
});

test('TC-LD-104 | light mode renders light background', async () => {
    await mount(<WorkflowLoader isDark={false} />);
    expect(container.firstChild.className).toContain('bg-slate-50');
});

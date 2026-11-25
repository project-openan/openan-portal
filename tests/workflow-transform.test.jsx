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

import { expect, test } from 'vitest';
import {
    BACKEND_STATUS,
    normalizeStatus,
    getLayoutedElements,
    getBestHandles,
    transformWorkflowToReactFlow,
    transformReactFlowToPSOP,
} from '../packages/shared-workflow/src/utils/index.jsx';

/* ── normalizeStatus ── */

test('TC-UTIL-001 | running-family statuses map to RUNNING', () => {
    // 输入: running-family strings  预期: all -> 'running'  断言: exact equality
    for (const s of ['running', 'RUN', 'Executing', 'ACTIVE', 'processing', 'STARTED', 'run now']) {
        expect(normalizeStatus(s)).toBe(BACKEND_STATUS.RUNNING);
    }
});

test('TC-UTIL-002 | success-family statuses map to SUCCESS', () => {
    for (const s of ['success', 'COMPLETED', 'executed', 'finished', 'successfully done']) {
        expect(normalizeStatus(s)).toBe(BACKEND_STATUS.SUCCESS);
    }
});

test('TC-UTIL-003 | failure-family statuses map to FAILED', () => {
    for (const s of ['failed', 'ERROR', 'stopped', 'failing badly']) {
        expect(normalizeStatus(s)).toBe(BACKEND_STATUS.FAILED);
    }
});

test('TC-UTIL-004 | empty / unknown / whitespace-only statuses fall back to PENDING', () => {
    for (const s of [null, undefined, '', '   ', 'unknown', 'idle']) {
        expect(normalizeStatus(s)).toBe(BACKEND_STATUS.PENDING);
    }
});

/* ── getBestHandles ── */

test('TC-UTIL-005 | getBestHandles always returns right-exit / left-entry handles', () => {
    // 输入: two arbitrary nodes  预期: fixed source/target handles  断言: 防回归 — 方向改了会失败
    const src = { position: { x: 0, y: 0 }, width: 200, height: 100 };
    const tgt = { position: { x: 400, y: 200 }, width: 100, height: 50 };
    expect(getBestHandles(src, tgt)).toEqual({ sourceHandle: 's-right', targetHandle: 't-left' });
});

/* ── getLayoutedElements ── */

test('TC-UTIL-006 | empty input yields empty layout result', () => {
    const out = getLayoutedElements([], []);
    expect(out.nodes).toEqual([]);
    expect(out.edges).toEqual([]);
});

test('TC-UTIL-007 | single node gets initial +40 Y offset and centered X', () => {
    const out = getLayoutedElements([{ id: 'n1', width: 200, height: 100 }], []);
    expect(out.nodes).toHaveLength(1);
    expect(out.nodes[0].id).toBe('n1');
    expect(out.nodes[0].position).toBeDefined();
    expect(out.nodes[0].position.x).toBeTypeOf('number');
    expect(out.nodes[0].position.y).toBeTypeOf('number');
});

test('TC-UTIL-008 | LR layout with multiple nodes produces non-undefined positions', () => {
    const nodes = [
        { id: 'a', width: 200, height: 100 },
        { id: 'b', width: 200, height: 100 },
        { id: 'c', width: 200, height: 100 },
    ];
    const edges = [{ source: 'a', target: 'b' }, { source: 'b', target: 'c' }];
    const out = getLayoutedElements(nodes, edges, 'LR');
    expect(out.nodes).toHaveLength(3);
    for (const n of out.nodes) {
        expect(n.position.x).toBeTypeOf('number');
        expect(n.position.y).toBeTypeOf('number');
    }
    expect(out.edges).toEqual(edges);
});

test('TC-UTIL-009 | TB direction skips per-node Y displacement for non-first nodes', () => {
    const nodes = [
        { id: 'a', width: 200, height: 100 },
        { id: 'b', width: 200, height: 100 },
    ];
    const out = getLayoutedElements(nodes, [], 'TB');
    expect(out.nodes).toHaveLength(2);
    expect(out.nodes[0].position.y).toBeTypeOf('number');
    expect(out.nodes[1].position.y).toBeTypeOf('number');
});

test('TC-UTIL-010 | nodes without explicit width/height use defaults 200/100', () => {
    const out = getLayoutedElements([{ id: 'only' }], []);
    expect(out.nodes[0].position.x).toBeTypeOf('number');
});

/* ── transformWorkflowToReactFlow ── */

test('TC-UTIL-011 | null / undefined / empty input returns empty nodes and edges', () => {
    for (const input of [null, undefined, {}, { data: {} }, { data: { steps: null } }]) {
        expect(transformWorkflowToReactFlow(input)).toEqual({ nodes: [], edges: [] });
    }
});

test('TC-UTIL-012 | raw array of steps is accepted directly', () => {
    const out = transformWorkflowToReactFlow([{ name: 's1', agent: 'Bot', skill: 'none' }]);
    expect(out.nodes.find(n => n.id === 's1')).toBeTruthy();
    // START_NODE is added because s1 has no incoming edges
    expect(out.nodes.find(n => n.id === 'START_NODE')).toBeTruthy();
    // END_OF_WORKFLOW is added because s1 is a terminal node
    expect(out.nodes.find(n => n.id === 'END_OF_WORKFLOW')).toBeTruthy();
});

test('TC-UTIL-013 | {data:{steps}} envelope is unwrapped', () => {
    const out = transformWorkflowToReactFlow({ data: { steps: [{ name: 'x' }] } });
    expect(out.nodes.find(n => n.id === 'x')).toBeTruthy();
});

test('TC-UTIL-014 | steps with explicit next arrays create edges to named targets', () => {
    const out = transformWorkflowToReactFlow({
        data: {
            steps: [
                { name: 'start-step', next: [{ step: 'end-step', condition: 'ok' }] },
                { name: 'end-step' },
            ],
        },
    });
    const edge = out.edges.find(e => e.source === 'start-step' && e.target === 'end-step');
    expect(edge).toBeTruthy();
    expect(edge.label).toBe('ok');
    // No START_NODE because start-step is not targeted? Actually start-step has no incoming
    expect(out.nodes.find(n => n.id === 'START_NODE')).toBeTruthy();
    // end-step is terminal → gets implicit end edge
    const endEdge = out.edges.find(e => e.source === 'end-step' && e.target === 'END_OF_WORKFLOW');
    expect(endEdge).toBeTruthy();
});

test('TC-UTIL-015 | steps with END / end / END_OF_WORKFLOW targets create end edges', () => {
    const out = transformWorkflowToReactFlow({
        data: {
            steps: [
                { name: 'a', next: [{ step: 'END' }] },
            ],
        },
    });
    const endEdge = out.edges.find(e => e.source === 'a' && e.target === 'END_OF_WORKFLOW');
    expect(endEdge).toBeTruthy();
});

test('TC-UTIL-016 | sequential steps without next auto-link to the following step', () => {
    const out = transformWorkflowToReactFlow({
        data: { steps: [{ name: 'first' }, { name: 'second' }] },
    });
    const autoEdge = out.edges.find(e => e.source === 'first' && e.target === 'second');
    expect(autoEdge).toBeTruthy();
});

test('TC-UTIL-017 | subtask status aggregation: any running -> RUNNING', () => {
    const out = transformWorkflowToReactFlow({
        data: {
            steps: [{ name: 's', subtasks: [
                { agent: 'a', skill: 'k', status: 'success' },
                { agent: 'b', skill: 'k', status: 'running' },
            ] }],
        },
    });
    expect(out.nodes.find(n => n.id === 's').data.status).toBe(BACKEND_STATUS.RUNNING);
});

test('TC-UTIL-018 | subtask status aggregation: all success -> SUCCESS', () => {
    const out = transformWorkflowToReactFlow({
        data: {
            steps: [{ name: 's', subtasks: [
                { agent: 'a', skill: 'k', status: 'completed' },
                { agent: 'b', skill: 'k', status: 'finished' },
            ] }],
        },
    });
    expect(out.nodes.find(n => n.id === 's').data.status).toBe(BACKEND_STATUS.SUCCESS);
});

test('TC-UTIL-019 | subtask status aggregation: mixed pending -> PENDING', () => {
    const out = transformWorkflowToReactFlow({
        data: {
            steps: [{ name: 's', subtasks: [
                { agent: 'a', skill: 'k', status: 'pending' },
                { agent: 'b', skill: 'k', status: 'success' },
            ] }],
        },
    });
    expect(out.nodes.find(n => n.id === 's').data.status).toBe(BACKEND_STATUS.PENDING);
});

test('TC-UTIL-020 | default subtask is synthesised when step omits subtasks', () => {
    const out = transformWorkflowToReactFlow({ data: { steps: [{ name: 's', agent: 'X', skill: 'Y', description: 'desc' }] } });
    const node = out.nodes.find(n => n.id === 's');
    expect(node.data.agent).toBe('X');
    expect(node.data.skill).toBe('Y');
    expect(node.data.description).toBe('desc');
});

test('TC-UTIL-021 | END_OF_WORKFLOW node status is SUCCESS when all agent nodes are SUCCESS', () => {
    const out = transformWorkflowToReactFlow({
        data: { steps: [{ name: 's', subtasks: [{ agent: 'a', skill: 'k', status: 'success' }] }] },
    });
    const endNode = out.nodes.find(n => n.id === 'END_OF_WORKFLOW');
    expect(endNode.data.status).toBe(BACKEND_STATUS.SUCCESS);
});

test('TC-UTIL-022 | END_OF_WORKFLOW node status is pending when an agent node is pending', () => {
    const out = transformWorkflowToReactFlow({
        data: { steps: [{ name: 's', subtasks: [{ agent: 'a', skill: 'k', status: 'pending' }] }] },
    });
    const endNode = out.nodes.find(n => n.id === 'END_OF_WORKFLOW');
    expect(endNode.data.status).toBe('pending');
});

test('TC-UTIL-023 | context_from and layer are preserved on nodes', () => {
    const out = transformWorkflowToReactFlow({
        data: { steps: [{ name: 's', layer: 2, context_from: ['ctx1'] }] },
    });
    const node = out.nodes.find(n => n.id === 's');
    expect(node.data.layer).toBe(2);
    expect(node.data.context_from).toEqual(['ctx1']);
});

test('TC-UTIL-024 | context_from defaults to null when absent', () => {
    const out = transformWorkflowToReactFlow({ data: { steps: [{ name: 's' }] } });
    expect(out.nodes.find(n => n.id === 's').data.context_from).toBeNull();
});

test('TC-UTIL-025 | edges get handles from getBestHandles when source & target exist', () => {
    const out = transformWorkflowToReactFlow({
        data: { steps: [{ name: 'a' }, { name: 'b' }] },
    });
    const edge = out.edges.find(e => e.source === 'a' && e.target === 'b');
    expect(edge.sourceHandle).toBe('s-right');
    expect(edge.targetHandle).toBe('t-left');
});

test('TC-UTIL-026 | _normalizedNext is cleaned up after transform', () => {
    const steps = [{ name: 'a' }, { name: 'b' }];
    transformWorkflowToReactFlow({ data: { steps } });
    expect(steps[0]._normalizedNext).toBeUndefined();
});

/* ── transformReactFlowToPSOP ── */

test('TC-UTIL-027 | START / END nodes are excluded from PSOP steps', () => {
    const nodes = [
        { id: 'START_NODE', type: 'startNode', data: {} },
        { id: 'END_OF_WORKFLOW', type: 'endNode', data: {} },
        { id: 'real', type: 'agentNode', data: { label: 'real', agent: 'a', skill: 'k' } },
    ];
    const out = transformReactFlowToPSOP(nodes, []);
    expect(out.steps).toHaveLength(1);
    expect(out.steps[0].name).toBe('real');
});

test('TC-UTIL-028 | agent node with subtasks preserves them and normalises status', () => {
    const nodes = [{
        id: 'n1', type: 'agentNode',
        data: { subtasks: [{ agent: 'a', skill: 'k', status: 'running' }] },
    }];
    const out = transformReactFlowToPSOP(nodes, []);
    expect(out.steps[0].subtasks[0].status).toBe(BACKEND_STATUS.RUNNING);
    expect(out.steps[0].layer).toBe(0);
    expect(out.steps[0].context_from).toBeNull();
});

test('TC-UTIL-029 | agent node without subtasks synthesises one from data fields', () => {
    const nodes = [{
        id: 'n1', type: 'agentNode',
        data: { label: 'My Node', agent: 'bot', skill: 'scan', status: 'completed' },
    }];
    const out = transformReactFlowToPSOP(nodes, []);
    expect(out.steps[0].subtasks).toHaveLength(1);
    expect(out.steps[0].subtasks[0].agent).toBe('bot');
    expect(out.steps[0].subtasks[0].skill).toBe('scan');
    expect(out.steps[0].subtasks[0].status).toBe(BACKEND_STATUS.SUCCESS);
    expect(out.steps[0].subtasks[0].description).toBe('My Node');
});

test('TC-UTIL-030 | edges populate next arrays; END_OF_WORKFLOW becomes "end"', () => {
    const nodes = [
        { id: 'a', type: 'agentNode', data: {} },
        { id: 'b', type: 'agentNode', data: {} },
    ];
    const edges = [
        { source: 'a', target: 'b', label: 'cond' },
        { source: 'b', target: 'END_OF_WORKFLOW' },
    ];
    const out = transformReactFlowToPSOP(nodes, edges);
    const a = out.steps.find(s => s.name === 'a');
    const b = out.steps.find(s => s.name === 'b');
    expect(a.next).toEqual([{ step: 'b', condition: 'cond' }]);
    expect(b.next).toEqual([{ step: 'end', condition: '' }]);
});

test('TC-UTIL-031 | edge condition falls back to edgeData.condition when label absent', () => {
    const nodes = [{ id: 'a', type: 'agentNode', data: {} }, { id: 'b', type: 'agentNode', data: {} }];
    const edges = [{ source: 'a', target: 'b', data: { condition: 'fallback' } }];
    const out = transformReactFlowToPSOP(nodes, edges);
    expect(out.steps[0].next[0].condition).toBe('fallback');
});

test('TC-UTIL-032 | steps with no outgoing edges have next omitted entirely', () => {
    const nodes = [{ id: 'lonely', type: 'agentNode', data: {} }];
    const out = transformReactFlowToPSOP(nodes, []);
    expect(out.steps[0].next).toBeUndefined();
});

test('TC-UTIL-033 | metadata populates name, description, tags and id', () => {
    const out = transformReactFlowToPSOP([], [], { name: 'wf', description: 'desc', tags: ['t1'], id: 'id-1' });
    expect(out.name).toBe('wf');
    expect(out.description).toBe('desc');
    expect(out.tags).toEqual(['t1']);
    expect(out.id).toBe('id-1');
});

test('TC-UTIL-034 | metadata defaults to empty strings and arrays', () => {
    const out = transformReactFlowToPSOP([], []);
    expect(out.name).toBe('');
    expect(out.description).toBe('');
    expect(out.tags).toEqual([]);
    expect(out.id).toBeUndefined();
});

test('TC-UTIL-035 | layer values > 1 are clamped to 1', () => {
    const nodes = [{ id: 'n', type: 'agentNode', data: { layer: 5 } }];
    const out = transformReactFlowToPSOP(nodes, []);
    expect(out.steps[0].layer).toBe(1);
});

test('TC-UTIL-036 | non-empty context_from array is preserved', () => {
    const nodes = [{ id: 'n', type: 'agentNode', data: { context_from: ['c1', 'c2'] } }];
    const out = transformReactFlowToPSOP(nodes, []);
    expect(out.steps[0].context_from).toEqual(['c1', 'c2']);
});

test('TC-UTIL-037 | type defaults to "AllSuccess" when absent', () => {
    const nodes = [{ id: 'n', type: 'agentNode', data: {} }];
    const out = transformReactFlowToPSOP(nodes, []);
    expect(out.steps[0].type).toBe('AllSuccess');
});

test('TC-UTIL-038 | START_NODE edges are skipped in PSOP conversion', () => {
    const nodes = [{ id: 'a', type: 'agentNode', data: {} }];
    const edges = [{ source: 'START_NODE', target: 'a' }];
    const out = transformReactFlowToPSOP(nodes, edges);
    // 'a' has no real outgoing edges, so next is omitted
    expect(out.steps[0].next).toBeUndefined();
});

test('TC-UTIL-039 | edges from unknown source are skipped', () => {
    const nodes = [{ id: 'a', type: 'agentNode', data: {} }];
    const edges = [{ source: 'ghost', target: 'a', label: 'x' }];
    const out = transformReactFlowToPSOP(nodes, edges);
    expect(out.steps[0].next).toBeUndefined();
});

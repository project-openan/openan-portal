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
import { Position } from '@xyflow/react';
import { getEdgeParams } from '../packages/shared-workflow/src/CustomEdges/FloatingEdge/utils.js';

const makeNode = (x, y, w = 200, h = 100) => ({
    measured: { width: w, height: h },
    internals: { positionAbsolute: { x, y } },
    x, y,
});

/* ── getEdgeParams ── */

test('TC-FEDGE-001 | params computed for a left-to-right pair', () => {
    // 输入: source left of target  预期: sx/sy/tx/ty numbers, sourcePos Right, targetPos Left  断言: 防回归
    const src = makeNode(0, 0);
    const tgt = makeNode(400, 0);
    const p = getEdgeParams(src, tgt);
    expect(p.sx).toBeTypeOf('number');
    expect(p.sy).toBeTypeOf('number');
    expect(p.tx).toBeTypeOf('number');
    expect(p.ty).toBeTypeOf('number');
    expect(p.sourcePos).toBe(Position.Right);
    expect(p.targetPos).toBe(Position.Left);
});

test('TC-FEDGE-002 | right-to-left yields source Left / target Right', () => {
    const src = makeNode(400, 0);
    const tgt = makeNode(0, 0);
    const p = getEdgeParams(src, tgt);
    expect(p.sourcePos).toBe(Position.Left);
    expect(p.targetPos).toBe(Position.Right);
});

test('TC-FEDGE-003 | target directly above source yields Top positions', () => {
    // source at bottom, target at top — intersection point at top of source
    const src = makeNode(0, 400);
    const tgt = makeNode(0, 0);
    const p = getEdgeParams(src, tgt);
    // intersection on source is at its top edge → sourcePos Top
    expect(p.sourcePos).toBe(Position.Top);
});

test('TC-FEDGE-004 | same-origin nodes still return numeric params', () => {
    const a = makeNode(0, 0);
    const p = getEdgeParams(a, a);
    expect(p.sx).toBeTypeOf('number');
    expect(p.tx).toBeTypeOf('number');
});

test('TC-FEDGE-005 | non-square dimensions compute valid positions', () => {
    const src = makeNode(0, 0, 300, 50);
    const tgt = makeNode(500, 200, 50, 300);
    const p = getEdgeParams(src, tgt);
    // Position is one of Left/Right/Top/Bottom — assert it's a valid enum value
    expect([Position.Left, Position.Right, Position.Top, Position.Bottom]).toContain(p.sourcePos);
    expect([Position.Left, Position.Right, Position.Top, Position.Bottom]).toContain(p.targetPos);
    expect(p.sx).toBeTypeOf('number');
    expect(p.tx).toBeTypeOf('number');
});

test('TC-FEDGE-006 | bottom edge position when intersection lands at bottom', () => {
    const src = makeNode(0, 0);
    const tgt = makeNode(0, 500);
    const p = getEdgeParams(src, tgt);
    expect(p.sourcePos).toBe(Position.Bottom);
});

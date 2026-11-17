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
import { expect, test, vi } from 'vitest';
vi.mock('../portal/src/service/api.js', () => ({ getAgentCards: async () => ({ data: [] }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key }) }));
import PropertyPanel from '../packages/shared-workflow/src/property_panel/index.jsx';

test('selection changes between empty, node, edge and removed node without hook-order crashes', async () => {
    const container = document.createElement('div'); document.body.appendChild(container); const root = createRoot(container);
    const node = { id: 'a', type: 'agentNode', data: { label: 'Agent' } };
    const edge = { id: 'e', source: 'a', target: 'b', data: {} };
    const props = { nodes: [node], edges: [edge], setNodes: vi.fn(), setEdges: vi.fn(), onDelete: vi.fn(), onClose: vi.fn() };
    try {
        for (const selectedElement of [null, node, edge, { id: 'missing' }, node, null]) {
            await act(async () => root.render(<PropertyPanel {...props} selectedElement={selectedElement} />));
            expect(container.textContent).not.toBe('');
        }
    } finally { await act(async () => root.unmount()); container.remove(); }
});

// Copyright (c) 2026 Huawei Technologies Co., Ltd.
// All Rights Reserved.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Regression tests for the orchestration-center solution-packages list.
 *
 * Background: the plugin's packages view once rendered a hardcoded
 * MOCK_PACKAGES list (3 demo entries). A portal dist deploy shipped that
 * mock version and the live UI silently showed 3 fake packages instead of
 * the 19 real ones from the backend. These tests pin the real behavior:
 * the list MUST come from GET /rest/v1/orchestrate/solution-packages and
 * MUST NEVER fall back to hardcoded demo data.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { beforeEach, afterEach, expect, test, vi } from 'vitest';
vi.mock('@openan/shared-workflow', () => ({ UnifiedWorkflow: () => null, transformWorkflowToReactFlow: () => ({ nodes: [], edges: [] }) }));
import OrchestrationCenter from '../plugins/orchestration-center/src/index.jsx';
import { PortalProvider } from '@openan/portal-sdk';
import { createApi } from '../portal/src/service/api.js';
import i18n, { registerPluginI18n } from '../portal/src/i18n/index.js';
import orchestrationEn from '../plugins/orchestration-center/src/locales/en.json';

/** Payload shape of GET /rest/v1/orchestrate/solution-packages (19 items). */
const SOLUTION_PACKAGES = Array.from({ length: 19 }, (_, i) => ({
    pdf_filename: `IG${1500 + i}_AN_L4_Synthetic_Solution_Package_${i}.pdf`,
    chapter_count: 1 + (i % 3),
    chapter_titles: ['5. Interaction Flow'],
    created_at: `2026-10-15T08:00:0${i % 10}+00:00`,
    workflow_id: `wf-spg-${i}`,
}));

/** The three filenames of the old hardcoded MOCK_PACKAGES list. */
const OLD_MOCK_FILENAMES = [
    'RAN_Energy_Saving_Solution_Package.pdf',
    'SPN_Fault_Handling_Solution_Package.pdf',
    'Home_Broadband_Complaint_Solution_Package.pdf',
];

let node, root, api;
const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
const findButton = label => [...node.querySelectorAll('button')].find(button => button.textContent.trim() === label);

beforeEach(async () => {
    localStorage.clear(); HTMLElement.prototype.scrollTo = vi.fn();
    api = createApi('/api/orchestrate');
    api.get = vi.fn(async (url) => {
        if (url === '/rest/v1/orchestrate/solution-packages') return { status: 'success', data: SOLUTION_PACKAGES };
        return { status: 'success', data: [] };
    });
    registerPluginI18n('orchestration-center', { en: orchestrationEn }); await i18n.changeLanguage('en');
    node = document.createElement('div'); document.body.appendChild(node); root = createRoot(node);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await act(async () => root.render(<PortalProvider value={{ theme: { isDark: false }, api }}><OrchestrationCenter /></PortalProvider>)); await flush();
});
afterEach(async () => { await act(async () => root.unmount()); node.remove(); });

const openPackagesView = async () => {
    const card = findButton('SolutionPackage Import');
    expect(card).toBeTruthy();
    await act(async () => Simulate.click(card)); await flush();
};

test('packages view lists the real imported packages from the solution-packages API', async () => {
    await openPackagesView();
    expect(api.get).toHaveBeenCalledWith('/rest/v1/orchestrate/solution-packages');
    for (const pkg of SOLUTION_PACKAGES) {
        expect(node.textContent).toContain(pkg.pdf_filename);
    }
    // the count badge reflects the real list size (19), not a mock constant
    expect(node.textContent).toContain('19');
    // chapter metadata from the API payload is rendered
    expect(node.textContent).toContain('1 chapters');
});

test('packages view never falls back to the hardcoded demo list', async () => {
    await openPackagesView();
    for (const mock of OLD_MOCK_FILENAMES) {
        expect(node.textContent).not.toContain(mock);
    }
});

test('empty backend list renders the empty state instead of demo data', async () => {
    api.get.mockImplementation(async () => ({ status: 'success', data: [] }));
    await openPackagesView();
    expect(node.textContent).toContain('No imported solution packages yet');
    for (const mock of OLD_MOCK_FILENAMES) {
        expect(node.textContent).not.toContain(mock);
    }
});

test('backend failure surfaces an error, not demo data', async () => {
    api.get.mockImplementation(async (url) => {
        if (url === '/rest/v1/orchestrate/solution-packages') throw new Error('backend down');
        return { status: 'success', data: [] };
    });
    await openPackagesView();
    expect(node.textContent).toContain('Failed to load solution packages');
    for (const mock of OLD_MOCK_FILENAMES) {
        expect(node.textContent).not.toContain(mock);
    }
});

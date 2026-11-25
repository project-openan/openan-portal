// Copyright (c) 2026 Huawei Technologies Co., Ltd.
// All Rights Reserved.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Contract tests for the skill-center SOURCE plugin.
 *
 * Governance rule: a plugin may only ship when its full contract holds —
 * SDK-valid manifest, folder identity, menu↔routes consistency, i18n
 * completeness (every declared locale resolves the menu title) and a
 * mountable main view driven by mock data (no backend dependency).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import manifestModule from '../plugin.manifest.js';
import {
    verifySourcePluginContract,
    resolveLocaleKey,
} from '../../../tests/helpers/plugin-contract-utils.js';
import {
    createMockApi,
    createMockPortalValue,
    renderWithPortalContext,
} from '../../../tests/helpers/portal-test-utils.jsx';
import { loadPluginI18n } from '../../../portal/src/i18n/index.js';

describe('skill-center source plugin contract', () => {
    let contract;

    beforeAll(async () => {
        // Throws on ANY contract violation (SDK shape, folder id, menu↔routes,
        // i18n namespace/keys, lazy component resolution).
        contract = await verifySourcePluginContract({
            manifest: manifestModule,
            expectedId: 'skill-center',
        });
        // Register the plugin's i18n namespace exactly like the Portal's
        // plugin registry does before mounting any of its components.
        await loadPluginI18n(contract.manifest.i18n);
    });

    it('passes the full source-plugin contract', () => {
        // verifySourcePluginContract already threw on violations in beforeAll;
        // reaching here means every rule passed for this exact plugin.
        expect(contract.manifest.id).toBe('skill-center');
        expect(contract.manifest.name).toBe('Skill Center');
        expect(contract.manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
        expect(contract.components).toHaveLength(contract.manifest.routes.length);
        expect(typeof contract.components[0]).toBe('function');
    });

    it('declares its menu entry and route (order/route snapshot)', () => {
        expect(
            contract.manifest.menu.map(({ id, labelKey, order, route }) => ({ id, labelKey, order, route }))
        ).toEqual([
            { id: 'skills', labelKey: 'skill-center:skills.title', order: 6, route: '/skills' },
        ]);
        expect(
            contract.manifest.routes.map(({ path, menuId }) => ({ path, menuId }))
        ).toEqual([
            { path: '/skills', menuId: 'skills' },
        ]);
    });

    it('uses the plugin id as i18n namespace and both en/zh carry the menu title', () => {
        expect(contract.manifest.i18n.namespace).toBe('skill-center');
        expect(Object.keys(contract.locales).sort()).toEqual(['en', 'zh']);
        for (const resources of Object.values(contract.locales)) {
            expect(resolveLocaleKey(resources, 'skills.title')).toBeDefined();
        }
        expect(resolveLocaleKey(contract.locales.en, 'skills.title')).toBe('Skill Center');
        expect(resolveLocaleKey(contract.locales.zh, 'skills.title')).toBe('技能中心');
    });

    it('renders the route component inside the Portal context (mount smoke)', () => {
        const SkillCenter = contract.components[0];
        expect(typeof SkillCenter).toBe('function');
        const api = createMockApi();
        renderWithPortalContext(<SkillCenter />, { value: createMockPortalValue({ api }) });

        // Localized main view header.
        expect(screen.getByRole('heading', { name: 'Skill Center' })).toBeInTheDocument();
        // Mock-data driven skill cards render without any backend call.
        expect(screen.getByText('RAN ES Intent Exploration')).toBeInTheDocument();
        expect(screen.getByText('Intent Generation')).toBeInTheDocument();
        expect(api.get).not.toHaveBeenCalled();
    });

    it('filters cards by category tab (interaction smoke)', async () => {
        const SkillCenter = contract.components[0];
        expect(typeof SkillCenter).toBe('function');
        const user = userEvent.setup();
        renderWithPortalContext(<SkillCenter />);

        // All mock skills are ServiceLayer — the Common tab shows the empty state.
        await user.click(screen.getByRole('button', { name: /Common Skills/ }));
        expect(screen.getByText('No matching skills found')).toBeInTheDocument();
        expect(screen.queryByText('RAN ES Intent Exploration')).not.toBeInTheDocument();
    });
});

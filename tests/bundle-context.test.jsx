// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, test, vi } from 'vitest';
import { loadPluginBundle } from '../portal/src/bundle-loader.js';
import i18n from '../portal/src/i18n/index.js';

afterEach(() => {
    delete window.__OPENAN_BUNDLE_GLOBALS_READY__;
    delete window.__OPENAN_PORTAL_CONTEXT__;
    delete window.__OPENAN_PLUGIN__legacy_language;
});

test('legacy bundles see shared language before evaluation but never plugin-specific capabilities', async () => {
    await i18n.changeLanguage('en');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({
        id: 'legacy-language', name: 'Legacy Language', version: '1', entry: 'index.js', routes: [{ path: '/legacy-language' }],
    }) })));
    let bridge, observed;
    const changed = language => { observed = language; };
    vi.spyOn(document.head, 'appendChild').mockImplementation(script => {
        bridge = window.__OPENAN_PORTAL_CONTEXT__;
        bridge.i18n.on('languageChanged', changed);
        window.__OPENAN_PLUGIN__legacy_language = function LegacyLanguage() { return null; };
        queueMicrotask(() => script.onload());
        return script;
    });
    try {
        const manifest = await loadPluginBundle({ id: 'legacy-language', entry: '/plugins/legacy-language' });
        expect(manifest.id).toBe('legacy-language');
        expect(Object.isFrozen(bridge)).toBe(true);
        expect(Object.keys(bridge).sort()).toEqual(['i18n', 'mode']);
        expect(bridge.i18n).toBe(i18n);
        await i18n.changeLanguage('zh');
        expect(observed).toBe('zh');
        expect(bridge.api).toBeUndefined(); expect(bridge.auth).toBeUndefined();
    } finally { i18n.off('languageChanged', changed); }
});

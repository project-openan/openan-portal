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

import { lazy, Suspense, useState, useEffect, useMemo, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PortalProvider, loadEnabledPlugins, validateManifest } from '@openan/portal-sdk';
import { loadPluginBundle } from './bundle-loader.js';
import { loadPluginI18n } from './i18n/index.js';
import { AuthProvider, useAuth } from './auth/AuthContext.jsx';
import { ThemeProvider, useTheme } from './theme/ThemeContext.jsx';
import { PluginRegistryProvider } from './plugin/registry.jsx';
import Header from './components/header/index.jsx';
import { ErrorBoundary } from './components/error_boundary/index.jsx';
import Loading from './components/loading.jsx';
import Login from './auth/Login.jsx';
import ChangePassword from './auth/ChangePassword.jsx';
import PluginManager from './components/plugin_manager/index.jsx';
import api, { createApi } from './service/api.js';

import './i18n';

const DISABLED_KEY = 'openan-disabled-plugins';

export function PortalApp({ pluginsConfig }) {
    return (
        <BrowserRouter>
            <ThemeProvider>
                <AuthProvider>
                    <PortalShell pluginsConfig={pluginsConfig} />
                </AuthProvider>
            </ThemeProvider>
        </BrowserRouter>
    );
}

function PortalShell({ pluginsConfig }) {
    const { t, i18n } = useTranslation();
    const auth = useAuth();
    const theme = useTheme();
    const location = useLocation();
    const navigate = useNavigate();

    const [plugins, setPlugins] = useState(null);
    const [pluginErrors, setPluginErrors] = useState([]);
    const [showPluginManager, setShowPluginManager] = useState(false);
    const [disabledIds, setDisabledIds] = useState(() => {
        try {
            const saved = localStorage.getItem(DISABLED_KEY);
            return new Set(saved ? JSON.parse(saved) : []);
        } catch {
            return new Set();
        }
    });

    useEffect(() => {
        let active = true;
        async function loadAllPlugins() {
            const errors = [];
            const onError = (id, error) => errors.push({ id, message: error.message || 'Plugin load failed' });
            // Split by loading mode. Bundle plugins honor the per-delivery
            // `enabled` flag (parity with source plugins, which are filtered
            // by loadEnabledPlugins in @openan/portal-sdk). Entries without
            // an explicit flag stay enabled by default.
            const sourceEntries = pluginsConfig.plugins.filter((p) => p.manifest);
            const bundleEntries = pluginsConfig.plugins.filter(
                (p) => p.mode === 'bundle' && p.entry && p.enabled !== false
            );

            // 1. SOURCE plugins — compiled by Portal's Vite at build time
            const sourceManifests = await loadEnabledPlugins({ plugins: sourceEntries }, { onError });

            // 2. BUNDLE plugins — local artifacts or remote http, loaded via <script>
            const bundleManifests = await Promise.all(
                bundleEntries.map(async (entry) => {
                    try {
                        const manifest = validateManifest(await loadPluginBundle(entry));
                        if (manifest.id !== entry.id) throw new Error('Configured plugin id does not match its manifest');
                        return manifest;
                    } catch (err) {
                        console.error(`[Portal] Failed to load bundled plugin "${entry.id}" (${entry._loadMode || 'bundle'}):`, err);
                        onError(entry.id, err);
                        return null;
                    }
                })
            );

            const all = [...sourceManifests, ...bundleManifests.filter(Boolean)]
                .sort((a, b) => (a.menu?.[0]?.order ?? 999) - (b.menu?.[0]?.order ?? 999));

            const ids = new Set();
            const paths = new Set();
            const ready = [];
            for (const plugin of all) {
                try {
                    if (ids.has(plugin.id) || plugin.routes.some(r => paths.has(r.path))) throw new Error('Duplicate plugin id or route');
                    if (plugin.i18n) await loadPluginI18n(plugin.i18n);
                    ids.add(plugin.id);
                    plugin.routes.forEach(r => paths.add(r.path));
                    ready.push(plugin);
                } catch (error) { onError(plugin.id, error); }
            }
            if (active) { setPlugins(ready); setPluginErrors(errors); }
        }

        loadAllPlugins().catch((err) => {
            console.error('[Portal] Failed to load plugins:', err);
            if (active) { setPlugins([]); setPluginErrors([{ id: 'portal', message: err.message }]); }
        });
        return () => { active = false; };
    }, [pluginsConfig]);

    const togglePlugin = useCallback((id) => {
        setDisabledIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            try { localStorage.setItem(DISABLED_KEY, JSON.stringify([...next])); }
            catch { console.warn('[Portal] Plugin preference could not be persisted'); }
            return next;
        });
    }, []);

    // Plugins visible in nav + routes (excluding runtime-disabled)
    const visiblePlugins = useMemo(() => {
        if (!plugins) return null;
        return plugins.filter((p) => !disabledIds.has(p.id));
    }, [plugins, disabledIds]);

    const routes = useMemo(() => {
        if (!visiblePlugins) return [];
        return visiblePlugins.flatMap((p) =>
            p.routes.map((r) => ({
                ...r,
                pluginId: p.id,
                Component: lazy(r.component),
            }))
        );
    }, [visiblePlugins]);

    const portalCtx = useMemo(() => ({
        auth: {
            user: auth.currentUser,
            role: auth.role,
            isAuthenticated: auth.isAuthenticated,
            login: auth.login,
            logout: auth.logout,
            check: auth.checkAuth,
        },
        theme: {
            isDark: theme.isDark,
            toggle: theme.toggle,
            setDark: theme.setDark,
        },
        i18n,
        navigate,
        router: { location, navigate },
    }), [auth, theme, i18n, navigate, location]);

    // Stable per-plugin clients, built before rendering route elements.
    const pluginApis = useMemo(() => new Map((plugins || []).map(plugin =>
        [plugin.id, plugin.backend?.gateway ? createApi(plugin.backend.gateway) : api]
    )), [plugins]);

    if (auth.isChecking) {
        return <Loading />;
    }

    if (auth.mustChangePassword) return <ChangePassword />;
    if (!auth.isAuthenticated) {
        return <Login />;
    }

    if (!plugins) return <Loading />;

    const manager = showPluginManager && <PluginManager plugins={plugins} disabledIds={disabledIds}
        onToggle={togglePlugin} onClose={() => setShowPluginManager(false)} />;
    const failures = pluginErrors.length > 0 && <div role="alert" className="p-3 text-sm bg-amber-50 text-amber-900">
        {t('portal.plugin_failed')} {pluginErrors.map(error => `${error.id}: ${error.message}`).join('; ')}
    </div>;

    if (routes.length === 0) {
        return (
            <div className="h-screen flex items-center justify-center bg-zinc-50 dark:bg-[#09090B]">
                <div className="text-center">
                    {failures}
                    <p className="text-zinc-400 text-sm mb-4">{t('portal.no_plugins')}</p>
                    <button
                        onClick={() => setShowPluginManager(true)}
                        className="px-4 py-2 rounded-xl bg-blue-500 text-white text-sm font-bold hover:bg-blue-600 transition-all"
                    >
                        {t('plugin_manager.title')}
                    </button>
                </div>
                {manager}
            </div>
        );
    }

    return (
        <PluginRegistryProvider plugins={visiblePlugins}>
                <div className="h-screen flex flex-col bg-zinc-50 dark:bg-[#09090B] overflow-hidden font-sans transition-colors duration-500">
                    <Header
                        plugins={plugins}
                        disabledIds={disabledIds}
                        onManagePlugins={() => setShowPluginManager(true)}
                    />
                    {failures}
                    <main className="flex-1 min-h-0 relative overflow-hidden">
                        <Routes>
                            {routes.map((r) => {
                                const plugin = visiblePlugins.find((p) => p.id === r.pluginId);
                                const pluginApi = pluginApis.get(plugin.id);
                                return (
                                    <Route
                                        key={r.path}
                                        path={r.path}
                                        element={
                                            <PortalProvider value={{ ...portalCtx, api: pluginApi }}>
                                                <ErrorBoundary key={`${r.pluginId}:${r.path}`}>
                                                    <Suspense
                                                        fallback={
                                                            <div className="h-full flex items-center justify-center text-zinc-400 text-sm animate-pulse">
                                                                Loading...
                                                            </div>
                                                        }
                                                    >
                                                        <r.Component />
                                                    </Suspense>
                                                </ErrorBoundary>
                                            </PortalProvider>
                                        }
                                    />
                                );
                            })}
                            <Route
                                path="*"
                                element={
                                    <Navigate replace to={routes[0].path} />
                                }
                            />
                        </Routes>
                    </main>
                </div>
                {manager}
        </PluginRegistryProvider>
    );
}

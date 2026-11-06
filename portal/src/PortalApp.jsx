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
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate, matchPath } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PortalProvider, loadEnabledPlugins, validateManifest, withPluginDeadline } from '@openan/portal-sdk';
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
import AuthModal from './auth/AuthModal.jsx';
import UserManagement from './components/user_management/index.jsx';
import PluginManager from './components/plugin_manager/index.jsx';
import api, { createApi, getDisabledPlugins, setDisabledPlugins } from './service/api.js';

import './i18n';

const DISABLED_KEY = 'openan-disabled-plugins';
// Stable lazy wrappers keyed by "<pluginId>:<path>". Recreated wrappers would be
// new component types on every route recompute, remounting retained native pages.
const lazyRouteCache = new Map();

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
    // Guest-mode auth dialog: null | 'login' | 'register'
    const [authModal, setAuthModal] = useState(null);
    const [showChangePassword, setShowChangePassword] = useState(false);
    const [disabledIds, setDisabledIds] = useState(() => {
        try {
            const saved = localStorage.getItem(DISABLED_KEY);
            return new Set(saved ? JSON.parse(saved) : []);
        } catch {
            return new Set();
        }
    });
    const [retainedPaths, setRetainedPaths] = useState([]);

    useEffect(() => {
        let active = true;
        const controller = new AbortController();
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

            const load = async (entry, bundle) => {
                try {
                    const manifest = await withPluginDeadline(async signal => {
                        const value = bundle
                            ? validateManifest(await loadPluginBundle(entry, { signal }))
                            : (await loadEnabledPlugins({ plugins: [entry] }, { signal, onError }))[0];
                        if (!value) return null;
                        if (value.id !== entry.id) throw new Error('Configured plugin id does not match its manifest');
                        if (value.i18n) await loadPluginI18n(value.i18n, { signal });
                        return value;
                    }, { signal: controller.signal, label: `Plugin ${entry.id}` });
                    return manifest;
                } catch (error) {
                    if (!controller.signal.aborted) onError(entry.id, error);
                    return null;
                }
            };
            // Start both modes together; one pending import/network/locale has
            // a finite deadline and cannot indefinitely block healthy plugins.
            const all = (await Promise.all([
                ...sourceEntries.map(entry => load(entry, false)),
                ...bundleEntries.map(entry => load(entry, true)),
            ])).filter(Boolean).sort((a, b) => (a.menu?.[0]?.order ?? 999) - (b.menu?.[0]?.order ?? 999));
            const ids = new Set();
            const paths = new Set();
            const ready = [];
            for (const plugin of all) {
                try {
                    if (ids.has(plugin.id) || plugin.routes.some(r => paths.has(r.path))) throw new Error('Duplicate plugin id or route');
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
        return () => { active = false; controller.abort(); };
    }, [pluginsConfig]);

    const togglePlugin = useCallback((id) => {
        setDisabledIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            try { localStorage.setItem(DISABLED_KEY, JSON.stringify([...next])); }
            catch { console.warn('[Portal] Plugin preference could not be persisted'); }
            // Signed-in users keep their choices server-side too, so the
            // preference follows the account instead of the browser.
            if (auth.isAuthenticated) {
                setDisabledPlugins([...next]).catch(() => {
                    console.warn('[Portal] Per-user plugin preference could not be saved');
                });
            }
            return next;
        });
    }, [auth.isAuthenticated]);

    // Per-user plugin preferences: once signed in, the saved preference list
    // replaces the browser-local one (guests keep localStorage). A user who
    // never saved preferences adopts the browser-local list once.
    useEffect(() => {
        if (!auth.isAuthenticated) return undefined;
        let active = true;
        (async () => {
            try {
                const prefs = await getDisabledPlugins();
                if (!active || !prefs || !Array.isArray(prefs.disabled_plugins)) return;
                let ids = prefs.disabled_plugins;
                if (!prefs.stored) {
                    try {
                        const localSaved = JSON.parse(localStorage.getItem(DISABLED_KEY) || '[]');
                        if (Array.isArray(localSaved) && localSaved.length > 0) {
                            await setDisabledPlugins(localSaved);
                            ids = localSaved;
                        }
                    } catch { /* malformed local data keeps the server list */ }
                }
                if (active) setDisabledIds(new Set(ids));
            } catch {
                // Preference loading is best-effort: browsing continues with
                // the browser-local state when the endpoint is unavailable.
            }
        })();
        return () => { active = false; };
    }, [auth.isAuthenticated]);

    // Plugins visible in nav + routes (excluding runtime-disabled)
    const visiblePlugins = useMemo(() => {
        if (!plugins) return null;
        return plugins.filter((p) => !disabledIds.has(p.id));
    }, [plugins, disabledIds]);

    // One lazy wrapper per plugin route: `lazy()` returns a new component type on
    // every call, so rebuilding these on each visiblePlugins change would remount
    // the retained native pages and drop unsaved editor state. The cache lives at
    // module scope because render must not touch refs.
    const routes = useMemo(() => {
        if (!visiblePlugins) return [];
        const live = new Set();
        const resolved = visiblePlugins.flatMap((p) =>
            p.routes.map((r) => {
                const key = `${p.id}:${r.path}`;
                live.add(key);
                if (!lazyRouteCache.has(key)) lazyRouteCache.set(key, lazy(r.component));
                return {...r, pluginId: p.id, Component: lazyRouteCache.get(key)};
            })
        );
        for (const key of lazyRouteCache.keys()) {
            if (!live.has(key)) lazyRouteCache.delete(key);
        }
        return resolved;
    }, [visiblePlugins]);

    useEffect(() => {
        const current = routes.find(route => route.keepMounted && matchPath(route.path, location.pathname));
        if (current) setRetainedPaths(previous => previous.includes(current.path) ? previous : [...previous, current.path]);
    }, [routes, location.pathname]);

    const portalCtx = useMemo(() => ({
        auth: {
            user: auth.currentUser,
            role: auth.currentRole ?? (auth.authRequired ? 'user' : null),
            isAuthenticated: auth.isAuthenticated,
            isGuest: auth.isGuest,
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
        [plugin.id, plugin.backend?.gateway ? createApi(plugin.backend.gateway, { authScope: plugin.backend.authScope || 'component' }) : api]
    )), [plugins]);

    const renderPage = route => (
        <PortalProvider value={{...portalCtx, api: pluginApis.get(route.pluginId)}}>
            <ErrorBoundary key={`${route.pluginId}:${route.path}`}>
                <Suspense fallback={<div className="h-full flex items-center justify-center text-zinc-400 text-sm animate-pulse">Loading...</div>}>
                    <route.Component />
                </Suspense>
            </ErrorBoundary>
        </PortalProvider>
    );

    if (auth.isChecking) {
        return <Loading />;
    }

    if (auth.mustChangePassword) return <ChangePassword onDone={auth.completePasswordChange} />;

    // No session and no guest mode → full-screen login. Guest mode keeps
    // rendering the portal below; the header offers login/register.
    if (!auth.isAuthenticated && !auth.isGuest) {
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
                        onLogin={(tab) => setAuthModal(tab || 'login')}
                        onChangePassword={() => setShowChangePassword(true)}
                    />
                    {failures}
                    <main className="flex-1 min-h-0 relative overflow-hidden">
                        {routes.filter(route => route.keepMounted && (retainedPaths.includes(route.path) || matchPath(route.path, location.pathname)))
                            .map(route => <div key={`${route.pluginId}:${route.path}`} className="h-full"
                                hidden={!matchPath(route.path, location.pathname)}>{renderPage(route)}</div>)}
                        <Routes>
                            {/* Core admin route — user management (admin only) */}
                            <Route
                                path="/users"
                                element={
                                    auth.isAdmin ? (
                                        <UserManagement />
                                    ) : (
                                        <Navigate replace to={routes[0].path} />
                                    )
                                }
                            />
                            {routes.map((r) => {
                                return (
                                    <Route
                                        key={r.path}
                                        path={r.path}
                                        element={r.keepMounted ? null : renderPage(r)}
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
                {authModal && (
                    <AuthModal
                        initialTab={authModal}
                        onClose={() => setAuthModal(null)}
                    />
                )}
                {showChangePassword && (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm font-sans"
                        role="dialog"
                        aria-modal="true"
                        aria-label={t('login.change_password_title')}
                        onClick={() => setShowChangePassword(false)}
                    >
                        <div onClick={(e) => e.stopPropagation()} className="mx-6">
                            <ChangePassword
                                variant="modal"
                                onDone={() => setShowChangePassword(false)}
                                onCancel={() => setShowChangePassword(false)}
                            />
                        </div>
                    </div>
                )}
        </PluginRegistryProvider>
    );
}

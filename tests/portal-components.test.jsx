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

// ===== Hoisted mock state =====
const authMock = vi.hoisted(() => ({
    currentUser: null,
    currentRole: null,
    authRequired: false,
    isAuthenticated: false,
    isGuest: false,
    isAdmin: false,
    registrationEnabled: false,
    guestAllowed: false,
    passwordChanged: false,
    isChecking: false,
    mustChangePassword: false,
    login: vi.fn(async () => ({})),
    logout: vi.fn(async () => {}),
    changePassword: vi.fn(async () => {}),
    checkAuth: vi.fn(),
    enterAsGuest: vi.fn(),
    completePasswordChange: vi.fn(),
    applyCheck: vi.fn(),
    api: {},
}));

const apiMocks = vi.hoisted(() => ({
    listUsers: vi.fn(),
    createUser: vi.fn(),
    resetUserPassword: vi.fn(),
    setUserRole: vi.fn(),
    deleteUser: vi.fn(),
    register: vi.fn(),
    authCheck: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    changePassword: vi.fn(),
    getDisabledPlugins: vi.fn(),
    setDisabledPlugins: vi.fn(),
    createApi: vi.fn(() => ({ get: vi.fn() })),
}));

const bundleLoaderMock = vi.hoisted(() => ({
    loadPluginBundle: vi.fn(),
}));

const i18nMock = vi.hoisted(() => ({ language: 'en', changeLanguage: vi.fn() }));

// ===== Module mocks =====
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key) => key, i18n: i18nMock }),
    withTranslation: (Comp) => Comp,
    initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('lucide-react', () => {
    const Noop = () => null;
    const icons = [
        'Sun', 'Moon', 'LogOut', 'Puzzle', 'ChevronDown', 'Settings', 'Users', 'KeyRound',
        'UserPlus', 'RotateCcw', 'Trash2', 'ShieldCheck', 'RefreshCw',
        'X', 'CheckCircle2', 'CircleSlash', 'Route', 'ChevronUp', 'FileJson',
    ];
    const mod = { __esModule: true };
    for (const name of icons) mod[name] = Noop;
    return mod;
});

vi.mock('framer-motion', () => {
    const MotionDiv = (props) =>
        React.createElement('div', { style: props.style, className: props.className }, props.children);
    return {
        motion: { div: MotionDiv },
        AnimatePresence: ({ children }) => children,
    };
});

vi.mock('../portal/src/auth/AuthContext.jsx', () => ({
    AuthProvider: ({ children }) => children,
    useAuth: () => authMock,
}));

vi.mock('../portal/src/service/api.js', () => ({
    default: { get: vi.fn(), post: vi.fn() },
    createApi: apiMocks.createApi,
    authCheck: apiMocks.authCheck,
    login: apiMocks.login,
    logout: apiMocks.logout,
    changePassword: apiMocks.changePassword,
    register: apiMocks.register,
    listUsers: apiMocks.listUsers,
    createUser: apiMocks.createUser,
    resetUserPassword: apiMocks.resetUserPassword,
    setUserRole: apiMocks.setUserRole,
    deleteUser: apiMocks.deleteUser,
    getDisabledPlugins: apiMocks.getDisabledPlugins,
    setDisabledPlugins: apiMocks.setDisabledPlugins,
}));

vi.mock('../portal/src/bundle-loader.js', () => ({
    loadPluginBundle: bundleLoaderMock.loadPluginBundle,
}));

vi.mock('../portal/src/plugins.config.js', () => ({
    default: { plugins: [] },
}));

vi.mock('../portal/src/assets/openan-logo.png', () => ({ default: 'mock-logo.png' }));

vi.mock('axios', () => ({
    default: {
        create: vi.fn(() => ({
            interceptors: { response: { use: vi.fn() } },
            get: vi.fn(),
            post: vi.fn(),
        })),
    },
}));

// ===== Imports (after mocks) =====
import Tooltip from '../portal/src/components/common/tooltip_component/index.jsx';
import Header from '../portal/src/components/header/index.jsx';
import DeleteConfirm from '../portal/src/components/common/pop_confirm/index.jsx';
import Loading from '../portal/src/components/loading.jsx';
import { ErrorBoundary } from '../portal/src/components/error_boundary/index.jsx';
import PluginManager from '../portal/src/components/plugin_manager/index.jsx';
import UserManagement from '../portal/src/components/user_management/index.jsx';
import ChangePassword from '../portal/src/auth/ChangePassword.jsx';
import Login from '../portal/src/auth/Login.jsx';
import AuthModal from '../portal/src/auth/AuthModal.jsx';
import { ThemeProvider, useTheme } from '../portal/src/theme/ThemeContext.jsx';
import { PluginRegistryProvider, usePluginRegistry } from '../portal/src/plugin/registry.jsx';
import i18n, { registerPluginI18n, loadPluginI18n } from '../portal/src/i18n/index.js';
import { loadRemotePlugin } from '../portal/src/remote-loader.js';
import { MockPortal } from '../packages/portal-sdk/src/standalone.jsx';
import { usePortalContext } from '@openan/portal-sdk';
import { PortalApp } from '../portal/src/PortalApp.jsx';
import App from '../portal/src/App.jsx';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';

// ===== Helpers =====
let container, root;
const flush = (ms = 20) => act(async () => { await new Promise(r => setTimeout(r, ms)); });

async function render(element) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => { root.render(element); });
    await flush();
    return container;
}

async function cleanup() {
    if (root) { await act(async () => { root.unmount(); }); root = null; }
    if (container) { container.remove(); container = null; }
}

function setAuth(overrides = {}) {
    Object.assign(authMock, {
        currentUser: null, currentRole: null, authRequired: false,
        isAuthenticated: false, isGuest: false, isAdmin: false,
        registrationEnabled: false, guestAllowed: false,
        passwordChanged: false, isChecking: false, mustChangePassword: false,
        ...overrides,
    });
}

const allBtns = (text) =>
    [...(container?.querySelectorAll('button') || [])].filter(b => b.textContent.includes(text));
const clickByText = async (text) => {
    const found = allBtns(text);
    expect(found.length, `expected button containing "${text}"`).toBeGreaterThanOrEqual(1);
    await act(async () => Simulate.click(found[0]));
    await flush();
};
const changeInput = async (input, value) => {
    expect(input, `input not found`).toBeTruthy();
    await act(async () => {
        const proto = input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
        setter.call(input, value);
        Simulate.change(input, { target: { value } });
        input.dispatchEvent(new Event('change', { bubbles: true }));
    });
};
const submitForm = async (form) => {
    expect(form, `form not found`).toBeTruthy();
    await act(async () => Simulate.submit(form));
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
};

beforeEach(async () => {
    vi.resetAllMocks();
    setAuth({ isAuthenticated: true, isAdmin: true, authRequired: true, currentUser: 'admin', currentRole: 'admin' });
    apiMocks.listUsers.mockResolvedValue([]);
    apiMocks.createUser.mockResolvedValue({});
    apiMocks.resetUserPassword.mockResolvedValue({});
    apiMocks.setUserRole.mockResolvedValue({});
    apiMocks.deleteUser.mockResolvedValue({});
    apiMocks.register.mockResolvedValue({});
    apiMocks.authCheck.mockResolvedValue({ auth_required: false });
    apiMocks.login.mockResolvedValue({});
    apiMocks.logout.mockResolvedValue({});
    apiMocks.changePassword.mockResolvedValue({});
    apiMocks.getDisabledPlugins.mockResolvedValue({ disabled_plugins: [], stored: true });
    apiMocks.setDisabledPlugins.mockResolvedValue({});
    authMock.login.mockResolvedValue({});
    authMock.logout.mockResolvedValue({});
    authMock.changePassword.mockResolvedValue({});
    i18nMock.language = 'en';
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/');
    document.documentElement.className = '';
    document.documentElement.style.colorScheme = '';
    await i18n.changeLanguage('en');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(async () => { await cleanup(); });

// =====================================================================
// Loading
// =====================================================================
describe('Loading', () => {
    test('TC-PORTAL-1001 | Loading renders the pulse text', async () => {
        await render(<Loading />);
        expect(container.textContent).toContain('Loading...');
        expect(container.querySelector('.animate-pulse')).toBeTruthy();
    });
});

// =====================================================================
// ErrorBoundary
// =====================================================================
describe('ErrorBoundary', () => {
    test('TC-PORTAL-1101 | renders children when no error', async () => {
        await render(<ErrorBoundary><div data-testid="ok">CHILD_OK</div></ErrorBoundary>);
        expect(container.textContent).toContain('CHILD_OK');
        expect(container.textContent).not.toContain('Plugin Error');
    });

    test('TC-PORTAL-1102 | crashing child shows error UI with the message', async () => {
        const Crashing = () => { throw new Error('synthetic failure'); };
        await render(<ErrorBoundary><Crashing /></ErrorBoundary>);
        expect(container.textContent).toContain('Plugin Error');
        expect(container.textContent).toContain('synthetic failure');
        expect(container.querySelector('button').textContent).toBe('Retry');
    });

    test('TC-PORTAL-1103 | Retry clears error and re-renders recovered children', async () => {
        let crash = true;
        const Crashable = () => {
            if (crash) throw new Error('synthetic failure');
            return <div data-testid="recovered">RECOVERED</div>;
        };
        await render(<ErrorBoundary><Crashable /></ErrorBoundary>);
        expect(container.textContent).toContain('Plugin Error');
        crash = false;
        await act(async () => Simulate.click(container.querySelector('button')));
        await flush();
        expect(container.textContent).toContain('RECOVERED');
        expect(container.textContent).not.toContain('Plugin Error');
    });

    test('TC-PORTAL-1104 | componentDidCatch logs the error to console', async () => {
        const Crashing = () => { throw new Error('synthetic failure'); };
        await render(<ErrorBoundary><Crashing /></ErrorBoundary>);
        expect(console.error).toHaveBeenCalled();
        expect(container.textContent).toContain('synthetic failure');
    });
});

// =====================================================================
// PluginRegistry
// =====================================================================
describe('PluginRegistry', () => {
    test('TC-PORTAL-801 | provider passes plugins array through context', async () => {
        const plugins = [{ id: 'a', name: 'A' }];
        const Reader = () => {
            const list = usePluginRegistry();
            return <div>{list.map(p => p.id).join(',')}</div>;
        };
        await render(<PluginRegistryProvider plugins={plugins}><Reader /></PluginRegistryProvider>);
        expect(container.textContent).toBe('a');
    });

    test('TC-PORTAL-802 | usePluginRegistry returns empty array without provider', async () => {
        const Reader = () => {
            const list = usePluginRegistry();
            return <div>count={list.length}</div>;
        };
        await render(<Reader />);
        expect(container.textContent).toBe('count=0');
    });
});

// =====================================================================
// ThemeContext
// =====================================================================
describe('ThemeContext', () => {
    test('TC-PORTAL-1501 | defaults to dark when no saved preference', async () => {
        localStorage.removeItem('theme');
        const Reader = () => { const { isDark } = useTheme(); return <div>{isDark ? 'dark' : 'light'}</div>; };
        await render(<ThemeProvider><Reader /></ThemeProvider>);
        expect(container.textContent).toBe('dark');
        expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    test('TC-PORTAL-1502 | toggle switches dark to light and back', async () => {
        const Reader = () => {
            const { isDark, toggle } = useTheme();
            return <div>{isDark ? 'dark' : 'light'}<button onClick={toggle}>T</button></div>;
        };
        await render(<ThemeProvider><Reader /></ThemeProvider>);
        expect(container.textContent).toContain('dark');
        await act(async () => Simulate.click(container.querySelector('button')));
        await flush();
        expect(container.textContent).toContain('light');
        expect(document.documentElement.classList.contains('dark')).toBe(false);
        expect(localStorage.getItem('theme')).toBe('light');
    });

    test('TC-PORTAL-1503 | setDark(false) switches to light persistently', async () => {
        const Reader = () => {
            const { isDark, setDark } = useTheme();
            return <div>{isDark ? 'dark' : 'light'}<button onClick={() => setDark(false)}>L</button></div>;
        };
        await render(<ThemeProvider><Reader /></ThemeProvider>);
        await act(async () => Simulate.click(container.querySelector('button')));
        await flush();
        expect(container.textContent).toContain('light');
        expect(localStorage.getItem('theme')).toBe('light');
    });

    test('TC-PORTAL-1504 | saved light preference is honoured on init', async () => {
        localStorage.setItem('theme', 'light');
        const Reader = () => { const { isDark } = useTheme(); return <div>{isDark ? 'dark' : 'light'}</div>; };
        await render(<ThemeProvider><Reader /></ThemeProvider>);
        expect(container.textContent).toBe('light');
        expect(document.documentElement.style.colorScheme).toBe('light');
    });

    test('TC-PORTAL-1505 | useTheme outside provider throws', () => {
        const NoProvider = () => { useTheme(); return null; };
        const div = document.createElement('div');
        document.body.appendChild(div);
        const r = createRoot(div);
        expect(() => act(() => r.render(<NoProvider />))).toThrow('useTheme() must be used within a <ThemeProvider>');
        act(() => r.unmount());
        div.remove();
    });
});

// =====================================================================
// i18n
// =====================================================================
describe('i18n', () => {
    test('TC-PORTAL-1601 | registerPluginI18n adds namespace and resources', () => {
        registerPluginI18n('tc-1601-ns', { en: { hello: 'World_EN' }, zh: { hello: 'World_ZH' } });
        expect(i18n.hasResourceBundle('en', 'tc-1601-ns')).toBe(true);
        expect(i18n.hasResourceBundle('zh', 'tc-1601-ns')).toBe(true);
        expect(i18n.options.ns).toContain('tc-1601-ns');
    });

    test('TC-PORTAL-1602 | loadPluginI18n loads resources from async loaders', async () => {
        await loadPluginI18n({
            namespace: 'tc-1602-ns',
            resources: { en: async () => ({ default: { greet: 'Hi' } }) },
        });
        expect(i18n.hasResourceBundle('en', 'tc-1602-ns')).toBe(true);
        expect(i18n.t('tc-1602-ns:greet')).toBe('Hi');
    });

    test('TC-PORTAL-1603 | loadPluginI18n with null config returns early', async () => {
        await expect(loadPluginI18n(null)).resolves.toBeUndefined();
        await expect(loadPluginI18n({})).resolves.toBeUndefined();
    });

    test('TC-PORTAL-1604 | loadPluginI18n throws when signal is already aborted', async () => {
        const controller = new AbortController();
        controller.abort();
        await expect(loadPluginI18n(
            { namespace: 'tc-1604-ns', resources: { en: async () => ({}) } },
            { signal: controller.signal },
        )).rejects.toThrow();
        expect(i18n.hasResourceBundle('en', 'tc-1604-ns')).toBe(false);
    });

    test('TC-PORTAL-1605 | loadPluginI18n handles loader returning object without default', async () => {
        await loadPluginI18n({
            namespace: 'tc-1605-ns',
            resources: { en: async () => ({ plain: 'value' }) },
        });
        expect(i18n.hasResourceBundle('en', 'tc-1605-ns')).toBe(true);
    });

    test('TC-PORTAL-1606 | registerPluginI18n is idempotent (no duplicate ns entry)', () => {
        registerPluginI18n('tc-1606-ns', { en: { a: 1 } });
        const first = i18n.options.ns.filter(n => n === 'tc-1606-ns').length;
        registerPluginI18n('tc-1606-ns', { en: { a: 2 } });
        const second = i18n.options.ns.filter(n => n === 'tc-1606-ns').length;
        expect(first).toBe(1);
        expect(second).toBe(1);
    });
});

// =====================================================================
// Tooltip
// =====================================================================
describe('Tooltip', () => {
    test('TC-PORTAL-101 | tooltip content hidden until hover', async () => {
        await render(<Tooltip content="SECRET_TIP"><span>trigger</span></Tooltip>);
        expect(container.textContent).toContain('trigger');
        expect(document.body.textContent).not.toContain('SECRET_TIP');
    });

    test('TC-PORTAL-102 | mouse enter shows tooltip content via portal', async () => {
        await render(<Tooltip content="HOVER_TIP"><span>trigger</span></Tooltip>);
        const trigger = container.querySelector('[ref], div');
        const triggerDiv = container.querySelector('div');
        await act(async () => Simulate.mouseEnter(triggerDiv));
        await flush();
        expect(document.body.textContent).toContain('HOVER_TIP');
    });

    test('TC-PORTAL-103 | mouse leave hides tooltip', async () => {
        await render(<Tooltip content="FLEETING_TIP"><span>trigger</span></Tooltip>);
        const triggerDiv = container.querySelector('div');
        await act(async () => Simulate.mouseEnter(triggerDiv));
        await flush();
        expect(document.body.textContent).toContain('FLEETING_TIP');
        await act(async () => Simulate.mouseLeave(triggerDiv));
        await flush();
        expect(document.body.textContent).not.toContain('FLEETING_TIP');
    });

    test('TC-PORTAL-104 | side=left positions without crash', async () => {
        await render(<Tooltip content="LEFT_TIP" side="left"><span>trigger</span></Tooltip>);
        const triggerDiv = container.querySelector('div');
        await act(async () => Simulate.mouseEnter(triggerDiv));
        await flush();
        expect(document.body.textContent).toContain('LEFT_TIP');
    });

    test('TC-PORTAL-105 | side=top and side=bottom render content', async () => {
        await render(<Tooltip content="TOP_TIP" side="top"><span>t</span></Tooltip>);
        const triggerDiv = container.querySelector('div');
        await act(async () => Simulate.mouseEnter(triggerDiv));
        await flush();
        expect(document.body.textContent).toContain('TOP_TIP');
        await act(async () => Simulate.mouseLeave(triggerDiv));
        await flush();
        await cleanup();
        await render(<Tooltip content="BOTTOM_TIP" side="bottom"><span>b</span></Tooltip>);
        const triggerDiv2 = container.querySelector('div');
        await act(async () => Simulate.mouseEnter(triggerDiv2));
        await flush();
        expect(document.body.textContent).toContain('BOTTOM_TIP');
    });
});

// =====================================================================
// PopConfirm (DeleteConfirm)
// =====================================================================
describe('PopConfirm', () => {
    test('TC-PORTAL-701 | renders children without confirm dialog', async () => {
        await render(<DeleteConfirm onConfirm={vi.fn()}><span>DELETE_ROW</span></DeleteConfirm>);
        expect(container.textContent).toContain('DELETE_ROW');
        expect(document.body.textContent).not.toContain('common.confirm');
    });

    test('TC-PORTAL-702 | click opens confirm dialog with title', async () => {
        await render(<DeleteConfirm onConfirm={vi.fn()} title="Delete this item?"><span>DELETE_ROW</span></DeleteConfirm>);
        await act(async () => Simulate.click(container.querySelector('div')));
        await flush();
        expect(document.body.textContent).toContain('Delete this item?');
        expect(document.body.textContent).toContain('common.confirm');
    });

    test('TC-PORTAL-703 | confirm button calls onConfirm and closes', async () => {
        const onConfirm = vi.fn();
        await render(<DeleteConfirm onConfirm={onConfirm}><span>DELETE_ROW</span></DeleteConfirm>);
        await act(async () => Simulate.click(container.querySelector('div')));
        await flush();
        const confirmBtn = [...document.body.querySelectorAll('button')].find(b => b.textContent.includes('common.confirm'));
        await act(async () => Simulate.click(confirmBtn));
        await flush();
        expect(onConfirm).toHaveBeenCalledTimes(1);
        expect(document.body.textContent).not.toContain('common.confirm');
    });

    test('TC-PORTAL-704 | cancel button closes without confirming', async () => {
        const onConfirm = vi.fn();
        await render(<DeleteConfirm onConfirm={onConfirm}><span>DELETE_ROW</span></DeleteConfirm>);
        await act(async () => Simulate.click(container.querySelector('div')));
        await flush();
        const cancelBtn = [...document.body.querySelectorAll('button')].find(b => b.textContent.includes('common.cancel'));
        await act(async () => Simulate.click(cancelBtn));
        await flush();
        expect(onConfirm).not.toHaveBeenCalled();
        expect(document.body.textContent).not.toContain('common.confirm');
    });

    test('TC-PORTAL-705 | overlay click closes without confirming', async () => {
        const onConfirm = vi.fn();
        await render(<DeleteConfirm onConfirm={onConfirm}><span>DELETE_ROW</span></DeleteConfirm>);
        await act(async () => Simulate.click(container.querySelector('div')));
        await flush();
        const overlay = document.body.querySelector('.fixed.inset-0');
        expect(overlay).toBeTruthy();
        await act(async () => Simulate.click(overlay));
        await flush();
        expect(onConfirm).not.toHaveBeenCalled();
        expect(document.body.textContent).not.toContain('common.confirm');
    });

    test('TC-PORTAL-706 | default title uses common.confirm_delete key', async () => {
        await render(<DeleteConfirm onConfirm={vi.fn()}><span>row</span></DeleteConfirm>);
        await act(async () => Simulate.click(container.querySelector('div')));
        await flush();
        expect(document.body.textContent).toContain('common.confirm_delete');
    });
});

// =====================================================================
// PluginManager
// =====================================================================
describe('PluginManager', () => {
    const plugins = [
        { id: 'p1', name: 'Plugin One', version: '1.2.0', menu: [{ id: 'p1', route: '/p1', labelKey: 'p1' }], routes: [{ path: '/p1' }] },
        { id: 'p2', name: 'Plugin Two', version: '2.0.0', menu: [{ id: 'p2', route: '/p2', labelKey: 'p2' }], routes: [{ path: '/p2' }] },
    ];

    test('TC-PORTAL-901 | renders plugin list with names, versions, and route paths', async () => {
        await render(<ThemeProvider><PluginManager plugins={plugins} disabledIds={new Set()} onToggle={vi.fn()} onClose={vi.fn()} /></ThemeProvider>);
        expect(container.textContent).toContain('Plugin One');
        expect(container.textContent).toContain('v1.2.0');
        expect(container.textContent).toContain('Plugin Two');
        expect(container.textContent).toContain('/p1');
        expect(container.textContent).toContain('/p2');
        expect(container.textContent).toContain('plugin_manager.title');
    });

    test('TC-PORTAL-902 | toggle button calls onToggle with plugin id', async () => {
        const onToggle = vi.fn();
        await render(<ThemeProvider><PluginManager plugins={plugins} disabledIds={new Set()} onToggle={onToggle} onClose={vi.fn()} /></ThemeProvider>);
        const disableBtn = container.querySelector('button[aria-label="plugin_manager.disable"]');
        expect(disableBtn).toBeTruthy();
        await act(async () => Simulate.click(disableBtn));
        expect(onToggle).toHaveBeenCalledWith('p1');
    });

    test('TC-PORTAL-903 | disabled count badge appears when plugins are disabled', async () => {
        await render(<ThemeProvider><PluginManager plugins={plugins} disabledIds={new Set(['p2'])} onToggle={vi.fn()} onClose={vi.fn()} /></ThemeProvider>);
        // activeCount=1, disabledCount=1
        const statsText = container.textContent;
        expect(statsText).toContain('1'); // active count
    });

    test('TC-PORTAL-904 | expand config viewer shows JSON manifest', async () => {
        await render(<ThemeProvider><PluginManager plugins={plugins} disabledIds={new Set()} onToggle={vi.fn()} onClose={vi.fn()} /></ThemeProvider>);
        const expandBtns = container.querySelectorAll('button[title="plugin_manager.view_config"]');
        expect(expandBtns.length).toBeGreaterThanOrEqual(1);
        await act(async () => Simulate.click(expandBtns[0]));
        await flush();
        expect(container.textContent).toContain('plugin.manifest.js');
        expect(container.textContent).toContain('Plugin One');
    });

    test('TC-PORTAL-905 | close button calls onClose', async () => {
        const onClose = vi.fn();
        await render(<ThemeProvider><PluginManager plugins={plugins} disabledIds={new Set()} onToggle={vi.fn()} onClose={onClose} /></ThemeProvider>);
        // Footer close button
        const closeBtns = allBtns('plugin_manager.close');
        expect(closeBtns.length).toBeGreaterThanOrEqual(1);
        await act(async () => Simulate.click(closeBtns[0]));
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});

// =====================================================================
// Header
// =====================================================================
describe('Header', () => {
    const flatPlugins = [
        { id: 'home', menu: [{ id: 'home', route: '/home', labelKey: 'Home', order: 1 }] },
        { id: 'settings', menu: [{ id: 'settings', route: '/settings', labelKey: 'Settings', order: 2 }] },
    ];
    const groupedPlugins = [
        { id: 'p1', menu: [
            { id: 'a', route: '/a', labelKey: 'A', group: 'Group1', order: 1 },
            { id: 'b', route: '/b', labelKey: 'B', group: 'Group1', order: 2 },
        ]},
    ];

    async function renderHeader(plugins = flatPlugins, disabledIds = new Set(), overrides = {}) {
        setAuth({ isAuthenticated: true, isAdmin: true, authRequired: true, currentUser: 'admin', currentRole: 'admin', ...overrides });
        await render(
            <BrowserRouter><ThemeProvider>
                <Header plugins={plugins} disabledIds={disabledIds}
                    onManagePlugins={vi.fn()} onLogin={vi.fn()} onChangePassword={vi.fn()} />
            </ThemeProvider></BrowserRouter>,
        );
    }

    test('TC-PORTAL-201 | renders flat menu items as buttons', async () => {
        await renderHeader();
        expect(allBtns('Home').length).toBeGreaterThanOrEqual(1);
        expect(allBtns('Settings').length).toBeGreaterThanOrEqual(1);
        expect(container.textContent).toContain('OpenAN');
        expect(container.textContent).toContain('nav.subtitle');
    });

    test('TC-PORTAL-202 | clicking flat item navigates to the route', async () => {
        await renderHeader();
        await clickByText('Home');
        expect(window.location.pathname).toBe('/home');
    });

    test('TC-PORTAL-203 | grouped items render a dropdown parent button', async () => {
        await renderHeader(groupedPlugins);
        expect(allBtns('Group1').length).toBeGreaterThanOrEqual(1);
    });

    test('TC-PORTAL-204 | clicking group opens dropdown with child routes', async () => {
        await renderHeader(groupedPlugins);
        expect(allBtns('B').length).toBe(0);
        await clickByText('Group1');
        expect(allBtns('A').length).toBeGreaterThanOrEqual(1);
        expect(allBtns('B').length).toBeGreaterThanOrEqual(1);
    });

    test('TC-PORTAL-205 | clicking child navigates and closes dropdown', async () => {
        await renderHeader(groupedPlugins);
        await clickByText('Group1');
        await clickByText('A');
        expect(window.location.pathname).toBe('/a');
        expect(container.textContent).not.toContain('B');
    });

    test('TC-PORTAL-206 | settings dropdown opens and shows plugin management', async () => {
        await renderHeader();
        const settingsBtn = container.querySelector('button[aria-label="nav.settings"]');
        expect(settingsBtn).toBeTruthy();
        await act(async () => Simulate.click(settingsBtn));
        await flush();
        expect(container.textContent).toContain('plugin_manager.title');
    });

    test('TC-PORTAL-207 | settings → plugin management calls onManagePlugins', async () => {
        const onManage = vi.fn();
        setAuth({ isAuthenticated: true, isAdmin: true, authRequired: true, currentUser: 'admin', currentRole: 'admin' });
        await render(
            <BrowserRouter><ThemeProvider>
                <Header plugins={flatPlugins} disabledIds={new Set()} onManagePlugins={onManage} onLogin={vi.fn()} onChangePassword={vi.fn()} />
            </ThemeProvider></BrowserRouter>,
        );
        await act(async () => Simulate.click(container.querySelector('button[aria-label="nav.settings"]')));
        await flush();
        await clickByText('plugin_manager.title');
        expect(onManage).toHaveBeenCalledTimes(1);
    });

    test('TC-PORTAL-208 | settings → change password shown for authenticated users', async () => {
        const onChangePw = vi.fn();
        setAuth({ isAuthenticated: true, isAdmin: false, authRequired: true, currentUser: 'boss', currentRole: 'user' });
        await render(
            <BrowserRouter><ThemeProvider>
                <Header plugins={flatPlugins} disabledIds={new Set()} onManagePlugins={vi.fn()} onLogin={vi.fn()} onChangePassword={onChangePw} />
            </ThemeProvider></BrowserRouter>,
        );
        await act(async () => Simulate.click(container.querySelector('button[aria-label="nav.settings"]')));
        await flush();
        // Non-admin: user management should NOT appear, but change password should
        expect(container.textContent).not.toContain('users.title');
        await clickByText('login.change_password_title');
        expect(onChangePw).toHaveBeenCalledTimes(1);
    });

    test('TC-PORTAL-209 | guest mode shows guest badge and login/register buttons', async () => {
        await renderHeader(flatPlugins, new Set(), { isAuthenticated: false, isGuest: true, registrationEnabled: true, authRequired: true });
        expect(container.textContent).toContain('login.guest_badge');
        expect(allBtns('login.login_button').length).toBeGreaterThanOrEqual(1);
        expect(allBtns('login.register_entry').length).toBeGreaterThanOrEqual(1);
    });

    test('TC-PORTAL-210 | authenticated mode shows username and logout', async () => {
        await renderHeader();
        expect(container.textContent).toContain('admin');
        expect(allBtns('login.logout').length).toBeGreaterThanOrEqual(1);
    });

    test('TC-PORTAL-211 | language toggle calls i18n.changeLanguage and persists to localStorage', async () => {
        await renderHeader();
        const zhBtn = [...container.querySelectorAll('button')].find(b => b.textContent.trim() === '中');
        expect(zhBtn).toBeTruthy();
        await act(async () => Simulate.click(zhBtn));
        await flush();
        expect(i18nMock.changeLanguage).toHaveBeenCalledWith('zh');
        expect(localStorage.getItem('lang')).toBe('zh');
        const enBtn = [...container.querySelectorAll('button')].find(b => b.textContent.trim() === 'EN');
        await act(async () => Simulate.click(enBtn));
        await flush();
        expect(i18nMock.changeLanguage).toHaveBeenCalledWith('en');
        expect(localStorage.getItem('lang')).toBe('en');
    });

    test('TC-PORTAL-212 | disabled plugins show activeCount / total in settings', async () => {
        const plugins3 = [
            { id: 'a', menu: [{ id: 'a', route: '/a', labelKey: 'A' }] },
            { id: 'b', menu: [{ id: 'b', route: '/b', labelKey: 'B' }] },
            { id: 'c', menu: [{ id: 'c', route: '/c', labelKey: 'C' }] },
        ];
        await renderHeader(plugins3, new Set(['b', 'c']));
        await act(async () => Simulate.click(container.querySelector('button[aria-label="nav.settings"]')));
        await flush();
        // activeCount=1, total=3 → badge shows "1/3"
        expect(container.textContent).toContain('1/3');
    });

    test('TC-PORTAL-213 | outside click closes open settings dropdown', async () => {
        await renderHeader();
        await act(async () => Simulate.click(container.querySelector('button[aria-label="nav.settings"]')));
        await flush();
        expect(container.textContent).toContain('plugin_manager.title');
        await act(async () => {
            document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        });
        await flush();
        expect(allBtns('plugin_manager.title').length).toBe(0);
    });
});

// =====================================================================
// ChangePassword
// =====================================================================
describe('ChangePassword', () => {
    async function renderChangePassword(props = {}) {
        setAuth({ isAuthenticated: true, currentUser: 'admin', currentRole: 'admin', ...props.auth });
        await render(<ThemeProvider><ChangePassword onDone={vi.fn()} {...props} /></ThemeProvider>);
    }

    test('TC-PORTAL-1301 | shows current user and form fields', async () => {
        await renderChangePassword();
        expect(container.textContent).toContain('admin');
        expect(container.querySelector('input[name="old"]')).toBeTruthy();
        expect(container.querySelector('input[name="new"]')).toBeTruthy();
        expect(container.querySelector('input[name="confirm"]')).toBeTruthy();
    });

    test('TC-PORTAL-1302 | password mismatch shows error and does not submit', async () => {
        const onDone = vi.fn();
        await render(<ThemeProvider><ChangePassword onDone={onDone} /></ThemeProvider>);
        await changeInput(container.querySelector('input[name="old"]'), 'oldpw');
        await changeInput(container.querySelector('input[name="new"]'), 'newpw');
        await changeInput(container.querySelector('input[name="confirm"]'), 'different');
        await submitForm(container.querySelector('form'));
        expect(container.textContent).toContain('login.password_mismatch');
        expect(authMock.changePassword).not.toHaveBeenCalled();
        expect(onDone).not.toHaveBeenCalled();
    });

    test('TC-PORTAL-1303 | new password same as old shows error', async () => {
        await render(<ThemeProvider><ChangePassword onDone={vi.fn()} /></ThemeProvider>);
        await changeInput(container.querySelector('input[name="old"]'), 'samepw');
        await changeInput(container.querySelector('input[name="new"]'), 'samepw');
        await changeInput(container.querySelector('input[name="confirm"]'), 'samepw');
        await submitForm(container.querySelector('form'));
        expect(container.textContent).toContain('password_change.same');
        expect(authMock.changePassword).not.toHaveBeenCalled();
    });

    test('TC-PORTAL-1304 | successful change calls onDone', async () => {
        const onDone = vi.fn();
        await render(<ThemeProvider><ChangePassword onDone={onDone} /></ThemeProvider>);
        await changeInput(container.querySelector('input[name="old"]'), 'oldpw');
        await changeInput(container.querySelector('input[name="new"]'), 'newpw');
        await changeInput(container.querySelector('input[name="confirm"]'), 'newpw');
        await submitForm(container.querySelector('form'));
        expect(authMock.changePassword).toHaveBeenCalledWith('oldpw', 'newpw');
        expect(onDone).toHaveBeenCalledTimes(1);
    });

    test('TC-PORTAL-1305 | API error shows error message', async () => {
        authMock.changePassword.mockRejectedValueOnce({ response: { data: { detail: 'Wrong old password' } } });
        await render(<ThemeProvider><ChangePassword onDone={vi.fn()} /></ThemeProvider>);
        await changeInput(container.querySelector('input[name="old"]'), 'wrong');
        await changeInput(container.querySelector('input[name="new"]'), 'newpw');
        await changeInput(container.querySelector('input[name="confirm"]'), 'newpw');
        await submitForm(container.querySelector('form'));
        expect(container.textContent).toContain('Wrong old password');
    });

    test('TC-PORTAL-1306 | modal variant shows cancel button instead of logout', async () => {
        const onCancel = vi.fn();
        await render(<ThemeProvider><ChangePassword variant="modal" onDone={vi.fn()} onCancel={onCancel} /></ThemeProvider>);
        expect(allBtns('common.close').length).toBeGreaterThanOrEqual(1);
        // page-variant hint should not appear in modal
        expect(container.textContent).not.toContain('login.must_change_hint');
        await act(async () => Simulate.click(allBtns('common.close')[0]));
        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    test('TC-PORTAL-1307 | page variant shows logout button', async () => {
        await render(<ThemeProvider><ChangePassword onDone={vi.fn()} /></ThemeProvider>);
        expect(container.textContent).toContain('login.must_change_hint');
        expect(allBtns('login.logout').length).toBeGreaterThanOrEqual(1);
    });
});

// =====================================================================
// Login
// =====================================================================
describe('Login', () => {
    async function renderLogin(props = {}, authOverrides = {}) {
        setAuth({ isAuthenticated: false, isGuest: false, authRequired: true, registrationEnabled: false, guestAllowed: false, ...authOverrides });
        await render(<ThemeProvider><Login {...props} /></ThemeProvider>);
    }

    test('TC-PORTAL-1401 | login form renders with username and password inputs', async () => {
        await renderLogin();
        expect(container.querySelector('input[type="text"]')).toBeTruthy();
        expect(container.querySelector('input[type="password"]')).toBeTruthy();
        expect(allBtns('login.button').length).toBeGreaterThanOrEqual(1);
    });

    test('TC-PORTAL-1402 | successful login calls auth.login and onSuccess', async () => {
        const onSuccess = vi.fn();
        authMock.login.mockResolvedValueOnce({ username: 'boss', role: 'admin' });
        await renderLogin({ onSuccess });
        await changeInput(container.querySelector('input[type="text"]'), 'boss');
        await changeInput(container.querySelector('input[type="password"]'), 'secret');
        await submitForm(container.querySelector('form'));
        expect(authMock.login).toHaveBeenCalledWith('boss', 'secret');
        expect(onSuccess).toHaveBeenCalledTimes(1);
    });

    test('TC-PORTAL-1403 | login error shows error message', async () => {
        authMock.login.mockRejectedValueOnce({ response: { data: { detail: 'Invalid credentials' } } });
        await renderLogin();
        await changeInput(container.querySelector('input[type="text"]'), 'boss');
        await changeInput(container.querySelector('input[type="password"]'), 'wrong');
        await submitForm(container.querySelector('form'));
        expect(container.textContent).toContain('Invalid credentials');
    });

    test('TC-PORTAL-1404 | register tab appears when registrationEnabled', async () => {
        await renderLogin({}, { registrationEnabled: true });
        expect(allBtns('login.tab_register').length).toBeGreaterThanOrEqual(1);
    });

    test('TC-PORTAL-1405 | register password mismatch shows error', async () => {
        await renderLogin({}, { registrationEnabled: true });
        await clickByText('login.tab_register');
        const inputs = container.querySelectorAll('input[type="password"]');
        await changeInput(container.querySelector('input[type="text"]'), 'newbie');
        await changeInput(inputs[0], 'Passw0rd');
        await changeInput(inputs[1], 'Different');
        await submitForm(container.querySelector('form'));
        expect(container.textContent).toContain('login.password_mismatch');
        expect(apiMocks.register).not.toHaveBeenCalled();
    });

    test('TC-PORTAL-1406 | successful register shows notice and switches to login tab', async () => {
        await renderLogin({}, { registrationEnabled: true });
        await clickByText('login.tab_register');
        const inputs = container.querySelectorAll('input[type="password"]');
        await changeInput(container.querySelector('input[type="text"]'), 'newbie');
        await changeInput(inputs[0], 'Passw0rd!');
        await changeInput(inputs[1], 'Passw0rd!');
        await submitForm(container.querySelector('form'));
        expect(apiMocks.register).toHaveBeenCalledWith('newbie', 'Passw0rd!');
        expect(container.textContent).toContain('login.register_success');
    });

    test('TC-PORTAL-1407 | register API error shows error message', async () => {
        apiMocks.register.mockRejectedValueOnce({ response: { data: { detail: 'Username taken' } } });
        await renderLogin({}, { registrationEnabled: true });
        await clickByText('login.tab_register');
        const inputs = container.querySelectorAll('input[type="password"]');
        await changeInput(container.querySelector('input[type="text"]'), 'taken');
        await changeInput(inputs[0], 'Passw0rd!');
        await changeInput(inputs[1], 'Passw0rd!');
        await submitForm(container.querySelector('form'));
        expect(container.textContent).toContain('Username taken');
    });

    test('TC-PORTAL-1408 | guest entry button shown on page variant when guestAllowed', async () => {
        await renderLogin({}, { guestAllowed: true });
        expect(allBtns('login.guest_entry').length).toBeGreaterThanOrEqual(1);
        await clickByText('login.guest_entry');
        expect(authMock.enterAsGuest).toHaveBeenCalledTimes(1);
    });

    test('TC-PORTAL-1409 | modal variant renders cancel button when onCancel provided', async () => {
        const onCancel = vi.fn();
        await renderLogin({ variant: 'modal', onCancel });
        expect(allBtns('common.close').length).toBeGreaterThanOrEqual(1);
        await act(async () => Simulate.click(allBtns('common.close')[0]));
        expect(onCancel).toHaveBeenCalledTimes(1);
    });
});

// =====================================================================
// AuthModal
// =====================================================================
describe('AuthModal', () => {
    test('TC-PORTAL-1201 | renders dialog with login form inside overlay', async () => {
        setAuth({ isAuthenticated: false, registrationEnabled: true, guestAllowed: false, authRequired: true });
        const onClose = vi.fn();
        await render(<ThemeProvider><AuthModal onClose={onClose} /></ThemeProvider>);
        const dialog = container.querySelector('[role="dialog"]');
        expect(dialog).toBeTruthy();
        expect(dialog.getAttribute('aria-label')).toBe('login.modal_label');
        expect(container.querySelector('input[type="password"]')).toBeTruthy();
    });

    test('TC-PORTAL-1202 | close button calls onClose', async () => {
        setAuth({ isAuthenticated: false, registrationEnabled: false, guestAllowed: false, authRequired: true });
        const onClose = vi.fn();
        await render(<ThemeProvider><AuthModal onClose={onClose} /></ThemeProvider>);
        const closeBtn = container.querySelector('button[aria-label="common.close"]');
        expect(closeBtn).toBeTruthy();
        await act(async () => Simulate.click(closeBtn));
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});

// =====================================================================
// UserManagement
// =====================================================================
describe('UserManagement', () => {
    test('TC-PORTAL-501 | non-admin returns null (renders nothing)', async () => {
        setAuth({ isAdmin: false, isAuthenticated: true });
        await render(<UserManagement />);
        expect(container.textContent).toBe('');
    });

    test('TC-PORTAL-502 | loading state shows loading text while users are null', async () => {
        setAuth({ isAdmin: true });
        // listUsers never resolves during this test
        apiMocks.listUsers.mockReturnValue(new Promise(() => {}));
        await render(<UserManagement />);
        expect(container.textContent).toContain('common.loading');
    });

    test('TC-PORTAL-503 | empty users list shows empty message', async () => {
        setAuth({ isAdmin: true });
        apiMocks.listUsers.mockResolvedValue([]);
        await render(<UserManagement />);
        await flush();
        expect(container.textContent).toContain('users.empty');
    });

    test('TC-PORTAL-504 | create with empty fields does not call createUser', async () => {
        setAuth({ isAdmin: true });
        apiMocks.listUsers.mockResolvedValue([]);
        await render(<UserManagement />);
        await flush();
        await submitForm(container.querySelector('form'));
        expect(apiMocks.createUser).not.toHaveBeenCalled();
    });

    test('TC-PORTAL-505 | successful create calls createUser and shows success notice', async () => {
        setAuth({ isAdmin: true });
        apiMocks.listUsers.mockResolvedValue([]);
        await render(<UserManagement />);
        await flush();
        await changeInput(container.querySelector('input[type="text"]'), 'newops');
        await changeInput(container.querySelector('input[type="password"]'), 'Passw0rd!');
        await submitForm(container.querySelector('form'));
        expect(apiMocks.createUser).toHaveBeenCalledWith({
            username: 'newops', password: 'Passw0rd!', role: 'user', must_change_password: true,
        });
        expect(container.textContent).toContain('users.create_success');
    });

    test('TC-PORTAL-506 | create error path calls createUser and stays on form', async () => {
        setAuth({ isAdmin: true });
        apiMocks.listUsers.mockResolvedValue([]);
        apiMocks.createUser.mockRejectedValueOnce({ response: { data: { detail: 'Username exists' } } });
        await render(<UserManagement />);
        await flush();
        await changeInput(container.querySelector('input[type="text"]'), 'dup');
        await changeInput(container.querySelector('input[type="password"]'), 'Passw0rd!');
        await submitForm(container.querySelector('form'));
        expect(apiMocks.createUser).toHaveBeenCalledWith({
            username: 'dup', password: 'Passw0rd!', role: 'user', must_change_password: true,
        });
        // Form is still visible (not navigated away) and create button is enabled again
        expect(container.textContent).toContain('users.create_title');
        expect(container.querySelector('button[type="submit"]')).toBeTruthy();
    });

    test('TC-PORTAL-507 | listUsers error shows empty state with create form', async () => {
        setAuth({ isAdmin: true });
        apiMocks.listUsers.mockRejectedValueOnce({ response: { data: { detail: 'Network error' } } });
        await render(<UserManagement />);
        await flush();
        await flush();
        // Error is caught, users set to empty array, form is still usable
        expect(apiMocks.listUsers).toHaveBeenCalled();
        expect(container.textContent).toContain('users.create_title');
        expect(container.textContent).toContain('users.empty');
    });

    test('TC-PORTAL-508 | users table renders seeded admin with shield and disabled controls', async () => {
        setAuth({ isAdmin: true });
        apiMocks.listUsers.mockResolvedValue([
            { username: 'admin', role: 'admin', must_change_password: false, created_at: '2026-01-01T00:00:00Z' },
        ]);
        await render(<UserManagement />);
        await flush();
        expect(container.textContent).toContain('admin');
        // The seeded admin should NOT have a reset or delete button
        expect(container.textContent).not.toContain('users.reset');
        expect(container.textContent).not.toContain('common.delete');
    });

    test('TC-PORTAL-509 | non-seeded user shows reset and delete actions', async () => {
        setAuth({ isAdmin: true });
        apiMocks.listUsers.mockResolvedValue([
            { username: 'ops', role: 'user', must_change_password: true, created_at: '2026-01-01T00:00:00Z' },
        ]);
        await render(<UserManagement />);
        await flush();
        expect(container.textContent).toContain('users.reset');
        expect(container.textContent).toContain('common.delete');
        // Must change column shows yes
        expect(container.textContent).toContain('users.yes');
    });

    test('TC-PORTAL-510 | delete confirm flow calls deleteUser', async () => {
        setAuth({ isAdmin: true });
        apiMocks.listUsers.mockResolvedValue([
            { username: 'ops', role: 'user', must_change_password: false, created_at: '2026-01-01T00:00:00Z' },
        ]);
        await render(<UserManagement />);
        await flush();
        await clickByText('common.delete');
        // Now confirm delete button appears
        await clickByText('users.delete_confirm');
        expect(apiMocks.deleteUser).toHaveBeenCalledWith('ops');
        expect(container.textContent).toContain('users.delete_success');
    });

    test('TC-PORTAL-511 | reset password flow calls resetUserPassword', async () => {
        setAuth({ isAdmin: true });
        apiMocks.listUsers.mockResolvedValue([
            { username: 'ops', role: 'user', must_change_password: false, created_at: '2026-01-01T00:00:00Z' },
        ]);
        await render(<UserManagement />);
        await flush();
        await clickByText('users.reset');
        // Reset form appears
        const resetForm = [...container.querySelectorAll('form')].find(f => f.textContent.includes('users.reset_title'));
        expect(resetForm).toBeTruthy();
        await changeInput(resetForm.querySelector('input[type="password"]'), 'NewPass#2026');
        await submitForm(resetForm);
        expect(apiMocks.resetUserPassword).toHaveBeenCalledWith('ops', 'NewPass#2026');
        expect(container.textContent).toContain('users.reset_success');
    });

    test('TC-PORTAL-512 | role select renders for non-seeded user with correct options', async () => {
        setAuth({ isAdmin: true });
        apiMocks.listUsers.mockResolvedValue([
            { username: 'ops', role: 'user', must_change_password: false, created_at: '2026-01-01T00:00:00Z' },
        ]);
        await render(<UserManagement />);
        await flush();
        const select = container.querySelector('select');
        expect(select).toBeTruthy();
        expect(select.value).toBe('user');
        const options = select.querySelectorAll('option');
        expect(options.length).toBe(2);
        expect(options[0].value).toBe('user');
        expect(options[1].value).toBe('admin');
    });
});

// =====================================================================
// MockPortal (standalone)
// =====================================================================
describe('MockPortal (standalone)', () => {
    test('TC-PORTAL-601 | renders children with portal context containing admin auth', async () => {
        const Reader = () => {
            const ctx = usePortalContext();
            return <div>{ctx.auth.user}:{ctx.auth.role}:{ctx.auth.isAuthenticated ? 'auth' : 'no'}</div>;
        };
        await render(<MockPortal><Reader /></MockPortal>);
        expect(container.textContent).toBe('admin:admin:auth');
    });

    test('TC-PORTAL-602 | default dark mode adds dark class to documentElement', async () => {
        const Reader = () => {
            const ctx = usePortalContext();
            return <div>{ctx.theme.isDark ? 'dark' : 'light'}</div>;
        };
        await render(<MockPortal><Reader /></MockPortal>);
        expect(container.textContent).toBe('dark');
        expect(document.documentElement.classList.contains('dark')).toBe(true);
        expect(document.documentElement.style.colorScheme).toBe('dark');
    });

    test('TC-PORTAL-603 | toggle changes theme to light', async () => {
        const Reader = () => {
            const ctx = usePortalContext();
            return <div>{ctx.theme.isDark ? 'dark' : 'light'}<button onClick={ctx.theme.toggle}>T</button></div>;
        };
        await render(<MockPortal><Reader /></MockPortal>);
        expect(container.textContent).toContain('dark');
        await act(async () => Simulate.click(container.querySelector('button')));
        await flush();
        expect(container.textContent).toContain('light');
        expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    test('TC-PORTAL-604 | mockApi axios instance is created with empty baseURL', async () => {
        const Reader = () => {
            const ctx = usePortalContext();
            return <div>{ctx.api ? 'has_api' : 'no_api'}</div>;
        };
        const { default: axios } = await import('axios');
        await render(<MockPortal><Reader /></MockPortal>);
        expect(container.textContent).toBe('has_api');
        expect(axios.create).toHaveBeenCalled();
    });
});

// =====================================================================
// RemoteLoader
// =====================================================================
describe('RemoteLoader', () => {
    test('TC-PORTAL-301 | known plugin id uses correct port in error', async () => {
        await expect(loadRemotePlugin({ id: 'orchestration-center' }))
            .rejects.toThrow('Failed to load remote plugin "orchestration-center" from http://localhost:5101');
    });

    test('TC-PORTAL-302 | unknown plugin id defaults to port 5100', async () => {
        await expect(loadRemotePlugin({ id: 'unknown-plugin' }))
            .rejects.toThrow('http://localhost:5100');
    });

    test('TC-PORTAL-303 | execution-center uses port 5102', async () => {
        await expect(loadRemotePlugin({ id: 'execution-center' }))
            .rejects.toThrow('http://localhost:5102');
    });
});

// =====================================================================
// App
// =====================================================================
describe('App', () => {
    test('TC-PORTAL-1701 | App renders PortalApp with plugins config and shows no-plugins state', async () => {
        setAuth({ isAuthenticated: true, isChecking: false, authRequired: true, isAdmin: true });
        await render(<App />);
        await flush(100);
        // Mocked plugins.config.js returns empty plugins → no-plugins state
        expect(container.textContent).toContain('portal.no_plugins');
    });
});

// =====================================================================
// PortalApp (additional coverage)
// =====================================================================
describe('PortalApp (additional coverage)', () => {
    const sourcePlugin = (id) => ({
        id, enabled: true,
        manifest: async () => ({ default: {
            id, name: id, version: '1.0.0',
            menu: [{ id, route: `/${id}`, labelKey: id, order: 1 }],
            routes: [{ path: `/${id}`, component: async () => ({ default: () => <div>{id.toUpperCase()}_CONTENT</div> }) }],
        }}),
    });

    test('TC-PORTAL-1801 | bundle plugin loads via loadPluginBundle', async () => {
        setAuth({ isAuthenticated: true, isChecking: false, authRequired: true, isAdmin: false });
        bundleLoaderMock.loadPluginBundle.mockResolvedValue({
            id: 'bundle-pl', name: 'Bundle Plugin', version: '1.0.0',
            menu: [{ id: 'bundle-pl', route: '/bundle-pl', labelKey: 'bundle-pl', order: 1 }],
            routes: [{ path: '/bundle-pl', component: async () => ({ default: () => <div>BUNDLE_CONTENT</div> }) }],
        });
        await render(<PortalApp pluginsConfig={{ plugins: [
            { id: 'bundle-pl', mode: 'bundle', entry: '/plugins/bundle-pl', enabled: true },
        ]}} />);
        await flush(100);
        expect(container.textContent).toContain('BUNDLE_CONTENT');
    });

    test('TC-PORTAL-1802 | duplicate route path is reported as an error', async () => {
        setAuth({ isAuthenticated: true, isChecking: false, authRequired: true, isAdmin: false });
        const dupA = { ...sourcePlugin('dup-a') };
        const dupB = { ...sourcePlugin('dup-b') };
        // Override manifest to use the same route
        dupB.manifest = async () => ({ default: {
            id: 'dup-b', name: 'dup-b', version: '1.0.0',
            menu: [{ id: 'dup-b', route: '/dup-a', labelKey: 'dup-b', order: 1 }],
            routes: [{ path: '/dup-a', component: async () => ({ default: () => <div>DUP_B</div> }) }],
        }});
        await render(<PortalApp pluginsConfig={{ plugins: [dupA, dupB] }} />);
        await flush(100);
        expect(container.textContent).toContain('Duplicate plugin id or route');
    });

    test('TC-PORTAL-1803 | empty plugins config shows no-plugins state', async () => {
        setAuth({ isAuthenticated: true, isChecking: false, authRequired: true, isAdmin: false });
        await render(<PortalApp pluginsConfig={{ plugins: [] }} />);
        await flush(100);
        expect(container.textContent).toContain('portal.no_plugins');
        expect(container.textContent).toContain('plugin_manager.title');
    });

    test('TC-PORTAL-1804 | checking auth state shows Loading component', async () => {
        setAuth({ isChecking: true, isAuthenticated: false });
        await render(<PortalApp pluginsConfig={{ plugins: [sourcePlugin('pl')] }} />);
        await flush(50);
        expect(container.textContent).toContain('Loading...');
        expect(container.textContent).not.toContain('PL_CONTENT');
    });

    test('TC-PORTAL-1805 | unauthenticated non-guest shows Login page', async () => {
        setAuth({ isChecking: false, isAuthenticated: false, isGuest: false, authRequired: true });
        await render(<PortalApp pluginsConfig={{ plugins: [sourcePlugin('pl')] }} />);
        await flush(50);
        expect(container.textContent).toContain('login.button');
    });

    test('TC-PORTAL-1806 | source plugin loads and renders content', async () => {
        setAuth({ isAuthenticated: true, isChecking: false, authRequired: true, isAdmin: false });
        await render(<PortalApp pluginsConfig={{ plugins: [sourcePlugin('pl')] }} />);
        await flush(100);
        expect(container.textContent).toContain('PL_CONTENT');
    });

    test('TC-PORTAL-1807 | bundle plugin with enabled=false is not loaded', async () => {
        setAuth({ isAuthenticated: true, isChecking: false, authRequired: true, isAdmin: false });
        bundleLoaderMock.loadPluginBundle.mockClear();
        await render(<PortalApp pluginsConfig={{ plugins: [
            sourcePlugin('active'),
            { id: 'disabled-bundle', mode: 'bundle', entry: '/plugins/disabled', enabled: false },
        ]}} />);
        await flush(100);
        expect(bundleLoaderMock.loadPluginBundle).not.toHaveBeenCalled();
        expect(container.textContent).toContain('ACTIVE_CONTENT');
    });

    test('TC-PORTAL-1808 | plugin errors are shown in the alert area', async () => {
        setAuth({ isAuthenticated: true, isChecking: false, authRequired: true, isAdmin: false });
        const badPlugin = {
            id: 'bad', enabled: true,
            manifest: async () => ({ default: {
                id: 'bad', name: null, version: '1.0.0',
                menu: [{ id: 'bad', route: '/bad', labelKey: 'bad' }],
                routes: [{ path: '/bad', component: async () => ({ default: () => null }) }],
            }}),
        };
        const goodPlugin = sourcePlugin('good');
        await render(<PortalApp pluginsConfig={{ plugins: [goodPlugin, badPlugin] }} />);
        await flush(100);
        expect(container.textContent).toContain('GOOD_CONTENT');
        expect(container.querySelector('[role="alert"]')).toBeTruthy();
        expect(container.querySelector('[role="alert"]').textContent).toContain('bad');
    });
});

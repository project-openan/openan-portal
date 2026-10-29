import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
const state = vi.hoisted(() => ({ mustChange: false }));
vi.mock('../portal/src/service/api.js', () => ({
    default: { get: vi.fn(), post: vi.fn() }, createApi: vi.fn(() => ({ get: vi.fn() })),
    authCheck: async () => ({ auth_required: true, authenticated: true, username: 'operator', role: 'admin', must_change_password: state.mustChange }),
    login: async () => ({ username: 'operator', role: 'admin', must_change_password: false }),
    logout: vi.fn(), changePassword: vi.fn(async () => {}),
    // Per-user plugin preferences mirror the browser-local list while
    // nothing has been stored server-side yet.
    getDisabledPlugins: async () => ({
        disabled_plugins: JSON.parse(localStorage.getItem('openan-disabled-plugins') || '[]'),
        stored: false,
    }),
    setDisabledPlugins: vi.fn(async () => ({})),
}));
import { changePassword } from '../portal/src/service/api.js';
import { PortalApp } from '../portal/src/PortalApp.jsx';
import { usePortalContext } from '@openan/portal-sdk';
import i18n from '../portal/src/i18n/index.js';
let node, root;
const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
const Healthy = () => <div>HEALTHY_CONTENT {usePortalContext().auth.role}</div>;
const plugin = (id, Component = Healthy, extra = {}) => ({ id, enabled: true, manifest: async () => ({ default: {
    id, name: id, version: '1.0.0', menu: [{ id, route: `/${id}`, labelKey: id }],
    routes: [{ path: `/${id}`, component: async () => ({ default: Component }) }], ...extra,
} }) });
const render = async plugins => { await act(async () => root.render(<PortalApp pluginsConfig={{ plugins }} />)); await flush(); };
const click = async button => { expect(button).toBeTruthy(); await act(async () => Simulate.click(button)); await flush(); };
beforeEach(async () => {
    localStorage.clear(); state.mustChange = false; vi.clearAllMocks();
    window.history.replaceState({}, '', '/'); await i18n.changeLanguage('en');
    node = document.createElement('div'); document.body.appendChild(node); root = createRoot(node);
    vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => { await act(async () => root.unmount()); node.remove(); });

test('all-disabled plugins can be enabled again from the empty state and persisted', async () => {
    localStorage.setItem('openan-disabled-plugins', '["healthy"]'); await render([plugin('healthy')]);
    await click([...node.querySelectorAll('button')].find(b => b.textContent === 'Plugin Management'));
    expect(node.querySelector('h2').textContent).toBe('Plugin Management');
    await click(node.querySelector('button[aria-label="Enable"]'));
    expect(node.textContent).toContain('HEALTHY_CONTENT');
    expect(JSON.parse(localStorage.getItem('openan-disabled-plugins'))).toEqual([]);
});
test('header provides a reachable manager', async () => {
    await render([plugin('healthy')]);
    await click(node.querySelector('button[aria-label="Settings"]'));
    const item = [...node.querySelectorAll('button')].find((b) => b.textContent.startsWith('Plugin Management'));
    await click(item);
    expect(node.querySelector('h2').textContent).toBe('Plugin Management');
});
test('crashing plugin does not poison another route', async () => {
    window.history.replaceState({}, '', '/broken');
    await render([plugin('broken', () => { throw new Error('synthetic failure'); }), plugin('healthy')]);
    expect(node.textContent).toContain('Plugin Error');
    await click([...node.querySelectorAll('button')].find(b => b.textContent === 'healthy'));
    expect(window.location.pathname).toBe('/healthy'); expect(node.textContent).toContain('HEALTHY_CONTENT');
    expect(node.textContent).not.toContain('Plugin Error');
});
test('invalid manifest and failed locale remain local to their plugin', async () => {
    await render([plugin('healthy'), plugin('invalid', Healthy, { name: null }),
        plugin('locale', Healthy, { i18n: { namespace: 'locale', resources: { en: () => Promise.reject(new Error('locale failure')) } } })]);
    expect(node.textContent).toContain('HEALTHY_CONTENT');
    expect(node.querySelector('[role=alert]').textContent).toContain('invalid');
    expect(node.querySelector('[role=alert]').textContent).toContain('locale');
});
test('invalid gateway is isolated before it can crash the shell API factory', async () => {
    await render([plugin('healthy'), plugin('bad-gateway', Healthy, { backend: { gateway: {} } })]);
    expect(node.textContent).toContain('HEALTHY_CONTENT'); expect(node.textContent).toContain('backend.gateway must be');
});
test('unknown nested URL redirects instead of displaying an empty page', async () => {
    window.history.replaceState({}, '', '/healthy/not-a-route');
    await render([plugin('healthy')]);
    expect(window.location.pathname).toBe('/healthy'); expect(node.textContent).toContain('HEALTHY_CONTENT');
});
test('unsupported manifest lifecycle is rejected explicitly, not silently ignored', async () => {
    await render([plugin('healthy'), plugin('hooks', Healthy, { onInit: vi.fn() })]);
    expect(node.textContent).toContain('HEALTHY_CONTENT'); expect(node.textContent).toContain('onInit is unsupported');
});
test('actual role is propagated', async () => {
    await render([plugin('healthy')]); expect(node.textContent).toContain('HEALTHY_CONTENT admin');
});
test('shared workflow messages exist without the disabled source orchestration plugin', () => {
    expect(i18n.t('workflow_empty.title')).toBe('No Workflow Data');
    expect(i18n.t('workflow_loader.initializing')).toBe('Initializing data...');
});
test('required password change gates applications and returns to login after success', async () => {
    state.mustChange = true; await render([plugin('healthy')]);
    expect(node.textContent).not.toContain('HEALTHY_CONTENT');
    const change = async (name, value) => act(async () => Simulate.change(node.querySelector(`input[name=${name}]`), { target: { value } }));
    await change('old', 'old-placeholder'); await change('new', 'new-placeholder'); await change('confirm', 'mismatch');
    await act(async () => Simulate.submit(node.querySelector('form')));
    expect(changePassword).not.toHaveBeenCalled(); expect(node.querySelector('[role=alert]').textContent).toContain('do not match');
    await change('confirm', 'new-placeholder');
    await act(async () => Simulate.submit(node.querySelector('form'))); await flush();
    expect(changePassword).toHaveBeenCalledWith('old-placeholder', 'new-placeholder');
    expect(node.textContent).toContain('Please sign in again'); expect(node.textContent).not.toContain('HEALTHY_CONTENT');
});
test('structured password-change event gates existing session, ordinary 403 is not a logout', async () => {
    await render([plugin('healthy')]);
    await act(async () => window.dispatchEvent(new Event('auth-password-change-required'))); await flush();
    expect(node.querySelectorAll('input[type=password]')).toHaveLength(3);
    expect(node.textContent).not.toContain('HEALTHY_CONTENT');
});
test.each(['manifest', 'locale'])('pending source %s is isolated by its deadline', async resource => {
    vi.useFakeTimers();
    try {
        const pending = resource === 'manifest'
            ? { id: 'pending', manifest: () => new Promise(() => {}) }
            : plugin('pending', Healthy, { i18n: { namespace: 'pending', resources: { en: () => new Promise(() => {}) } } });
        await act(async () => root.render(<PortalApp pluginsConfig={{ plugins: [plugin('healthy'), pending] }} />));
        await act(async () => vi.advanceTimersByTimeAsync(60001));
        expect(node.textContent).toContain('HEALTHY_CONTENT');
        expect(node.querySelector('[role=alert]').textContent).toContain('timed out');
        expect(node.querySelector('button[aria-label="Settings"]')).toBeTruthy();
    } finally { vi.useRealTimers(); }
});

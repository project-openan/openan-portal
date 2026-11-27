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

/**
 * Plugin bundle loader — loads independently-built plugin artifacts (js/css).
 *
 * Two modes, both consuming PACKAGED plugin output (not source):
 *
 * 1. LOCAL mode — artifacts copied under portal/public/plugins/<id>/
 *    The plugin website is built independently; its js/css are copied into
 *    the Portal's plugin directory. Loaded via <script>/<link> from same origin.
 *
 * 2. REMOTE mode — artifacts served by the plugin website's own server
 *    Loaded via <script>/<link> from an http(s) URL at runtime.
 *
 * Bundle contract (produced by the plugin's own build):
 *
 *   plugins/<id>/
 *   ├── plugin.manifest.json   ← metadata: id, name, version, menu, routes, entry, css
 *   ├── index.js               ← UMD bundle, sets window.__OPENAN_PLUGIN__<id>
 *   └── index.css              ← plugin styles
 *
 * The js bundle must assign a global:
 *   window.__OPENAN_PLUGIN__<id> = { default: ReactComponent }
 */

// Static imports — these modules are already part of the main bundle (the app
// imports them everywhere). Using static imports here avoids the production
// interop-mangling that dynamic import() undergoes after minification.
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as ReactI18next from 'react-i18next';
import * as PortalSDK from '@openan/portal-sdk';
import { withPluginDeadline, validateManifestMetadata } from '@openan/portal-sdk';

// Wrap in a function so the modules stay lazily-referenced at call time.
function getStaticModules() {
    return { React, ReactDOM, ReactI18next, PortalSDK };
}

const loadedScripts = new Set();
const loadedStyles = new Set();

function injectResource(url, style, signal) {
    return new Promise((resolve, reject) => {
        if (signal.aborted) return reject(signal.reason);
        const loaded = style ? loadedStyles : loadedScripts;
        if (loaded.has(url)) return resolve();
        const element = document.createElement(style ? 'link' : 'script');
        if (style) { element.rel = 'stylesheet'; element.href = url; }
        else element.src = url;
        const cleanup = () => {
            element.onload = null; element.onerror = null;
            signal.removeEventListener('abort', abort);
        };
        const fail = error => { cleanup(); element.remove(); reject(error); };
        const abort = () => fail(signal.reason);
        element.onload = () => {
            cleanup(); loaded.add(url);
            resolve();
        };
        element.onerror = () => fail(new Error(`Failed to load ${style ? 'stylesheet' : 'script'}: ${url}`));
        signal.addEventListener('abort', abort, { once: true });
        document.head.appendChild(element);
    });
}

const sleep = (ms, signal) => new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
});

// Fetch with one retry — a transient failure (e.g. a redeploy happening while
// the page loads) must not silently drop a plugin for the whole session.
async function fetchJson(url, signal, attempts = 2) {
    let lastErr;
    for (let i = 0; i < attempts; i++) {
        try {
            const resp = await fetch(url, { cache: 'no-store', signal });
            if (!resp.ok) throw new Error(`Failed to fetch ${url}: ${resp.status}`);
            return await resp.json();
        } catch (err) {
            if (signal.aborted) throw signal.reason;
            lastErr = err;
            if (i < attempts - 1) await sleep(800, signal);
        }
    }
    throw lastErr;
}

async function loadResourceRetry(src, style, signal, attempts = 2) {
    let lastErr;
    for (let i = 0; i < attempts; i++) {
        try {
            await injectResource(src, style, signal);
            return;
        } catch (err) {
            if (signal.aborted) throw signal.reason;
            lastErr = err;
            if (i < attempts - 1) await sleep(800, signal);
        }
    }
    throw lastErr;
}

/**
 * Expose the Portal's own modules as window globals BEFORE a UMD bundle is
 * injected. UMD bundles declare these as external with globals like
 * React / ReactDOM / ReactI18next / OpenANPortalSDK — a plain <script> tag
 * cannot resolve bare imports, so the Portal must satisfy them via globals.
 * Each UMD bundle then shares the Portal's single React instance.
 */
async function ensureRuntimeGlobals() {
    if (window.__OPENAN_BUNDLE_GLOBALS_READY__) return;

    // Legacy bundles use this marker and the host-wide language singleton.
    // Never expose per-plugin API/auth/router state through this bridge.
    const { default: i18n } = await import('./i18n/index.js');
    window.__OPENAN_PORTAL_CONTEXT__ = Object.freeze({ mode: 'portal', i18n });

    // Node-style `process` shim — UMD builds (e.g. React dev builds bundled
    // inside plugin artifacts) read process.env.NODE_ENV. Browsers don't
    // define `process`, so provide a minimal stub before any bundle loads.
    if (typeof window.process === 'undefined') {
        window.process = { env: { NODE_ENV: 'production' }, browser: true };
    }

    // Use the modules passed in by the STATIC top-level imports (see imports
    // above). Dynamic import() in production builds gets rewritten with interop
    // helpers that mangle module namespaces; static imports are safe and the
    // modules are already in the main bundle anyway.
    const { React, ReactDOM, ReactI18next, PortalSDK } = getStaticModules();

    window.React = React;
    window.ReactDOM = ReactDOM;
    window.ReactI18next = ReactI18next;
    window.OpenANPortalSDK = PortalSDK;

    // CJS `require` shim — some deps bundled inside plugin UMD artifacts
    // (e.g. use-sync-external-store shims from react-i18next) emit dead-but-
    // executed `require("react")` calls at module init. Route them to the
    // Portal's runtime globals instead of throwing ReferenceError.
    //
    // Interop-safe: each entry carries BOTH named exports and a `default`
    // pointing to an object with the same named exports, so UMD interop
    // (`n.usePortalContext`) and CJS-style access (`n.default.usePortalContext`)
    // both resolve.
    const toCjsShape = (mod) => {
        const named = {};
        for (const k of Object.keys(mod)) {
            if (k !== 'default' && k !== '__esModule') named[k] = mod[k];
        }
        return { __esModule: true, ...named, default: { ...named, ...(mod.default && typeof mod.default === 'object' ? mod.default : {}) } };
    };

    if (typeof window.require === 'undefined') {
        const requireMap = {
            react: toCjsShape(React),
            'react-dom': toCjsShape(ReactDOM),
            'react-i18next': toCjsShape(ReactI18next),
            '@openan/portal-sdk': toCjsShape(PortalSDK),
        };
        // jsx-runtime: React's ESM namespace in Vite doesn't expose jsxRuntime
        // as a property — build it from the jsx/jsxs/Fragment exports that DO
        // exist on the namespace (Vite serves them flattened).
        if (React.jsx || React.jsxs || React.Fragment) {
            requireMap['react/jsx-runtime'] = toCjsShape({
                jsx: React.jsx, jsxs: React.jsxs, Fragment: React.Fragment,
            });
        }
        if (React.jsxDEV) {
            requireMap['react/jsx-dev-runtime'] = toCjsShape({
                jsxDEV: React.jsxDEV, Fragment: React.Fragment,
            });
        }
        window.require = (id) => {
            if (id in requireMap) return requireMap[id];
            throw new Error(`[Portal bundle-loader] require("${id}") is not available in the browser`);
        };
        // Also fix the direct UMD globals with the same interop-safe shape —
        // the UMD wrapper for `@openan/portal-sdk` external maps to
        // window.OpenANPortalSDK and factory receives it as-is.
        window.React = requireMap.react;
        window.ReactDOM = requireMap['react-dom'];
        window.ReactI18next = requireMap['react-i18next'];
        window.OpenANPortalSDK = requireMap['@openan/portal-sdk'];
    }

    window.__OPENAN_BUNDLE_GLOBALS_READY__ = true;
}

/**
 * Resolve a plugin's artifact base URL from its config entry.
 *
 * entry can be:
 *   - '/plugins/registry-center'           → LOCAL mode (same-origin path)
 *   - 'http://host:5000/plugins/registry'   → REMOTE mode (absolute URL)
 */
function resolveBaseUrl(entry) {
    return entry.replace(/\/+$/, '');
}

/**
 * Load a packaged plugin (local or remote).
 *
 * @param {Object} entryCfg — { id, entry } from plugins config
 * @returns {Promise<{manifest: Object, Component: Function}>}
 */
export function loadPluginBundle(entryCfg, options = {}) {
    return withPluginDeadline(signal => loadBundle(entryCfg, signal), { ...options, label: `Plugin ${entryCfg.id} bundle` });
}

async function loadBundle(entryCfg, signal) {
    const base = resolveBaseUrl(entryCfg.entry);
    const isRemote = /^https?:\/\//.test(base);

    // 0. Expose React/ReactDOM/ReactI18next/PortalSDK as globals so the
    //    UMD bundle's externals resolve against the Portal's instances.
    await ensureRuntimeGlobals();
    signal.throwIfAborted();

    // 1. Load manifest (json — works for both local and remote)
    const manifest = validateManifestMetadata(await fetchJson(`${base}/plugin.manifest.json`, signal));
    if (manifest.id !== entryCfg.id) throw new Error('Configured plugin id does not match its manifest');
    const requiredRoutes = entryCfg.requiredRoutes ?? [];
    if (!Array.isArray(requiredRoutes)) {
        throw new Error(`Configured requiredRoutes for "${entryCfg.id}" must be an array of route paths.`);
    }
    const missingRoutes = requiredRoutes.filter(path => !manifest.routes.some(route => route.path === path));
    if (missingRoutes.length) {
        throw new Error(
            `Plugin "${manifest.id}" artifact is missing required native pages (${missingRoutes.join(', ')}); ` +
            'rebuild and install the component bundle.'
        );
    }

    // 2. Load styles
    if (manifest.css) {
        await loadResourceRetry(`${base}/${manifest.css}`, true, signal);
    }

    // 3. Load the js bundle (UMD → sets a global)
    const globalKey = `__OPENAN_PLUGIN__${manifest.id.replace(/-/g, '_')}`;
    await loadResourceRetry(`${base}/${manifest.entry || 'index.js'}`, false, signal);
    signal.throwIfAborted();

    // 4. Read the global the bundle exposed
    const bundle = window[globalKey];
    if (!bundle) {
        throw new Error(
            `Plugin "${manifest.id}" bundle loaded but window.${globalKey} is not set. ` +
            'Ensure the plugin build assigns its component to this global.'
        );
    }

    // 5. Wrap manifest routes so component is already resolved
    manifest.routes = (manifest.routes || []).map((route) => {
        const name = route.componentExport || 'default';
        // Own-property lookup only: a name such as "constructor" must not
        // resolve through the prototype chain and bypass this contract.
        const ownExport = Object.prototype.hasOwnProperty.call(bundle, name);
        const Component = ownExport ? bundle[name]
            : (name === 'default' && typeof bundle === 'function' ? bundle : null);
        if (!Component || (typeof Component !== 'function' && typeof Component !== 'object')) {
            throw new Error(`Plugin "${manifest.id}" does not export route component "${name}".`);
        }
        return {...route, component: () => Promise.resolve({default: Component})};
    });

    // 6. i18n fallback — bundle manifests carry no locale files, so their
    //    "namespace:key" style labelKeys (e.g. 'registry-center:registry.title')
    //    have no translations in the Portal. Rewrite such keys to the plugin's
    //    display name; plain readable labels (e.g. 'Ontology T-Box') stay as-is.
    //    Register every label used (item labels, group labels, plugin name)
    //    into the Portal's base i18n with zh translations.
    if (manifest.menu) {
        const i18n = (await import('./i18n/index.js')).default;
        const zhNames = {
            'Registry Center': '注册中心',
            'Orchestration Center': '编排中心',
            'Execution Center': '执行中心',
            'Skill Center': '技能中心',
            'Demo Showcase': '虚拟展厅',
            'Ontology Demo': '本体中心',
            'Ontology T-Box': '本体T-Box',
            'Ontology A-Box': '本体A-Box',
            'Ontology': '本体中心',
            'Ontology Center': '本体中心',
            'Observation Center': '可观测中心',
        };
        // Namespace-style keys (contain ':') cannot resolve without the plugin's
        // locale files — replace with the plain plugin display name.
        manifest.menu = manifest.menu.map((mi) => ({
            ...mi,
            labelKey: mi.labelKey && mi.labelKey.includes(':')
                ? (mi.label || manifest.name || mi.labelKey)
                : mi.labelKey,
        }));
        // Register every label this plugin renders (menu item labels, group
        // labels, plugin name) into the Portal's base translation namespace.
        const labelsToRegister = new Set([manifest.name]);
        for (const mi of manifest.menu) {
            labelsToRegister.add(mi.labelKey);
            if (mi.group) labelsToRegister.add(mi.group);
        }
        for (const label of labelsToRegister) {
            if (!label || i18n.exists(label)) continue;
            i18n.addResource('en', 'translation', label, label, { deep: true });
            i18n.addResource('zh', 'translation', label, zhNames[label] || label, { deep: true });
        }
    }

    manifest._loadMode = isRemote ? 'remote' : 'local';
    manifest._baseUrl = base;
    return manifest;
}

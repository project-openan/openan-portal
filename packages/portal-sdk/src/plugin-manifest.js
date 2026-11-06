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
 * Plugin Manifest — the declarative contract between a sub-application and
 * the Portal shell.  Each plugin exports a default object conforming to this
 * shape from its `plugin.manifest.js` file.
 *
 * @typedef {Object} MenuItem
 * @property {string}   id            — Unique menu item id (also used as tab key)
 * @property {string}   labelKey      — i18n key for the display label
 * @property {string}   [label]       — Readable fallback for a bundle menu
 * @property {import('react').ComponentType} icon — Icon component (e.g. lucide-react)
 * @property {number}   order         — Sort order in the navigation bar
 * @property {string[]} [permissions] — Required permissions (future use)
 * @property {string}   route         — Route path that this menu item activates
 *
 * @typedef {Object} PluginRoute
 * @property {string}   path          — Route path (e.g. "/orchestration")
 * @property {() => Promise<import('react').ComponentType>} component — Lazy component loader
 * @property {string}   menuId        — Associated menu item id (for active highlighting)
 * @property {string}   [componentExport] — Named UMD export for this route (default: default)
 * @property {boolean}  [keepMounted] — Retain a visited native editor while switching routes
 * @property {string[]} [permissions] — Required permissions (future use)
 *
 * @typedef {Object} PluginI18n
 * @property {string} namespace                              — i18n namespace for this plugin
 * @property {Object<string, () => Promise<Object>>} resources — { en: () => import(...), zh: () => import(...) }
 *
 * @typedef {Object} PluginManifest
 * @property {string}   id          — Unique plugin id (e.g. "orchestration-center")
 * @property {string}   name        — Human-readable display name
 * @property {string}   version     — Semantic version
 * @property {MenuItem[]}  menu     — Menu items to register in Portal navigation
 * @property {PluginRoute[]} routes  — Routes to register in Portal router
 * @property {PluginI18n} [i18n]     — Plugin-specific i18n resources
 * Lifecycle and resources belong to the React component (useEffect cleanup).
 * Menus/routes are declarative; imperative registration and manifest hooks
 * are deliberately unsupported, rather than silently ignored.
 * @property {{ enabled: boolean, entry: string }} [standalone] — Standalone mode config
 */

/**
 * Validate a plugin manifest object.  Throws with a descriptive message if
 * required fields are missing or have wrong types.
 *
 * @param {PluginManifest} manifest
 * @returns {PluginManifest} — the validated manifest (same reference)
 */
export function validateManifestMetadata(manifest) {
    const errors = [];

    if (!manifest || typeof manifest !== 'object') {
        throw new Error('Plugin manifest must be an object');
    }
    for (const hook of ['onInit', 'onActivate', 'onDeactivate']) {
        if (manifest[hook] !== undefined) errors.push(`${hook} is unsupported; use React component effects`);
    }
    if (!manifest.id || typeof manifest.id !== 'string') {
        errors.push('manifest.id is required (string)');
    }
    if (!manifest.name || typeof manifest.name !== 'string') {
        errors.push('manifest.name is required (string)');
    }
    if (!manifest.version || typeof manifest.version !== 'string') {
        errors.push('manifest.version is required (string)');
    }
    if (!Array.isArray(manifest.routes)) {
        errors.push('manifest.routes must be an array');
    } else {
        manifest.routes.forEach((r, i) => {
            if (typeof r?.path !== 'string' || !r.path.startsWith('/')) errors.push(`manifest.routes[${i}].path must be absolute`);
            if (r?.componentExport !== undefined && (typeof r.componentExport !== 'string' || !/^[A-Za-z_$][\w$]*$/.test(r.componentExport))) errors.push(`manifest.routes[${i}].componentExport must be an export name`);
            if (r?.keepMounted !== undefined && typeof r.keepMounted !== 'boolean') errors.push(`manifest.routes[${i}].keepMounted must be boolean`);
        });
        if (new Set(manifest.routes.map(r => r?.path)).size !== manifest.routes.length) errors.push('duplicate route path');
    }
    if (manifest.menu !== undefined && !Array.isArray(manifest.menu)) {
        errors.push('manifest.menu must be an array if present');
    }
    if (manifest.backend !== undefined && (typeof manifest.backend?.gateway !== 'string' ||
        !/^(\/|https?:\/\/)/.test(manifest.backend.gateway))) {
        errors.push('backend.gateway must be an absolute URL or same-origin path');
    }
    if (manifest.backend?.authScope !== undefined && !['host', 'component'].includes(manifest.backend.authScope)) {
        errors.push('backend.authScope must be host or component');
    }
    for (const file of ['entry', 'css']) {
        if (manifest[file] !== undefined && (typeof manifest[file] !== 'string' || !/^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(manifest[file]))) {
            errors.push(`unsafe artifact ${file} filename`);
        }
    }
    if (Array.isArray(manifest.menu)) {
        for (const item of manifest.menu) {
            if (!item?.id || typeof item.labelKey !== 'string' || typeof item.route !== 'string' || !item.route.startsWith('/')) {
                errors.push('menu entries require id, labelKey and absolute route');
            }
        }
    }
    if (manifest.i18n) {
        if (typeof manifest.i18n.namespace !== 'string' || !manifest.i18n.namespace) {
            errors.push('manifest.i18n.namespace is required when i18n is present');
        }
        if (!manifest.i18n.resources || typeof manifest.i18n.resources !== 'object' || Array.isArray(manifest.i18n.resources)) {
            errors.push('manifest.i18n.resources must be an object');
        } else if (Object.values(manifest.i18n.resources).some(loader => typeof loader !== 'function')) {
            errors.push('manifest.i18n.resources must contain loader functions (source mode only)');
        }
    }

    if (errors.length > 0) {
        throw new Error(`Invalid plugin manifest "${manifest.id || '?'}": ${errors.join('; ')}`);
    }
    return manifest;
}

/** The same declarative contract is checked before publication and loading. */
export function validateManifest(manifest) {
    validateManifestMetadata(manifest);
    manifest.routes.forEach((route, index) => {
        if (typeof route.component !== 'function') throw new Error(`Invalid plugin manifest "${manifest.id}": manifest.routes[${index}].component must be a lazy-import function`);
    });
    return manifest;
}

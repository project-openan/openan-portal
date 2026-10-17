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

import { createContext, useContext } from 'react';

/**
 * PortalContext — the shared capability surface injected into every plugin
 * by the Portal shell.
 *
 * @typedef {Object} PortalContextValue
 * @property {object} api                — Shared axios instance (gateway mode, httpOnly cookie)
 * @property {object} auth               — { user, role, isAuthenticated, login, logout, check }
 * @property {object} theme              — { isDark, toggle, setDark }
 * @property {object} i18n               — i18n instance (react-i18next), plugins use own namespace
 * @property {function} navigate         — React Router navigate function
 * @property {object} router              — { location, params, navigate }
 */

/** @type {import('react').Context<PortalContextValue|null>} */
export const PortalContext = createContext(null);

/**
 * Hook for plugins to access Portal-provided services.
 *
 * In normal mode (same Vite build), React Context works directly.
 *
 * Independently built UMD plugins MUST externalize @openan/portal-sdk and
 * React. The bundle loader supplies the host singleton. No mutable global
 * context fallback: it can leak another plugin's API during navigation.
 *
 * @returns {PortalContextValue}
 */
export function usePortalContext() {
    const ctx = useContext(PortalContext);
    if (ctx) return ctx;

    throw new Error(
        'usePortalContext() must be used within a <PortalProvider>. ' +
        'In standalone mode, wrap your component with <MockPortal> from ' +
        "'@openan/portal-sdk/standalone'."
    );
}

/**
 * PortalProvider — convenience wrapper for PortalContext.Provider.
 * The Portal shell wraps its content with this, injecting all shared services.
 */
export function PortalProvider({ value, children }) {
    return <PortalContext.Provider value={value}>{children}</PortalContext.Provider>;
}

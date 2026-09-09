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

import { Sparkles } from 'lucide-react';

/**
 * Hello Portal — reference implementation of the plugin contract.
 *
 * This is a complete, working example of how a plugin is defined. When
 * implementing a new plugin, copy this folder as a starting point and
 * study how each piece of the contract is exercised:
 *   1. Auto-discovery picks up this manifest from the plugins/ directory
 *      (no registration needed — just drop the folder in)
 *   2. Header renders the "Hello Portal" menu item dynamically from `menu`
 *   3. React Router serves the /hello route declared in `routes`
 *   4. The component accesses PortalContext (auth, theme, i18n) via
 *      usePortalContext()
 *   5. Plugin-specific i18n namespace loads and works
 *   6. `standalone` enables running the plugin in isolation via MockPortal
 */
export default {
    id: 'hello-portal',
    name: 'Hello Portal',
    version: '0.1.0',

    menu: [
        {
            id: 'hello',
            labelKey: 'hello-portal:nav.hello',
            icon: Sparkles,
            order: 1,
            route: '/hello',
        },
    ],

    routes: [
        {
            path: '/hello',
            component: () => import('./src/index.jsx'),
            menuId: 'hello',
        },
    ],

    i18n: {
        namespace: 'hello-portal',
        resources: {
            en: () => import('./src/locales/en.json'),
            zh: () => import('./src/locales/zh.json'),
        },
    },

    standalone: {
        enabled: true,
        entry: './src/standalone.jsx',
    },
};

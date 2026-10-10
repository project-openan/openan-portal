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
 * Plugin registry — MIXED loading modes.
 *
 * Three plugin kinds coexist:
 *
 * 1. SOURCE plugins — source code under plugins/, compiled by the Portal's
 *    Vite at build time (auto-discovered by the openan-plugin-discovery plugin).
 *
 * 2. LOCAL BUNDLE plugins — independently built js/css artifacts copied to
 *    portal/public/plugins/<id>/. Loaded at runtime via <script>/<link>
 *    from the same origin.
 *
 * 3. REMOTE BUNDLE plugins — artifacts served by the plugin website's own
 *    server. Loaded at runtime from an http(s) URL.
 *
 * Bundle contract per plugin directory (local or remote):
 *   plugin.manifest.json + index.js (UMD) + index.css
 */
import discovered from 'virtual:openan-plugins';

// Bundled plugins — LOCAL mode: artifacts under portal/public/plugins/
// REMOTE mode: change entry to the plugin server's absolute URL,
//   e.g. 'http://registry-center:5000/plugins/registry-center'
const bundledPlugins = [
    {
        id: 'registry-center',
        mode: 'bundle',
        entry: '/plugins/registry-center',   // → portal/public/plugins/registry-center
        enabled: true,
    },
    {
        id: 'orchestration-center',
        mode: 'bundle',
        entry: '/plugins/orchestration-center',   // → portal/public/plugins/orchestration-center
        enabled: true,
    },
    {
        id: 'ontology-demo',
        mode: 'bundle',
        entry: '/plugins/ontology-demo',   // → portal/public/plugins/ontology-demo
        enabled: true,
    },
    // Example REMOTE mode (served by the plugin's own server with CORS):
    // {
    //     id: 'demo-showcase-remote',
    //     mode: 'bundle',
    //     entry: 'http://localhost:5500/plugins/demo-showcase',  // http:// → REMOTE
    //     enabled: true,
    // },
];

export default {
    plugins: [
        ...discovered.plugins,
        ...bundledPlugins,
    ],
};

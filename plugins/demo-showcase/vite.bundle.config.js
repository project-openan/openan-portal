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
 * Standalone bundle build config for a plugin.
 *
 * Produces a self-contained UMD artifact that the Portal loads via
 * <script> tag (local copy or remote http), per the two-mode integration:
 *
 *   dist-bundle/
 *   ├── index.js              ← UMD, sets window.__OPENAN_PLUGIN__demo_showcase
 *   ├── index.css             ← extracted styles
 *   └── plugin.manifest.json  ← metadata for runtime loading
 *
 * Usage:  node ../../node_modules/vite/bin/vite.js build --config vite.bundle.config.js
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { readFileSync } from 'fs';

const root = import.meta.dirname;
const globalName = '__OPENAN_PLUGIN__demo_showcase';

// Parse manifest.js source as text and extract the JSON-able metadata.
// Simple regex extraction — the manifest is a flat literal object.
function buildManifestJson() {
    const src = readFileSync(path.resolve(root, 'plugin.manifest.js'), 'utf-8');

    const pick = (key, fallback) => {
        const m = src.match(new RegExp(`${key}:\\s*['"]([^'"]+)['"]`));
        return m ? m[1] : fallback;
    };

    const manifest = {
        id: pick('id', 'unknown'),
        name: pick('name', 'Unknown'),
        version: pick('version', '0.0.0'),

        // backend.gateway if declared
        backend: src.includes('gateway:') ? { gateway: pick('gateway', '') } : undefined,

        // menu items (icon excluded — runtime uses a default)
        menu: src.includes('menu:') ? [{
            id: pick("id", 'plugin'),
            labelKey: src.match(/labelKey:\s*'([^']+)'/)?.[1],
            order: Number(src.match(/order:\s*(\d+)/)?.[1] || 99),
            route: src.match(/route:\s*'([^']+)'/)?.[1],
        }] : [],

        // routes
        routes: [{
            path: src.match(/path:\s*'([^']+)'/)?.[1] || '/plugin',
            menuId: src.match(/menuId:\s*'([^']+)'/)?.[1],
        }],

        entry: 'index.js',
        css: 'index.css',
    };

    return JSON.stringify(manifest, null, 2);
}

export default defineConfig({
    plugins: [
        react(),
        {
            name: 'emit-plugin-manifest-json',
            generateBundle() {
                this.emitFile({
                    type: 'asset',
                    fileName: 'plugin.manifest.json',
                    source: buildManifestJson(),
                });
            },
        },
    ],
    build: {
        outDir: 'dist-bundle',
        lib: {
            entry: path.resolve(root, 'src/index.jsx'),
            name: globalName,
            formats: ['umd'],
            fileName: () => 'index.js',
        },
        rollupOptions: {
            // React must stay external — the Portal provides it at runtime.
            external: ['react', 'react-dom', 'react-dom/client'],
            output: {
                globals: {
                    react: 'React',
                    'react-dom': 'ReactDOM',
                    'react-dom/client': 'ReactDOM',
                },
                assetFileNames: 'index.css',
            },
        },
        cssCodeSplit: false,
    },
});

// SPDX-License-Identifier: Apache-2.0
import { build } from 'vite';
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectArtifact, installArtifact } from './plugin-artifacts.mjs';

const workspace = fileURLToPath(new URL('../', import.meta.url));
export async function buildIntegrations(output = path.join(workspace, 'integrations/dist-plugin')) {
    for (const id of ['observation-center', 'an-ontology']) {
        const source = path.join(workspace, 'integrations', id);
        const outDir = path.join(output, id);
        await build({
            configFile: false, root: workspace,
            esbuild: { jsx: 'transform', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment' },
            build: {
                outDir, emptyOutDir: false, cssCodeSplit: false,
                lib: { entry: path.join(source, 'index.jsx'), name: `__OPENAN_PLUGIN__${id.replaceAll('-', '_')}`, formats: ['umd'], fileName: () => 'index.js', cssFileName: 'index' },
                rollupOptions: { external: ['react', 'react-i18next', '@openan/portal-sdk'], output: { globals: { react: 'React', 'react-i18next': 'ReactI18next', '@openan/portal-sdk': 'OpenANPortalSDK' } } },
            },
        });
        await fs.copyFile(path.join(source, 'plugin.manifest.json'), path.join(outDir, 'plugin.manifest.json'));
        // Preserve a deployer's sidecar on rebuild; the template contains no
        // machine-specific URL. Configure it before installing the artifact.
        if (id === 'an-ontology') {
            try { await fs.copyFile(path.join(source, 'config.json'), path.join(outDir, 'config.json'), constants.COPYFILE_EXCL); }
            catch (error) { if (error.code !== 'EEXIST') throw error; }
        }
        await inspectArtifact(outDir, id);
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    await buildIntegrations();
    if (process.argv.includes('--install')) {
        for (const id of ['observation-center', 'an-ontology']) await installArtifact(path.join(workspace, 'integrations/dist-plugin', id), id);
    }
}

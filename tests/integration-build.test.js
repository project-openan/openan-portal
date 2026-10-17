// @vitest-environment node
// SPDX-License-Identifier: Apache-2.0
import { afterAll, beforeAll, expect, test } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as PortalSDK from '../packages/portal-sdk/src/index.js';
import { buildIntegrations } from '../scripts/build-integrations.mjs';
import { inspectArtifact } from '../scripts/plugin-artifacts.mjs';

let output;
beforeAll(async () => { output = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-adapter-build-')); await buildIntegrations(output); });
afterAll(async () => {
    expect(path.dirname(output)).toBe(os.tmpdir()); expect(path.basename(output)).toMatch(/^portal-adapter-build-/);
    await fs.rm(output, { recursive: true, force: true });
});
test.each(['observation-center', 'an-ontology'])('%s UMD exports a real component and shares the host SDK context', async id => {
    const directory = path.join(output, id);
    const { manifest, files } = await inspectArtifact(directory, id);
    expect(files).toContain('index.css'); expect(manifest.menu[0].route).toBe(manifest.routes[0].path);
    const context = { React, OpenANPortalSDK: PortalSDK, ReactI18next: { useTranslation: () => ({ i18n: { language: 'en' } }) },
        window: { location: { href: 'https://portal.example.org/' } }, document: { currentScript: { src: `https://cdn.example.org/${id}/index.js` } }, URL };
    vm.runInNewContext(await fs.readFile(path.join(directory, 'index.js'), 'utf8'), context);
    const Component = context[`__OPENAN_PLUGIN__${id.replaceAll('-', '_')}`];
    expect(typeof Component).toBe('function');
    const html = renderToStaticMarkup(React.createElement(PortalSDK.PortalProvider, { value: { api: {}, theme: { isDark: true } } }, React.createElement(Component)));
    expect(html).toContain('data-dark="true"'); expect(html).toContain(id === 'an-ontology' ? 'Ontology T-Box Editor' : 'Observation Center');
});
test('rebuilding preserves operator configuration in the output sidecar', async () => {
    const config = path.join(output, 'an-ontology/config.json');
    await fs.writeFile(config, '{"appUrl":"https://editor.example.org/"}');
    await buildIntegrations(output);
    expect(JSON.parse(await fs.readFile(config, 'utf8')).appUrl).toBe('https://editor.example.org/');
});

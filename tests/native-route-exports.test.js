// SPDX-License-Identifier: Apache-2.0
import {afterEach, expect, test, vi} from 'vitest';
import {loadPluginBundle} from '../portal/src/bundle-loader.js';
import i18n from '../portal/src/i18n/index.js';
import {validateManifestMetadata} from '../packages/portal-sdk/src/plugin-manifest.js';

afterEach(() => { delete window.__OPENAN_PLUGIN__native_pages; delete window.__OPENAN_PLUGIN__native_pages_missing; });

function fixture(overrides = {}) {
    const manifest = {id:'native-pages', name:'Orchestration Center', version:'1', entry:'index.js',
        menu:[{id:'build', labelKey:'native:build', label:'Orchestration Center', route:'/build'},
              {id:'run', labelKey:'native:run', label:'Execution Center', route:'/run'}],
        routes:[{path:'/build'}, {path:'/run', componentExport:'Execute'}], ...overrides};
    vi.stubGlobal('fetch', vi.fn(async () => ({ok:true, json:async () => manifest})));
    vi.spyOn(document.head, 'appendChild').mockImplementation(element => {
        window['__OPENAN_PLUGIN__' + manifest.id.replaceAll('-', '_')] = {default:() => 'native builder', Execute:() => 'native execution'};
        queueMicrotask(() => element.onload()); return element;
    });
    return manifest;
}

test('one native artifact resolves different pages and keeps separate translated menu labels', async () => {
    fixture();
    const manifest = await loadPluginBundle({id:'native-pages', entry:'/plugins/native-pages'});
    expect((await manifest.routes[0].component()).default()).toBe('native builder');
    expect((await manifest.routes[1].component()).default()).toBe('native execution');
    expect(manifest.menu.map(item => item.labelKey)).toEqual(['Orchestration Center', 'Execution Center']);
    expect(i18n.getFixedT('zh')('Execution Center')).toBe('执行中心');
});

test('old artifacts cannot silently remove required native functionality', async () => {
    fixture({routes:[{path:'/build'}]});
    await expect(loadPluginBundle({id:'native-pages', entry:'/plugins/native-pages', requiredRoutes:['/build','/run']}))
        .rejects.toThrow('missing required native pages');
});

test('missing or unsafe named exports fail before rendering the wrong page', async () => {
    fixture({id:'native-pages-missing', routes:[{path:'/run', componentExport:'Missing'}]});
    await expect(loadPluginBundle({id:'native-pages-missing', entry:'/plugins/native-pages-missing'})).rejects.toThrow('Missing');
    expect(() => validateManifestMetadata({id:'x', name:'x', version:'1', routes:[{path:'/x', componentExport:'a.b'}]}))
        .toThrow('componentExport');
});

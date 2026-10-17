// SPDX-License-Identifier: Apache-2.0
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePortalContext } from '@openan/portal-sdk';
import { resolveEditorUrl } from './config.js';
import '../integration.css';

// Capture while the UMD script executes, so remote artifact deployments read
// their own sidecar config instead of a hard-coded Portal asset location.
const configUrl = new URL('config.json', document.currentScript?.src || new URL('/plugins/an-ontology/index.js', window.location.href)).href;

export default function OntologyCenter() {
    const { theme } = usePortalContext();
    const { i18n } = useTranslation();
    const zh = i18n.language?.startsWith('zh');
    const [url, setUrl] = useState('');
    const [error, setError] = useState('');
    useEffect(() => {
        const controller = new AbortController();
        async function load() {
            try {
                const legacyUrl = window.__OPENAN_ONTOLOGY_APP_URL__;
                let value = legacyUrl;
                if (!value) {
                    const response = await fetch(configUrl, { cache: 'no-store', signal: controller.signal });
                    if (!response.ok) throw new Error(`Editor config HTTP ${response.status}`);
                    value = (await response.json()).appUrl;
                }
                const resolved = resolveEditorUrl(value);
                if (!controller.signal.aborted) setUrl(resolved);
            } catch (failure) { if (!controller.signal.aborted) setError(failure.message); }
        }
        load();
        return () => controller.abort();
    }, []);
    return <section className="openan-integration" data-dark={!!theme?.isDark}>
        <header><h1>{zh ? '本体 T-Box 编辑器' : 'Ontology T-Box Editor'}</h1>
            {url && <a href={url} target="_blank" rel="noopener noreferrer">{zh ? '在独立页面打开' : 'Open separately'}</a>}</header>
        <p>{zh ? '使用本体服务原生编辑器。离开此菜单会关闭本次工作区，请先下载成果；编辑器主题与语言由自身管理。' : 'Native ontology editor. Leaving this menu closes its workspace; download your work first. The editor manages its own theme and language.'}</p>
        {error && <p role="alert" className="integration-error">{error}</p>}
        {!url && !error && <p role="status">{zh ? '加载配置…' : 'Loading configuration…'}</p>}
        {url && <>
            <p>{zh ? '若编辑器无法显示，请检查服务地址、浏览器网络及 frame-ancestors 策略，或使用独立页面。' : 'If the editor cannot be displayed, check its URL, browser connectivity and frame-ancestors policy, or open it separately.'}</p>
            {/* The native editor registers beforeunload for dirty workspaces;
                allow-modals preserves that browser-navigation safeguard. */}
            <iframe title="Ontology T-Box Editor" src={url} sandbox="allow-scripts allow-same-origin allow-downloads allow-forms allow-modals" referrerPolicy="no-referrer" />
        </>}
    </section>;
}

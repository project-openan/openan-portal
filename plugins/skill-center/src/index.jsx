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

// Skill Center = thin iframe mount around the standalone SkillHub SPA
// (deployed at /skillhub-app/ on the same origin).
//
// Language: the portal owns the language. The SPA receives the initial
// language via the ?lang= query parameter and follow-up switches via
// postMessage({ type: 'openan-lang', lang }); it renders no toggle of its own.
//
// The mount URL can be overridden per environment:
//   window.__OPENAN_SKILLHUB_APP_URL__ = 'https://other-host/skillhub-app/';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const FALLBACK_APP_URL = '/skillhub-app/';

function resolveAppUrl() {
    if (typeof window !== 'undefined' && window.__OPENAN_SKILLHUB_APP_URL__) {
        return window.__OPENAN_SKILLHUB_APP_URL__;
    }
    return FALLBACK_APP_URL;
}

function withLangParam(url, lang) {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}lang=${lang}`;
}

const styles = {
    wrapper: {
        position: 'relative',
        height: 'calc(100vh - 160px)',
        minHeight: 480,
        borderRadius: 12,
        border: '1px solid #27272a',
        background: '#09090b',
        overflow: 'hidden',
    },
    frame: {
        display: 'block',
        width: '100%',
        height: '100%',
        border: 'none',
    },
    loading: {
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        background: '#09090b',
        zIndex: 1,
    },
    spinner: {
        width: 28,
        height: 28,
        borderRadius: '50%',
        border: '2px solid #3f3f46',
        borderTopColor: '#3b82f6',
        animation: 'skillhub-spin 0.8s linear infinite',
        marginBottom: 12,
    },
    text: {
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: '0.05em',
        color: '#71717a',
        textAlign: 'center',
    },
};

export default function SkillCenter() {
    const { i18n } = useTranslation();
    const frameRef = useRef(null);
    const [initialLang] = useState(() => (i18n.language || 'zh').startsWith('en') ? 'en' : 'zh');
    const [ready, setReady] = useState(false);

    // Portal language changes are forwarded to the iframe.
    useEffect(() => {
        const handler = (lng) => {
            const norm = lng && lng.startsWith('en') ? 'en' : 'zh';
            frameRef.current?.contentWindow?.postMessage({ type: 'openan-lang', lang: norm }, '*');
        };
        i18n.on('languageChanged', handler);
        return () => i18n.off('languageChanged', handler);
    }, [i18n]);

    // Re-sync once after the iframe finished loading (covers a language
    // switch that happened while the SPA was still booting).
    useEffect(() => {
        if (ready) handler(i18n.language);
        function handler(lng) {
            const norm = lng && lng.startsWith('en') ? 'en' : 'zh';
            frameRef.current?.contentWindow?.postMessage({ type: 'openan-lang', lang: norm }, '*');
        }
    }, [ready, i18n.language]);

    // Inject the keyframes once.
    useEffect(() => {
        if (!document.getElementById('skillhub-spin-style')) {
            const tag = document.createElement('style');
            tag.id = 'skillhub-spin-style';
            tag.textContent = '@keyframes skillhub-spin{to{transform:rotate(360deg)}}';
            document.head.appendChild(tag);
        }
    }, []);

    return (
        <div style={styles.wrapper}>
            {!ready && (
                <div style={styles.loading}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={styles.spinner} />
                        <div style={styles.text}>LOADING SKILL CENTER</div>
                    </div>
                </div>
            )}
            <iframe
                ref={frameRef}
                src={withLangParam(resolveAppUrl(), initialLang)}
                title="OpenAN SkillHub"
                onLoad={() => setReady(true)}
                style={styles.frame}
            />
        </div>
    );
}

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
// (deployed at /skillhub-app/ on the same origin). The SPA owns skills
// browsing, versions, files and security-scan details; this plugin only
// embeds it so the portal keeps one consistent navigation shell.
//
// The mount URL can be overridden per environment:
//   window.__OPENAN_SKILLHUB_APP_URL__ = 'https://other-host/skillhub-app/';

import { useEffect, useState } from 'react';

const FALLBACK_APP_URL = '/skillhub-app/';

function resolveAppUrl() {
    if (typeof window !== 'undefined' && window.__OPENAN_SKILLHUB_APP_URL__) {
        return window.__OPENAN_SKILLHUB_APP_URL__;
    }
    return FALLBACK_APP_URL;
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
    const [appUrl] = useState(resolveAppUrl);
    const [ready, setReady] = useState(false);

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
                src={appUrl}
                title="OpenAN SkillHub"
                onLoad={() => setReady(true)}
                style={styles.frame}
            />
        </div>
    );
}

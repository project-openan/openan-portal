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

import { useState, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { usePortalContext } from '@openan/portal-sdk';
import Showroom3D from './Showroom3D.jsx';
import {
    Presentation, ArrowLeft, Zap, Eye
} from 'lucide-react';

const demos = {
    interactive: [
        { id: 'auth', component: () => import('./demos/AuthStatus.jsx') },
        { id: 'api_call', component: () => import('./demos/ApiCall.jsx') },
        { id: 'sse_stream', component: () => import('./demos/SseStream.jsx') },
    ],
    presentation: [
        { id: 'theme_playground', component: () => import('./demos/ThemePlayground.jsx') },
        { id: 'i18n_showcase', component: () => import('./demos/I18nShowcase.jsx') },
        { id: 'context_inspector', component: () => import('./demos/ContextInspector.jsx') },
        { id: 'navigation_demo', component: () => import('./demos/NavigationDemo.jsx') },
    ],
};

export default function DemoShowcase() {
    const { t } = useTranslation('demo-showcase');
    const { theme } = usePortalContext();
    const isDark = theme.isDark;
    const [activeDemo, setActiveDemo] = useState(null);

    // 3D showroom mode: default view when no specific demo is selected
    if (!activeDemo) {
        return <Showroom3D isDark={isDark} />;
    }

    const allDemos = [...demos.interactive, ...demos.presentation];
    const demo = allDemos.find((d) => d.id === activeDemo);
    if (!demo) return null;
    const LazyComponent = lazy(demo.component);

    return (
        <div className="h-full overflow-auto bg-zinc-50 dark:bg-[#09090B]">
            <div className="max-w-4xl mx-auto p-8">
                <button
                    onClick={() => setActiveDemo(null)}
                    className="flex items-center gap-2 text-xs font-bold text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 mb-6 transition-colors"
                >
                    <ArrowLeft size={14} />
                    {t('back')}
                </button>
                <Suspense fallback={
                    <div className="flex items-center justify-center h-64 text-zinc-400 text-sm animate-pulse">Loading...</div>
                }>
                    <LazyComponent />
                </Suspense>
            </div>
        </div>
    );
}

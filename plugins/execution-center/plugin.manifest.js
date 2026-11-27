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

import { BarChart3, PlayCircle } from 'lucide-react';

export default {
    id: 'execution-center',
    name: 'Execution Center',
    version: '0.2.1',
    backend: { gateway: '/api/orchestrate', authScope: 'host' },
    menu: [{
        id: 'execution',
        labelKey: 'execution-center:execution.title',
        label: 'Workflow Execution',
        icon: PlayCircle,
        order: 3,
        route: '/execution',
        group: 'Execution Center',
    }, {
        id: 'execution-stats',
        labelKey: 'execution-center:execution.sub_menu_statistics',
        label: 'Execution Statistics',
        icon: BarChart3,
        order: 4,
        route: '/execution-stats',
        group: 'Execution Center',
    }],
    routes: [
        { path: '/execution', component: () => import('./src/index.jsx'), menuId: 'execution' },
        { path: '/execution-stats', component: () => import('./src/index.jsx'), menuId: 'execution-stats' },
    ],
    i18n: {
        namespace: 'execution-center',
        resources: {
            en: () => import('./src/locales/en.json'),
            zh: () => import('./src/locales/zh.json'),
        },
    },
};

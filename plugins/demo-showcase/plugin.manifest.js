// Copyright (c) 2026 Huawei Technologies Co., Ltd.
// All Rights Reserved.
//
// SPDX-License-Identifier: Apache-2.0

import { Presentation } from 'lucide-react';

export default {
    id: 'demo-showcase',
    name: 'Demo Showcase',
    version: '0.2.0',
    menu: [{
        id: 'demos',
        labelKey: 'demo-showcase:nav.demos',
        icon: Presentation,
        order: 8,
        route: '/demos',
    }],
    routes: [{
        path: '/demos',
        component: () => import('./src/index.jsx'),
        menuId: 'demos',
    }],
    i18n: {
        namespace: 'demo-showcase',
        resources: {
            en: () => import('./src/locales/en.json'),
            zh: () => import('./src/locales/zh.json'),
        },
    },
};

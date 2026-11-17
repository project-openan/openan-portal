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

import { afterEach, vi } from 'vitest';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// The intentionally crashing fixture is handled by ErrorBoundary. Keep other
// browser exceptions visible instead of globally silencing jsdom failures.
if (typeof window !== 'undefined') window.addEventListener('error', event => {
    if (event.error?.message === 'synthetic failure') event.preventDefault();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

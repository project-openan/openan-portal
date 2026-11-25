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

import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import Login from './Login.jsx';

/**
 * Guest-mode login/register dialog. The card itself is the compact Login
 * (variant="modal"); this wrapper supplies the overlay, the close button and
 * the a11y dialog semantics.
 */
export default function AuthModal({ initialTab = 'login', onClose }) {
    const { t } = useTranslation();

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm font-sans"
            role="dialog"
            aria-modal="true"
            aria-label={t('login.modal_label')}
            onClick={onClose}
        >
            <div onClick={(e) => e.stopPropagation()} className="relative mx-6">
                <button
                    type="button"
                    onClick={onClose}
                    aria-label={t('common.close')}
                    className="absolute -top-3 -right-3 p-2 rounded-full bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 text-zinc-500 dark:text-zinc-300 hover:text-zinc-800 dark:hover:text-white shadow-md transition-all"
                >
                    <X size={16} />
                </button>
                <Login
                    variant="modal"
                    initialTab={initialTab}
                    onSuccess={onClose}
                    onCancel={onClose}
                />
            </div>
        </div>
    );
}

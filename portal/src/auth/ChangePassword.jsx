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

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext.jsx';
import { useTheme } from '../theme/ThemeContext.jsx';
import { Sun, Moon } from 'lucide-react';

/**
 * Password change form.
 *
 * variant:
 *   - 'page'  (default) full-screen card used by the forced must-change flow
 *   - 'modal' compact card used from the header user menu
 *
 * The backend revokes the session after a successful change; onDone should
 * switch the app back to the login/guest state.
 */
export default function ChangePassword({ variant = 'page', onDone, onCancel }) {
    const { t } = useTranslation();
    const { currentUser, changePassword, logout } = useAuth();
    const { isDark, toggle } = useTheme();

    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (newPassword !== confirmPassword) {
            setError(t('login.password_mismatch'));
            return;
        }
        if (newPassword === oldPassword) {
            setError(t('password_change.same'));
            return;
        }
        setLoading(true);
        try {
            // The context action also clears the revoked session identity.
            await changePassword(oldPassword, newPassword);
            onDone?.();
        } catch (err) {
            setError(err?.response?.data?.detail || err?.response?.data?.message || t('login.change_password_error'));
        } finally {
            setLoading(false);
        }
    };

    const inputClass =
        'w-full px-4 py-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500';

    const card = (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-8 shadow-sm space-y-4 w-full max-w-sm">
            <form onSubmit={handleSubmit} className="space-y-4">
                <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 text-center">
                    {t('login.change_password_title')}
                </h2>
                {currentUser && (
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 text-center">
                        {currentUser}
                    </p>
                )}
                {variant === 'page' && (
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 text-center">
                        {t('login.must_change_hint')}
                    </p>
                )}
                <input
                    type="password"
                    name="old"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    placeholder={t('login.old_password')}
                    autoComplete="current-password"
                    className={inputClass}
                />
                <input
                    type="password"
                    name="new"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={t('login.new_password')}
                    autoComplete="new-password"
                    className={inputClass}
                />
                <input
                    type="password"
                    name="confirm"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={t('login.confirm_password')}
                    autoComplete="new-password"
                    className={inputClass}
                />
                {error && <p role="alert" className="text-sm text-red-500 text-center">{error}</p>}
                <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {loading ? t('login.loading') : t('login.change_password_button')}
                </button>
            </form>
            {variant === 'modal' && onCancel ? (
                <button
                    type="button"
                    onClick={onCancel}
                    className="w-full py-2 rounded-xl text-sm font-medium text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-all"
                >
                    {t('common.close')}
                </button>
            ) : (
                <button
                    type="button"
                    onClick={() => logout().catch(() => {})}
                    className="w-full py-2 rounded-xl text-sm font-medium text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-all"
                >
                    {t('login.logout')}
                </button>
            )}
        </div>
    );

    if (variant === 'modal') {
        return card;
    }

    return (
        <div className="h-screen flex items-center justify-center bg-zinc-50 dark:bg-[#09090B] font-sans">
            <button
                onClick={toggle}
                className="absolute top-6 right-6 p-2.5 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
            >
                {isDark ? (
                    <Sun size={20} className="text-amber-400" />
                ) : (
                    <Moon size={20} className="text-zinc-500" />
                )}
            </button>
            <div className="w-full max-w-sm mx-6">
                <div className="text-center mb-8">
                    <div className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 mb-1">
                        Open<span className="text-blue-500">AN</span>
                    </div>
                    <p className="text-xs tracking-widest uppercase text-zinc-400 dark:text-zinc-500">
                        {t('nav.subtitle')}
                    </p>
                </div>
                {card}
            </div>
        </div>
    );
}

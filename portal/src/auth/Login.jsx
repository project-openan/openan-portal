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
import { register as apiRegister } from '../service/api.js';
import { Sun, Moon } from 'lucide-react';

/**
 * Login / Register card.
 *
 * variant:
 *   - 'page'  (default) full-screen standalone card with brand + theme toggle
 *   - 'modal' compact card rendered inside AuthModal (guest browsing)
 *
 * initialTab: 'login' (default) or 'register' — the register tab only
 * appears when the backend reports self-registration enabled.
 */
export default function Login({ variant = 'page', initialTab = 'login', onSuccess, onCancel }) {
    const { t } = useTranslation();
    const { login, registrationEnabled, passwordChanged, guestAllowed, enterAsGuest } = useAuth();
    const { isDark, toggle } = useTheme();

    const [tab, setTab] = useState(initialTab === 'register' && registrationEnabled ? 'register' : 'login');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    const showRegister = registrationEnabled;

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setNotice('');
        try {
            await login(username || 'admin', password);
            onSuccess?.();
        } catch (err) {
            setError(err?.response?.data?.detail || err?.response?.data?.message || t('login.error'));
        } finally {
            setLoading(false);
        }
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        setError('');
        setNotice('');
        if (password !== confirmPassword) {
            setError(t('login.password_mismatch'));
            return;
        }
        setLoading(true);
        try {
            await apiRegister(username, password);
            setNotice(t('login.register_success'));
            setPassword('');
            setConfirmPassword('');
            setTab('login');
        } catch (err) {
            setError(err?.response?.data?.detail || err?.response?.data?.message || t('login.register_error'));
        } finally {
            setLoading(false);
        }
    };

    const inputClass =
        'w-full px-4 py-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500';

    const card = (
        <div
            className={`bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-8 shadow-sm space-y-4 ${
                variant === 'modal' ? 'w-full max-w-sm' : ''
            }`}
        >
            {showRegister && (
                <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl border border-zinc-200 dark:border-zinc-700">
                    <button
                        type="button"
                        onClick={() => { setTab('login'); setError(''); setNotice(''); }}
                        className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
                            tab === 'login'
                                ? 'bg-white dark:bg-zinc-600 text-blue-600 dark:text-white shadow-sm'
                                : 'text-zinc-400'
                        }`}
                    >
                        {t('login.tab_login')}
                    </button>
                    <button
                        type="button"
                        onClick={() => { setTab('register'); setError(''); setNotice(''); }}
                        className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
                            tab === 'register'
                                ? 'bg-white dark:bg-zinc-600 text-blue-600 dark:text-white shadow-sm'
                                : 'text-zinc-400'
                        }`}
                    >
                        {t('login.tab_register')}
                    </button>
                </div>
            )}

            {tab === 'login' ? (
                <form onSubmit={handleLogin} className="space-y-4">
                    <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 text-center">
                        {t('login.title')}
                    </h2>
                    {passwordChanged && (
                        <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400 text-center">
                            {t('password_change.relogin')}
                        </p>
                    )}
                    <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder={t('login.username_placeholder')}
                        autoComplete="username"
                        className={inputClass}
                    />
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={t('login.placeholder')}
                        autoComplete="current-password"
                        className={inputClass}
                    />
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? t('login.loading') : t('login.button')}
                    </button>
                </form>
            ) : (
                <form onSubmit={handleRegister} className="space-y-4">
                    <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 text-center">
                        {t('login.register_title')}
                    </h2>
                    <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder={t('login.register_username_placeholder')}
                        autoComplete="username"
                        className={inputClass}
                    />
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={t('login.register_password_placeholder')}
                        autoComplete="new-password"
                        className={inputClass}
                    />
                    <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder={t('login.register_confirm_placeholder')}
                        autoComplete="new-password"
                        className={inputClass}
                    />
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? t('login.register_loading') : t('login.register_button')}
                    </button>
                </form>
            )}

            {/* Shared status area — visible on both tabs so the register
                success message survives the automatic switch to login. */}
            {error && <p className="text-sm text-red-500 text-center">{error}</p>}
            {notice && <p className="text-sm text-emerald-500 text-center">{notice}</p>}

            {variant === 'modal' && onCancel && (
                <button
                    type="button"
                    onClick={onCancel}
                    className="w-full py-2 rounded-xl text-sm font-medium text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-all"
                >
                    {t('common.close')}
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
                {variant === 'page' && guestAllowed && (
                    <div className="mt-4 text-center">
                        <button
                            type="button"
                            onClick={() => enterAsGuest()}
                            className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline transition-all"
                        >
                            {t('login.guest_entry')}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

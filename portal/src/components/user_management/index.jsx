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

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/AuthContext.jsx';
import {
    listUsers,
    createUser,
    resetUserPassword,
    setUserRole,
    deleteUser,
} from '../../service/api.js';
import { UserPlus, RotateCcw, Trash2, ShieldCheck, RefreshCw } from 'lucide-react';

/**
 * Admin-only user management page (route /users).
 *
 * Capabilities: list accounts, create accounts (role + forced password
 * change), reset passwords, switch roles and delete accounts. The seeded
 * 'admin' is protected server-side (no delete, no demote) and mirrored here
 * with disabled controls.
 */
export default function UserManagement() {
    const { t } = useTranslation();
    const { isAdmin } = useAuth();

    const [users, setUsers] = useState(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    const [form, setForm] = useState({
        username: '',
        password: '',
        role: 'user',
        must_change_password: true,
    });
    const [creating, setCreating] = useState(false);

    const [resetFor, setResetFor] = useState(null);
    const [resetPassword, setResetPassword] = useState('');
    const [resetting, setResetting] = useState(false);

    const [deleting, setDeleting] = useState(null); // username pending confirm

    const extractDetail = useCallback(
        (err) => err?.response?.data?.detail || err?.response?.data?.message || null,
        []
    );

    const load = useCallback(async () => {
        setError('');
        try {
            const data = await listUsers();
            setUsers(Array.isArray(data) ? data : []);
        } catch (err) {
            setError(extractDetail(err) || t('users.load_error'));
            setUsers([]);
        }
    }, [extractDetail, t]);

    useEffect(() => {
        load();
    }, [load]);

    const handleCreate = async (e) => {
        e.preventDefault();
        setError('');
        setNotice('');
        if (!form.username || !form.password) return;
        setCreating(true);
        try {
            await createUser({
                username: form.username,
                password: form.password,
                role: form.role,
                must_change_password: form.must_change_password,
            });
            setNotice(t('users.create_success', { name: form.username }));
            setForm({ username: '', password: '', role: 'user', must_change_password: true });
            await load();
        } catch (err) {
            setError(extractDetail(err) || t('users.create_error'));
        } finally {
            setCreating(false);
        }
    };

    const handleReset = async (e) => {
        e.preventDefault();
        setError('');
        setNotice('');
        if (!resetPassword) return;
        setResetting(true);
        try {
            await resetUserPassword(resetFor, resetPassword);
            setNotice(t('users.reset_success', { name: resetFor }));
            setResetFor(null);
            setResetPassword('');
            await load();
        } catch (err) {
            setError(extractDetail(err) || t('users.reset_error'));
        } finally {
            setResetting(false);
        }
    };

    const handleRole = async (username, role) => {
        setError('');
        setNotice('');
        try {
            await setUserRole(username, role);
            setNotice(t('users.role_success', { name: username, role: t(role === 'admin' ? 'users.role_admin' : 'users.role_user') }));
            await load();
        } catch (err) {
            setError(extractDetail(err) || t('users.role_error'));
        }
    };

    const handleDelete = async (username) => {
        setError('');
        setNotice('');
        try {
            await deleteUser(username);
            setNotice(t('users.delete_success', { name: username }));
            setDeleting(null);
            await load();
        } catch (err) {
            setError(extractDetail(err) || t('users.delete_error'));
        }
    };

    if (!isAdmin) {
        return null;
    }

    const inputClass =
        'px-3 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
    const actionBtn =
        'px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all';

    return (
        <div className="h-full overflow-y-auto p-8 bg-zinc-50 dark:bg-[#09090B] font-sans">
            <div className="max-w-4xl mx-auto space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                            {t('users.title')}
                        </h1>
                        <p className="text-sm text-zinc-400 dark:text-zinc-500 mt-0.5">
                            {t('users.subtitle')}
                        </p>
                    </div>
                    <button
                        onClick={load}
                        className={actionBtn + ' flex items-center gap-1.5'}
                    >
                        <RefreshCw size={13} />
                        {t('users.refresh')}
                    </button>
                </div>

                {error && (
                    <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-2.5">
                        {error}
                    </p>
                )}
                {notice && (
                    <p className="text-sm text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-2.5">
                        {notice}
                    </p>
                )}

                {/* Create form */}
                <form
                    onSubmit={handleCreate}
                    className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-sm"
                >
                    <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-3 flex items-center gap-2">
                        <UserPlus size={15} className="text-blue-500" />
                        {t('users.create_title')}
                    </h2>
                    <div className="flex flex-wrap items-center gap-3">
                        <input
                            type="text"
                            value={form.username}
                            onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                            placeholder={t('users.username')}
                            className={inputClass + ' flex-1 min-w-40'}
                        />
                        <input
                            type="password"
                            value={form.password}
                            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                            placeholder={t('users.password')}
                            autoComplete="new-password"
                            className={inputClass + ' flex-1 min-w-40'}
                        />
                        <select
                            value={form.role}
                            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                            className={inputClass}
                        >
                            <option value="user">{t('users.role_user')}</option>
                            <option value="admin">{t('users.role_admin')}</option>
                        </select>
                        <label className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                            <input
                                type="checkbox"
                                checked={form.must_change_password}
                                onChange={(e) =>
                                    setForm((f) => ({ ...f, must_change_password: e.target.checked }))
                                }
                                className="rounded border-zinc-300 dark:border-zinc-600"
                            />
                            {t('users.must_change')}
                        </label>
                        <button
                            type="submit"
                            disabled={creating}
                            className="px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-bold transition-all disabled:opacity-50"
                        >
                            {creating ? t('common.loading') : t('users.create_button')}
                        </button>
                    </div>
                </form>

                {/* Users table */}
                <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
                    {users === null ? (
                        <div className="p-8 text-center text-sm text-zinc-400 animate-pulse">
                            {t('common.loading')}
                        </div>
                    ) : users.length === 0 ? (
                        <div className="p-8 text-center text-sm text-zinc-400">
                            {t('users.empty')}
                        </div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs uppercase tracking-wider text-zinc-400 dark:text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                                    <th className="px-5 py-3 font-bold">{t('users.username')}</th>
                                    <th className="px-5 py-3 font-bold">{t('users.role')}</th>
                                    <th className="px-5 py-3 font-bold">{t('users.must_change')}</th>
                                    <th className="px-5 py-3 font-bold">{t('users.created_at')}</th>
                                    <th className="px-5 py-3 font-bold text-right">
                                        {t('users.actions')}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((u) => {
                                    const seeded = u.username === 'admin';
                                    return (
                                        <tr
                                            key={u.username}
                                            className="border-b border-zinc-100 dark:border-zinc-800/60 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors"
                                        >
                                            <td className="px-5 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                                                <span className="flex items-center gap-2">
                                                    {u.username}
                                                    {seeded && (
                                                        <span
                                                            title={t('users.protected')}
                                                            className="inline-flex"
                                                        >
                                                            <ShieldCheck
                                                                size={13}
                                                                className="text-blue-400"
                                                            />
                                                        </span>
                                                    )}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3">
                                                {seeded ? (
                                                    <span className="text-xs font-bold px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">
                                                        {t('users.role_admin')}
                                                    </span>
                                                ) : (
                                                    <select
                                                        value={u.role}
                                                        onChange={(e) =>
                                                            handleRole(u.username, e.target.value)
                                                        }
                                                        className={inputClass}
                                                    >
                                                        <option value="user">
                                                            {t('users.role_user')}
                                                        </option>
                                                        <option value="admin">
                                                            {t('users.role_admin')}
                                                        </option>
                                                    </select>
                                                )}
                                            </td>
                                            <td className="px-5 py-3 text-zinc-500 dark:text-zinc-400">
                                                {u.must_change_password ? t('users.yes') : t('users.no')}
                                            </td>
                                            <td className="px-5 py-3 text-zinc-400 dark:text-zinc-500 text-xs">
                                                {(u.created_at || '').replace('T', ' ').slice(0, 19)}
                                            </td>
                                            <td className="px-5 py-3">
                                                <span className="flex items-center justify-end gap-2">
                                                    {!seeded && (
                                                        <>
                                                            <button
                                                                onClick={() => {
                                                                    setResetFor(u.username);
                                                                    setResetPassword('');
                                                                    setDeleting(null);
                                                                }}
                                                                className={
                                                                    actionBtn +
                                                                    ' flex items-center gap-1'
                                                                }
                                                            >
                                                                <RotateCcw size={12} />
                                                                {t('users.reset')}
                                                            </button>
                                                            {deleting === u.username ? (
                                                                <>
                                                                    <button
                                                                        onClick={() =>
                                                                            handleDelete(u.username)
                                                                        }
                                                                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-500 hover:bg-red-600 text-white transition-all"
                                                                    >
                                                                        {t('users.delete_confirm')}
                                                                    </button>
                                                                    <button
                                                                        onClick={() =>
                                                                            setDeleting(null)
                                                                        }
                                                                        className={actionBtn}
                                                                    >
                                                                        {t('common.cancel')}
                                                                    </button>
                                                                </>
                                                            ) : (
                                                                <button
                                                                    onClick={() => {
                                                                        setDeleting(u.username);
                                                                        setResetFor(null);
                                                                    }}
                                                                    className={
                                                                        actionBtn +
                                                                        ' flex items-center gap-1 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
                                                                    }
                                                                >
                                                                    <Trash2 size={12} />
                                                                    {t('common.delete')}
                                                                </button>
                                                            )}
                                                        </>
                                                    )}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Inline reset-password dialog */}
                {resetFor && (
                    <form
                        onSubmit={handleReset}
                        className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-sm"
                    >
                        <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-3 flex items-center gap-2">
                            <RotateCcw size={15} className="text-blue-500" />
                            {t('users.reset_title', { name: resetFor })}
                        </h2>
                        <div className="flex flex-wrap items-center gap-3">
                            <input
                                type="password"
                                value={resetPassword}
                                onChange={(e) => setResetPassword(e.target.value)}
                                placeholder={t('users.password')}
                                autoComplete="new-password"
                                className={inputClass + ' flex-1 min-w-40'}
                            />
                            <button
                                type="submit"
                                disabled={resetting}
                                className="px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-bold transition-all disabled:opacity-50"
                            >
                                {resetting ? t('common.loading') : t('users.reset_button')}
                            </button>
                            <button
                                type="button"
                                onClick={() => setResetFor(null)}
                                className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-all"
                            >
                                {t('common.cancel')}
                            </button>
                        </div>
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2">
                            {t('users.reset_hint')}
                        </p>
                    </form>
                )}
            </div>
        </div>
    );
}

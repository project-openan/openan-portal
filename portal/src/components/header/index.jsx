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

import { useMemo, useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sun, Moon, LogOut, Puzzle, ChevronDown, Settings, Users, KeyRound } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useTheme } from '../../theme/ThemeContext.jsx';
import logo from '../../assets/openan-logo.png';

/**
 * Dynamic Header — renders navigation buttons from plugin manifests.
 *
 * Menu items may declare a `group` field. Items sharing the same group are
 * collapsed into a PARENT button with a dropdown of child items; items
 * without a group render as flat top-level buttons.
 *
 * Example manifest:
 *   menu: [
 *     { id: 'tbox', labelKey: 'Ontology T-Box', group: 'Ontology', order: 5, route: '/ontology/tbox' },
 *     { id: 'abox', labelKey: 'Ontology A-Box', group: 'Ontology', order: 6, route: '/ontology/abox' },
 *   ]
 */
export default function Header({ plugins, disabledIds, onManagePlugins, onLogin, onChangePassword }) {
    const { t, i18n } = useTranslation();
    const { currentUser, currentRole, authRequired, isAuthenticated, isGuest, registrationEnabled, isAdmin, logout } = useAuth();
    const { isDark, toggle } = useTheme();
    const location = useLocation();
    const navigate = useNavigate();

    const [openGroup, setOpenGroup] = useState(null);
    const groupRef = useRef(null);
    // Settings dropdown: groups plugin management, change password and user
    // management behind one entry.
    const [settingsOpen, setSettingsOpen] = useState(false);
    const settingsRef = useRef(null);

    const activeCount = plugins.filter((p) => !disabledIds.has(p.id)).length;
    const hasDisabled = disabledIds.size > 0;

    // Close dropdowns on outside click
    useEffect(() => {
        const handler = (e) => {
            if (groupRef.current && !groupRef.current.contains(e.target)) {
                setOpenGroup(null);
            }
            if (settingsRef.current && !settingsRef.current.contains(e.target)) {
                setSettingsOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // All active plugin menu items, sorted by `order`
    const menuItems = useMemo(() => {
        return plugins
            .filter((p) => !disabledIds.has(p.id))
            .flatMap((p) => (p.menu || []).map((m) => ({ ...m, pluginId: p.id })))
            .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    }, [plugins, disabledIds]);

    // Partition into flat items and grouped items (group label → children)
    const { flatItems, groups } = useMemo(() => {
        const flat = [];
        const groupMap = new Map();
        for (const item of menuItems) {
            if (item.group) {
                if (!groupMap.has(item.group)) groupMap.set(item.group, []);
                groupMap.get(item.group).push(item);
            } else {
                flat.push(item);
            }
        }
        // Preserve order: a group's position is its first child's order
        const groupList = [...groupMap.entries()].map(([label, children]) => ({
            label,
            order: Math.min(...children.map((c) => c.order ?? 999)),
            children: children.sort((a, b) => (a.order ?? 999) - (b.order ?? 999)),
        }));
        return { flatItems: flat, groups: groupList };
    }, [menuItems]);

    const groupActive = (group) =>
        group.children.some((c) => location.pathname.startsWith(c.route));

    const handleLangChange = (lng) => {
        i18n.changeLanguage(lng);
        localStorage.setItem('lang', lng);
    };

    const renderFlatButton = (item) => {
        const isActive = location.pathname.startsWith(item.route);
        const Icon = item.icon;
        return (
            <button
                key={item.id}
                onClick={() => navigate(item.route)}
                className={`flex items-center gap-3 px-6 py-2 rounded-xl text-sm font-black transition-all duration-300 ${
                    isActive
                        ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-md scale-[1.02]'
                        : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
                }`}
            >
                {Icon && <Icon size={16} />}
                {t(item.labelKey)}
            </button>
        );
    };

    const renderGroupButton = (group) => {
        const isActive = groupActive(group);
        const isOpen = openGroup === group.label;
        return (
            <div key={group.label} className="relative" ref={openGroup === group.label ? groupRef : null}>
                <button
                    onClick={() => setOpenGroup(isOpen ? null : group.label)}
                    className={`flex items-center gap-2 px-6 py-2 rounded-xl text-sm font-black transition-all duration-300 ${
                        isActive || isOpen
                            ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-md scale-[1.02]'
                            : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
                    }`}
                >
                    {t(group.label)}
                    <ChevronDown
                        size={14}
                        className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                    />
                </button>
                {isOpen && (
                    <div className="absolute top-full left-0 mt-2 min-w-[180px] bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-lg py-1.5 z-50">
                        {group.children.map((child) => {
                            const childActive = location.pathname.startsWith(child.route);
                            return (
                                <button
                                    key={child.id}
                                    onClick={() => {
                                        navigate(child.route);
                                        setOpenGroup(null);
                                    }}
                                    className={`w-full text-left px-4 py-2.5 text-sm font-bold transition-colors flex items-center gap-2 ${
                                        childActive
                                            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                            : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                                    }`}
                                >
                                    <span className={`w-1.5 h-1.5 rounded-full ${childActive ? 'bg-blue-500' : 'bg-zinc-300 dark:bg-zinc-600'}`} />
                                    {t(child.labelKey)}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    };

    // Interleave flat items and groups by their order
    const navEntries = useMemo(() => {
        const entries = [
            ...flatItems.map((i) => ({ kind: 'flat', order: i.order ?? 999, item: i })),
            ...groups.map((g) => ({ kind: 'group', order: g.order, item: g })),
        ].sort((a, b) => a.order - b.order);
        return entries;
    }, [flatItems, groups]);

    return (
        <nav className="h-16 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800 px-8 flex justify-between items-center shrink-0 z-20 transition-all">
            {/* Brand — logo mark (matches openan.dev navbar: 40px white rounded box) + wordmark */}
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-white dark:bg-zinc-800 p-1 flex items-center justify-center border border-zinc-200 dark:border-zinc-700 shadow-sm shrink-0 overflow-hidden">
                    <img src={logo} alt="OpenAN logo" className="w-full h-full object-contain" />
                </div>
                <div className="flex flex-col">
                    <span className="text-xl font-medium tracking-tight text-zinc-900 dark:text-zinc-100 leading-tight">
                        Open<span className="text-blue-500">AN</span>
                    </span>
                    <span className="text-xs tracking-widest uppercase text-zinc-400 dark:text-zinc-500 leading-tight">
                        {t('nav.subtitle')}
                    </span>
                </div>
            </div>

            {/* Dynamic navigation — flat items + grouped sub-menus from manifests */}
            <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 p-1.5 rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-inner">
                {navEntries.map((entry) =>
                    entry.kind === 'flat'
                        ? renderFlatButton(entry.item)
                        : renderGroupButton(entry.item)
                )}
            </div>

            {/* Right controls */}
            <div className="flex items-center gap-2">
                {/* Settings menu — plugin management, change password and user
                    management consolidated under one dropdown */}
                <div className="relative" ref={settingsRef}>
                    <button
                        type="button"
                        onClick={() => setSettingsOpen((v) => !v)}
                        aria-label={t('nav.settings')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
                    >
                        <Settings size={14} />
                        {t('nav.settings')}
                        <ChevronDown
                            size={12}
                            className={`transition-transform ${settingsOpen ? 'rotate-180' : ''}`}
                        />
                    </button>
                    {settingsOpen && (
                        <div className="absolute right-0 top-full mt-2 w-44 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-lg py-1.5 z-50">
                            {authRequired && isAuthenticated && isAdmin && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSettingsOpen(false);
                                        navigate('/users');
                                    }}
                                    className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-all"
                                >
                                    <Users size={14} />
                                    <span className="flex-1 text-left">{t('users.title')}</span>
                                </button>
                            )}
                            {authRequired && isAuthenticated && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSettingsOpen(false);
                                        onChangePassword?.();
                                    }}
                                    className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-all"
                                >
                                    <KeyRound size={14} />
                                    <span className="flex-1 text-left">{t('login.change_password_title')}</span>
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => {
                                    setSettingsOpen(false);
                                    onManagePlugins();
                                }}
                                className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-all"
                            >
                                <Puzzle size={14} />
                                <span className="flex-1 text-left">{t('plugin_manager.title')}</span>
                                {hasDisabled && (
                                    <span className="text-[10px] text-zinc-400">
                                        {activeCount}/{plugins.length}
                                    </span>
                                )}
                            </button>
                        </div>
                    )}
                </div>
                {authRequired && isGuest && (
                    <>
                        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400">
                            {t('login.guest_badge')}
                        </span>
                        <button
                            onClick={() => onLogin?.('login')}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-500 hover:bg-blue-600 text-white transition-all"
                        >
                            {t('login.login_button')}
                        </button>
                        {registrationEnabled && (
                            <button
                                onClick={() => onLogin?.('register')}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
                            >
                                {t('login.register_entry')}
                            </button>
                        )}
                    </>
                )}
                {authRequired && isAuthenticated && (
                    <>
                        <span className="flex items-center gap-2 text-xs font-medium text-zinc-400 dark:text-zinc-500">
                            {currentUser || 'admin'}
                            {isAdmin && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 uppercase tracking-wide">
                                    {t('users.role_admin')}
                                </span>
                            )}
                        </span>
                        <button
                            onClick={logout}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
                        >
                            <LogOut size={14} />
                            {t('login.logout')}
                        </button>
                    </>
                )}
                <button
                    onClick={toggle}
                    className="p-2.5 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
                >
                    {isDark ? (
                        <Sun size={20} className="text-amber-400" />
                    ) : (
                        <Moon size={20} className="text-zinc-500" />
                    )}
                </button>
                <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-full border border-zinc-200 dark:border-zinc-700 shadow-inner">
                    <button
                        onClick={() => handleLangChange('zh')}
                        className={`px-4 py-1.5 rounded-full text-xs font-black transition-all ${
                            i18n.language === 'zh'
                                ? 'bg-white dark:bg-zinc-600 text-blue-600 dark:text-white shadow-sm'
                                : 'text-zinc-400'
                        }`}
                    >
                        中
                    </button>
                    <button
                        onClick={() => handleLangChange('en')}
                        className={`px-4 py-1.5 rounded-full text-xs font-black transition-all ${
                            i18n.language === 'en'
                                ? 'bg-white dark:bg-zinc-600 text-blue-600 dark:text-white shadow-sm'
                                : 'text-zinc-400'
                        }`}
                    >
                        EN
                    </button>
                </div>
            </div>
        </nav>
    );
}

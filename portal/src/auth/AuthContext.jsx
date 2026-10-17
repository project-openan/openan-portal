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

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api, { authCheck, login as apiLogin, logout as apiLogout, changePassword as apiChangePassword } from '../service/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [authState, setAuthState] = useState('checking');
    const [authRequired, setAuthRequired] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);
    const [role, setRole] = useState(null);
    const [passwordChanged, setPasswordChanged] = useState(false);

    const clearIdentity = useCallback(() => {
        setCurrentUser(null);
        setRole(null);
        setAuthState('unauthenticated');
    }, []);

    const checkAuth = useCallback(async () => {
        try {
            const data = await authCheck();
            if (data.auth_required === false || data.authenticated === true) {
                setAuthRequired(data.auth_required !== false);
                setCurrentUser(data.username || null);
                setRole(data.role || null);
                setAuthState(data.must_change_password ? 'password-change-required' : 'authenticated');
            } else {
                setAuthRequired(true);
                clearIdentity();
            }
        } catch {
            clearIdentity();
        }
    }, [clearIdentity]);

    useEffect(() => {
        checkAuth();
    }, [checkAuth]);

    // Listen for auth-expired events dispatched by the axios interceptor
    useEffect(() => {
        const handleExpired = clearIdentity;
        const handlePasswordChange = () => setAuthState('password-change-required');
        window.addEventListener('auth-expired', handleExpired);
        window.addEventListener('auth-password-change-required', handlePasswordChange);
        return () => {
            window.removeEventListener('auth-expired', handleExpired);
            window.removeEventListener('auth-password-change-required', handlePasswordChange);
        };
    }, [clearIdentity]);

    const login = useCallback(async (username, password) => {
        const data = await apiLogin(username, password);
        setAuthRequired(true);
        setCurrentUser(data.username || username);
        setRole(data.role || null);
        setPasswordChanged(false);
        setAuthState(data.must_change_password ? 'password-change-required' : 'authenticated');
        return data;
    }, []);

    const logout = useCallback(async () => {
        try {
            await apiLogout();
        } finally {
            clearIdentity();
        }
    }, [clearIdentity]);

    const changePassword = useCallback(async (oldPassword, newPassword) => {
        await apiChangePassword(oldPassword, newPassword);
        // The backend revokes all user sessions after a successful change.
        clearIdentity();
        setPasswordChanged(true);
    }, [clearIdentity]);

    const value = {
        authState,
        authRequired,
        currentUser,
        role,
        passwordChanged,
        mustChangePassword: authState === 'password-change-required',
        isAuthenticated: authState === 'authenticated',
        isChecking: authState === 'checking',
        login,
        logout,
        checkAuth,
        changePassword,
        api,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        throw new Error('useAuth() must be used within an <AuthProvider>');
    }
    return ctx;
}

// SPDX-License-Identifier: Apache-2.0
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext.jsx';

export default function ChangePassword() {
    const { t } = useTranslation();
    const { changePassword, logout } = useAuth();
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmation, setConfirmation] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const submit = async event => {
        event.preventDefault();
        if (busy) return;
        if (newPassword !== confirmation) { setError(t('password_change.mismatch')); return; }
        if (newPassword === oldPassword) { setError(t('password_change.same')); return; }
        setBusy(true);
        setError('');
        try {
            await changePassword(oldPassword, newPassword);
        } catch (err) {
            const detail = err.response?.data?.message || err.response?.data?.detail;
            setError(typeof detail === 'string' ? detail : t('password_change.failed'));
        } finally { setBusy(false); }
    };
    return <div className="h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 dark:text-white">
        <form onSubmit={submit} className="w-full max-w-sm p-8 space-y-4 bg-white dark:bg-zinc-900 rounded-xl">
            <h1 className="text-lg font-bold">{t('password_change.title')}</h1>
            <p className="text-sm">{t('password_change.required')}</p>
            {[
                ['old', oldPassword, setOldPassword, 'current-password'],
                ['new', newPassword, setNewPassword, 'new-password'],
                ['confirm', confirmation, setConfirmation, 'new-password'],
            ].map(([id, value, setValue, autocomplete]) => <label key={id} className="block text-sm">
                {t(`password_change.${id}`)}
                <input type="password" name={id} autoComplete={autocomplete} required disabled={busy}
                    value={value} onChange={event => setValue(event.target.value)}
                    className="block w-full border rounded p-2 text-zinc-900 bg-white" />
            </label>)}
            {error && <p role="alert" className="text-red-500">{error}</p>}
            <button type="submit" disabled={busy} className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50">{t('password_change.submit')}</button>
            <button type="button" disabled={busy} onClick={() => logout().catch(() => {})} className="px-4 py-2">{t('login.logout')}</button>
        </form>
    </div>;
}

// SPDX-License-Identifier: Apache-2.0
export function resolveEditorUrl(value, host = window.location.href) {
    if (typeof value !== 'string' || !value.trim()) throw new Error('Configure appUrl in /plugins/an-ontology/config.json');
    const url = new URL(value, host);
    const portal = new URL(host);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
        (portal.protocol === 'https:' && url.protocol !== 'https:')) {
        throw new Error('Editor URL must be HTTP(S), without credentials or HTTPS downgrade');
    }
    // The native editor uses root /api and /static routes. Keep it on a
    // dedicated origin; loading the Portal itself would recursively embed it.
    if (url.origin === portal.origin) throw new Error('Editor requires its own origin (host or port)');
    if (url.pathname !== '/' || url.search || url.hash) throw new Error('Editor URL must be a dedicated origin root without query or fragment');
    return url.href;
}

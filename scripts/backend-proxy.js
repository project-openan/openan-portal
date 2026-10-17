// SPDX-License-Identifier: Apache-2.0
// Keep dev and preview on the same gateway contract. Regex boundaries prevent
// /api/registry from consuming /api/registry-center (or unrelated prefixes).
const readOnly = request => ['GET', 'HEAD'].includes(request.method) ? undefined : false;

export function backendProxy(env = process.env) {
    const targets = {
        orchestrate: env.BACKEND_URL || 'http://127.0.0.1:5001',
        registry: env.REGISTRY_URL || 'http://127.0.0.1:5000',
        observe: env.OBSERVATION_URL || 'http://127.0.0.1:5002',
    };
    const proxy = {};
    for (const [prefix, target] of [
        ['/api/orchestrate', targets.orchestrate],
        ['/api/registry-center', targets.registry],
        ['/api/registry', targets.registry],
        ['/api/observe', targets.observe],
    ]) {
        proxy[`^${prefix}(?=/|$)`] = {
            target, changeOrigin: true, secure: false,
            ...(prefix === '/api/observe' ? { bypass: readOnly } : {}),
            rewrite: p => {
                const path = p.slice(prefix.length) || '/';
                return prefix === '/api/registry'
                    ? path.replace(/^\/rest\/v1\/registry(?=\/|$)/, '/rest/v1/registry-center')
                    : path;
            },
        };
    }
    // Compatibility for independently-built plugins and native EventSource.
    for (const [prefix, target] of [
        ['/rest/v1/orchestrate', targets.orchestrate],
        ['/rest/v1/registry-center', targets.registry],
    ]) {
        proxy[`^${prefix}(?=/|$)`] = { target, changeOrigin: true, secure: false };
    }
    return proxy;
}

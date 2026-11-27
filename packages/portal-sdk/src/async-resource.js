// SPDX-License-Identifier: Apache-2.0
// 60s: a gzipped 1.5MB plugin bundle (e.g. a 3D scenario showcase) can take
// 20s+ to transfer alone on a cross-border link; 15s dropped such plugins
// from the portal even though they would have mounted shortly after.
export const DEFAULT_PLUGIN_TIMEOUT_MS = 60000;

/** Bound even non-cancellable imports; cancellable resources receive a signal. */
export function withPluginDeadline(work, { signal, timeoutMs = DEFAULT_PLUGIN_TIMEOUT_MS, label = 'Plugin resource' } = {}) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return Promise.reject(new Error('Plugin timeout must be positive'));
    const controller = new AbortController();
    return new Promise((resolve, reject) => {
        let settled = false;
        let timer;
        const finish = (error, value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            signal?.removeEventListener('abort', cancel);
            if (error) { controller.abort(error); reject(error); }
            else resolve(value);
        };
        const cancel = () => finish(signal.reason || new Error(`${label} cancelled`));
        if (signal?.aborted) { cancel(); return; }
        signal?.addEventListener('abort', cancel, { once: true });
        timer = setTimeout(() => finish(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
        Promise.resolve().then(() => {
            controller.signal.throwIfAborted();
            return work(controller.signal);
        }).then(value => finish(null, value), error => finish(error || new Error(`${label} failed`)));
    });
}

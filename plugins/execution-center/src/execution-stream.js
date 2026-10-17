// SPDX-License-Identifier: Apache-2.0
// Single-execution streams are NOT task-independent notification subscriptions.
// Reconnecting a trigger GET can create another execution: always close on error.
const terminalTypes = new Set(['complete', 'close', 'cancelled', 'error', 'dispatch_error', 'dispatch_result']);

function errorMessage(event) {
    const message = event.data?.error || event.message || event.data?.reason;
    return typeof message === 'string' ? message : 'Execution failed';
}

export function openExecutionStream(url, { onEvent, onFinish, EventSourceClass = globalThis.EventSource }) {
    let finished = false;
    let source;
    const close = () => {
        finished = true;
        if (source) {
            source.onmessage = null;
            source.onerror = null;
            source.close();
        }
    };
    const finish = (type, error) => {
        if (finished) return;
        close();
        onFinish({ type, error });
    };
    try {
        source = new EventSourceClass(url, { withCredentials: true });
        source.onmessage = event => {
            if (finished) return;
            try {
                const parsed = JSON.parse(event.data);
                if (!parsed || typeof parsed.type !== 'string') throw new Error('Invalid execution event');
                onEvent(parsed);
                if (terminalTypes.has(parsed.type)) {
                    finish(parsed.type, ['error', 'dispatch_error'].includes(parsed.type) ? errorMessage(parsed) : null);
                }
            } catch {
                finish('error', 'Invalid execution event');
            }
        };
        source.onerror = () => finish('error', 'Execution stream disconnected; automatic retry is disabled to prevent duplicate execution');
    } catch {
        finish('error', 'Unable to open execution stream');
    }
    return { close };
}

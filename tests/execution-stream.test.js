import { describe, expect, test, vi } from 'vitest';
import { openExecutionStream } from '../plugins/execution-center/src/execution-stream.js';

function harness() {
    let source;
    class EventSource {
        constructor(url, options) { this.url = url; this.options = options; this.close = vi.fn(); source = this; }
    }
    const onFinish = vi.fn(), onEvent = vi.fn();
    const stream = openExecutionStream('/execute', { onFinish, onEvent, EventSourceClass: EventSource });
    return { source, stream, onFinish, onEvent };
}
describe('single-execution streams (not long-lived notifications)', () => {
    test.each(['complete', 'close', 'cancelled', 'dispatch_result', 'dispatch_error', 'error'])('%s terminates once', type => {
        const h = harness();
        const callback = h.source.onmessage;
        callback({ data: JSON.stringify({ type, data: { error: 'failure' } }) });
        callback({ data: JSON.stringify({ type }) });
        expect(h.source.close).toHaveBeenCalledOnce();
        expect(h.onFinish).toHaveBeenCalledOnce();
        expect(h.onFinish.mock.calls[0][0].type).toBe(type);
        expect(h.onEvent).toHaveBeenCalledOnce();
    });
    test('top-level errors without data preserve the backend message', () => {
        const h = harness();
        h.source.onmessage({ data: JSON.stringify({ type: 'error', message: 'No agent cards available' }) });
        expect(h.onFinish).toHaveBeenCalledWith({ type: 'error', error: 'No agent cards available' });
        expect(h.source.close).toHaveBeenCalledOnce();
    });
    test.each([0, 2])('onerror closes in readyState %i, preventing replay', readyState => {
        const h = harness(); h.source.readyState = readyState;
        h.source.onerror();
        expect(h.source.close).toHaveBeenCalledOnce();
        expect(h.source.onerror).toBeNull();
        expect(h.onFinish.mock.calls[0][0].error).toContain('automatic retry is disabled');
    });
    test.each(['bad-json', 'null', '{}'])('malformed frame %s fails safely', data => {
        const h = harness(); h.source.onmessage({ data });
        expect(h.source.close).toHaveBeenCalledOnce();
        expect(h.onFinish).toHaveBeenCalledWith({ type: 'error', error: 'Invalid execution event' });
    });
    test('progress keeps the stream, manual close drops late callbacks', () => {
        const h = harness(); const callback = h.source.onmessage;
        callback({ data: '{"type":"start"}' });
        expect(h.source.close).not.toHaveBeenCalled(); h.stream.close();
        callback({ data: '{"type":"complete"}' });
        expect(h.onEvent).toHaveBeenCalledOnce(); expect(h.onFinish).not.toHaveBeenCalled();
    });
    test('constructor failure resets the UI through onFinish', () => {
        const onFinish = vi.fn();
        openExecutionStream('bad', { onFinish, onEvent: vi.fn(), EventSourceClass: class { constructor() { throw new Error(); } } });
        expect(onFinish).toHaveBeenCalledWith({ type: 'error', error: 'Unable to open execution stream' });
    });
});

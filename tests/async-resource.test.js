import { afterEach, expect, test, vi } from 'vitest';
import { withPluginDeadline, DEFAULT_PLUGIN_TIMEOUT_MS } from '../packages/portal-sdk/src/async-resource.js';

afterEach(() => vi.useRealTimers());
test('default deadline stays 60s: a gzipped 1.5MB bundle needs 20s+ on cross-border links', () => {
    expect(DEFAULT_PLUGIN_TIMEOUT_MS).toBe(60000);
});
test('successful loads clear timers; falsy rejection remains a failure', async () => {
    vi.useFakeTimers();
    await expect(withPluginDeadline(async () => 'ready')).resolves.toBe('ready');
    expect(vi.getTimerCount()).toBe(0);
    await expect(withPluginDeadline(() => Promise.reject())).rejects.toThrow('failed');
    expect(vi.getTimerCount()).toBe(0);
});
test('abort cancels work, clears timers, and late completion is ignored', async () => {
    vi.useFakeTimers();
    const parent = new AbortController(); let finish, signal;
    const pending = withPluginDeadline(child => { signal = child; return new Promise(resolve => { finish = resolve; }); }, { signal: parent.signal });
    await Promise.resolve();
    const failed = expect(pending).rejects.toBeTruthy(); parent.abort(); await failed;
    expect(signal.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0); finish('late');
});
test('an already aborted operation never starts its loader', async () => {
    const parent = new AbortController(); parent.abort(); const work = vi.fn();
    await expect(withPluginDeadline(work, { signal: parent.signal })).rejects.toBeTruthy(); expect(work).not.toHaveBeenCalled();
});

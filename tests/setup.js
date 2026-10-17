import { afterEach, vi } from 'vitest';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// The intentionally crashing fixture is handled by ErrorBoundary. Keep other
// browser exceptions visible instead of globally silencing jsdom failures.
if (typeof window !== 'undefined') window.addEventListener('error', event => {
    if (event.error?.message === 'synthetic failure') event.preventDefault();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

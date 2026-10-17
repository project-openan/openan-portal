// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
    plugins: [react()],
    resolve: { alias: {
        '@': path.resolve('portal/src'),
        '@openan/portal-sdk': path.resolve('packages/portal-sdk/src/index.js'),
        '@openan/shared-workflow': path.resolve('packages/shared-workflow/src/index.jsx'),
    } },
    test: { environment: 'jsdom', include: ['tests/**/*.test.{js,jsx}'], setupFiles: ['tests/setup.js'], testTimeout: 15000 },
});

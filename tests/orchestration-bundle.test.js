// Copyright (c) 2026 Huawei Technologies Co., Ltd.
// All Rights Reserved.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Artifact guard for the prebuilt orchestration-center bundle.
 *
 * The portal ships plugins from portal/public/plugins/ as prebuilt UMD
 * bundles. If this artifact is rebuilt from a source tree that still
 * carries the hardcoded MOCK_PACKAGES list (or is simply stale), every
 * portal dist deploy silently overwrites live servers with the mock
 * version again — exactly the regression that once replaced the 19 real
 * SPG solution packages with 3 fake demo entries in production.
 *
 * These tests fail the build BEFORE such an artifact can ship:
 *   - the bundle must call the real solution-packages API
 *   - the bundle must not contain the old mock package filenames
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';

// Vitest runs from the repo root (vitest.config.js); resolve the shipped
// artifact relative to cwd instead of import.meta.url (not a file: URL here).
const bundlePath = path.resolve(process.cwd(), 'portal/public/plugins/orchestration-center/index.js');

test('shipped orchestration-center bundle fetches the real solution-packages list', () => {
    const bundle = readFileSync(bundlePath, 'utf8');
    expect(bundle).toContain('solution-packages');
});

test('shipped orchestration-center bundle carries no hardcoded demo package list', () => {
    const bundle = readFileSync(bundlePath, 'utf8');
    for (const mock of [
        'RAN_Energy_Saving_Solution_Package.pdf',
        'SPN_Fault_Handling_Solution_Package.pdf',
        'Home_Broadband_Complaint_Solution_Package.pdf',
    ]) {
        expect(bundle).not.toContain(mock);
    }
});

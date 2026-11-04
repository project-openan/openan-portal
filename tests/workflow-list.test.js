// SPDX-License-Identifier: Apache-2.0
import { expect, test, vi } from 'vitest';
import { listWorkflows } from '../plugins/execution-center/src/workflow-list.js';

test('follows pagination so exact search and tags see workflows after the first page', async () => {
    const last = { workflow_id: 'target', tags: ['only-on-page-two'] };
    const get = vi.fn()
        .mockResolvedValueOnce({ status: 'success', data: Array.from({ length: 10 }, (_, index) => ({ workflow_id: String(index) })), pagination: { has_more: true } })
        .mockResolvedValueOnce({ status: 'success', data: [last], pagination: { has_more: false } });
    expect((await listWorkflows({ get })).at(-1)).toEqual(last);
    expect(get.mock.calls.map(([, config]) => config.params.offset)).toEqual([0, 10]);
});

test('fails instead of looping if a page claims more records without advancing', async () => {
    const get = vi.fn().mockResolvedValue({ status: 'success', data: [], pagination: { has_more: true } });
    await expect(listWorkflows({ get })).rejects.toThrow('did not advance');
    expect(get).toHaveBeenCalledTimes(1);
});

test('aborting a search prevents requests for later pages', async () => {
    const controller = new AbortController();
    const get = vi.fn(async () => {
        controller.abort();
        return { status: 'success', data: [{ workflow_id: 'first' }], pagination: { has_more: true } };
    });
    await expect(listWorkflows({ get }, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(get).toHaveBeenCalledTimes(1);
});

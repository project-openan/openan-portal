// SPDX-License-Identifier: Apache-2.0

const PAGE_SIZE = 100;

export async function listWorkflows(api, signal) {
    const workflows = [];
    let offset = 0;
    while (true) {
        signal?.throwIfAborted();
        const response = await api.get('/rest/v1/orchestrate/workflows', {
            params: { limit: PAGE_SIZE, offset },
            signal,
        });
        signal?.throwIfAborted();
        const page = response?.data;
        if (response?.status !== 'success' || !Array.isArray(page)) {
            throw new Error('Invalid workflow list response');
        }
        workflows.push(...page);
        if (!response.pagination?.has_more) return workflows;
        if (page.length === 0) throw new Error('Workflow pagination did not advance');
        offset += page.length;
    }
}

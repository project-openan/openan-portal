// SPDX-License-Identifier: Apache-2.0
const base = '/rest/v1/observe/traces';
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const displayFields = (value, keys) => record(value) && keys.every(key => value[key] == null || ['string', 'number', 'boolean'].includes(typeof value[key]));

// The shared Portal client unwraps HTTP response.data, not the service envelope.
function data(body) {
    if (body?.code !== 200 || body.status !== 'success' || body.data == null) {
        throw new Error('Invalid observation API response');
    }
    return body.data;
}

export async function readTraceList(api, signal) {
    const result = data(await api.get(base, { signal, timeout: 30000 }));
    if (!Array.isArray(result) || result.some(row => typeof row?.session_id !== 'string' ||
        !displayFields(row, ['psop_name', 'status', 'started_at']))) {
        throw new Error('Invalid observation session list');
    }
    return result;
}

export async function readTraceDetail(api, id, signal) {
    const result = data(await api.get(`${base}/${encodeURIComponent(id)}`, { signal, timeout: 30000 }));
    if (!record(result) ||
        !Array.isArray(result.graph?.nodes) || !Array.isArray(result.graph?.edges) ||
        !Array.isArray(result.interactions) ||
        result.graph.nodes.some(node => !displayFields(node, ['id', 'label', 'name', 'node_type', 'status'])) ||
        result.graph.edges.some(edge => !record(edge)) ||
        result.interactions.some(item => !displayFields(item, ['ts', 'a2at_type', 'sender', 'receiver'])) ||
        (result.metrics != null && !record(result.metrics))) throw new Error('Invalid observation trace detail');
    return result;
}

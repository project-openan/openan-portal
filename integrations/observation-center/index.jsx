// SPDX-License-Identifier: Apache-2.0
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePortalContext } from '@openan/portal-sdk';
import { readTraceList, readTraceDetail } from './api.js';
import '../integration.css';

// Schedule after completion, rather than setInterval: slow backends never cause
// overlapping requests. Selection changes and unmount abort outstanding work.
function usePolling(load, automatic, revision) {
    const [state, setState] = useState({ loading: true, error: '', data: null });
    useEffect(() => {
        const controller = new AbortController();
        let timer;
        async function refresh() {
            setState(previous => ({ ...previous, loading: true, error: '' }));
            try {
                const result = await load(controller.signal);
                if (!controller.signal.aborted) setState({ data: result, error: '', loading: false });
            } catch (error) {
                if (!controller.signal.aborted) setState(previous => ({ ...previous, error: error.message, loading: false }));
            } finally {
                if (automatic && !controller.signal.aborted) timer = setTimeout(refresh, 5000);
            }
        }
        refresh();
        return () => { controller.abort(); clearTimeout(timer); };
    }, [load, automatic, revision]);
    return state;
}

const text = {
    en: { title: 'Observation Center', refresh: 'Refresh', auto: 'Refresh every 5 seconds', sessions: 'Sessions', empty: 'No sessions reported', select: 'Select a session', loading: 'Loading…', status: 'Status', started: 'Started', session: 'Session', topology: 'Topology', nodes: 'Nodes', edges: 'Edges', metrics: 'Metrics', interactions: 'Interactions', latest: 'Showing the latest 200 interactions', details: 'Details', hint: 'Read-only observation data from the observation service. No workflow is started by this page.', failed: 'Observation request failed; displayed data may be stale.' },
    zh: { title: '可观测中心', refresh: '刷新', auto: '每 5 秒刷新', sessions: '会话', empty: '暂无上报的会话', select: '请选择会话', loading: '加载中…', status: '状态', started: '开始时间', session: '会话', topology: '拓扑', nodes: '节点', edges: '连线', metrics: '指标', interactions: '交互记录', latest: '展示最近 200 条交互记录', details: '详情', hint: '只读展示观测服务中的真实数据，不会启动工作流。', failed: '观测请求失败；当前展示的数据可能已过期。' },
};

export default function ObservationCenter() {
    const { api, theme } = usePortalContext();
    const { i18n } = useTranslation();
    const t = text[i18n.language?.startsWith('zh') ? 'zh' : 'en'];
    const [selected, setSelected] = useState('');
    const [automatic, setAutomatic] = useState(true);
    const [revision, setRevision] = useState(0);
    const loadList = useCallback(signal => readTraceList(api, signal), [api]);
    const sessions = usePolling(loadList, automatic, revision);
    const loadDetail = useCallback(async signal => selected
        ? { id: selected, value: await readTraceDetail(api, selected, signal) } : null, [api, selected]);
    const trace = usePolling(loadDetail, automatic && !!selected, revision);
    const detail = trace.data?.id === selected ? trace.data.value : null;
    const rows = sessions.data || [];
    const error = sessions.error || trace.error;
    return <section className="openan-integration" data-dark={!!theme?.isDark}>
        <header><h1>{t.title}</h1><button onClick={() => setRevision(value => value + 1)}>{t.refresh}</button>
            <label><input type="checkbox" checked={automatic} onChange={event => setAutomatic(event.target.checked)} /> {t.auto}</label></header>
        <p>{t.hint}</p>
        {error && <p role="alert" className="integration-error">{t.failed} {error}</p>}
        <div className="integration-panel"><h2>{t.sessions} ({rows.length})</h2>
            {sessions.loading && <p role="status">{t.loading}</p>}
            {!sessions.loading && !sessions.error && rows.length === 0 && <p>{t.empty}</p>}
            {rows.length > 0 && <table><thead><tr><th>{t.session}</th><th>{t.status}</th><th>{t.started}</th></tr></thead>
                <tbody>{rows.map(row => <tr key={row.session_id}><td><button aria-pressed={selected === row.session_id} onClick={() => setSelected(row.session_id)}>{row.psop_name || row.session_id}</button><div>{row.session_id}</div></td><td>{row.status || '—'}</td><td>{row.started_at || '—'}</td></tr>)}</tbody></table>}
        </div>
        {selected ? <div className="integration-panel"><h2>{selected}</h2>
            {trace.loading && <p role="status">{t.loading}</p>}
            {detail && <>
                <h2>{t.topology}</h2>
                <p>{t.nodes}: {detail.graph.nodes.length} · {t.edges}: {detail.graph.edges.length}</p>
                <table><tbody>{detail.graph.nodes.map((node, index) => <tr key={node.id || index}><th>{node.label || node.name || node.id}</th><td>{node.node_type || ''}</td><td>{node.status || '—'}</td></tr>)}</tbody></table>
                <details><summary>{t.edges}</summary><pre>{JSON.stringify(detail.graph.edges, null, 2)}</pre></details>
                <h2>{t.metrics}</h2>
                <table><tbody>{Object.entries(detail.metrics || {}).map(([key, value]) => <tr key={key}><th>{key.replaceAll('_', ' ')}</th><td>{value == null ? '—' : String(value)}</td></tr>)}</tbody></table>
                <details><summary>{t.details}</summary><pre>{JSON.stringify({ summary: detail.summary, metrics: detail.metrics }, null, 2)}</pre></details>
                <h2>{t.interactions} ({detail.interactions.length})</h2><p>{t.latest}</p>
                {detail.interactions.slice(-200).map((item, index) => <details key={index}><summary>{item.ts || ''} · {item.a2at_type || ''} · {item.sender || ''} → {item.receiver || ''}</summary><pre>{JSON.stringify(item, null, 2)}</pre></details>)}
            </>}
        </div> : <p>{t.select}</p>}
    </section>;
}

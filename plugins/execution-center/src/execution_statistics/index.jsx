// Copyright (c) 2026 Huawei Technologies Co., Ltd.
// All Rights Reserved.
//
// SPDX-License-Identifier: Apache-2.0
//
//    Licensed under the Apache License, Version 2.0 (the "License"); you may
//    not use this file except in compliance with the License. You may obtain
//    a copy of the License at
//
//         http://www.apache.org/licenses/LICENSE-2.0
//
//    Unless required by applicable law or agreed to in writing, software
//    distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
//    WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
//    License for the specific language governing permissions and limitations
//    under the License.
import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, LineChart, Line
} from 'recharts';
import { usePortalContext } from '@openan/portal-sdk';

const STATUS_COLORS = { success: '#10b981', failed: '#ef4444', running: '#f59e0b' };
const ACCENT = '#1a56db';

const ellipsize = (name, max = 18) => {
    if (!name) return '';
    return name.length > max ? `${name.slice(0, max - 1)}…` : name;
};

const SectionTitle = ({ num, title, theme }) => (
    <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className={`text-[19px] flex items-center gap-2.5 pb-3 border-b ${theme.line} ${theme.ink}`}>
            <span className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-full bg-[#1a56db] dark:bg-blue-600 text-white text-sm shrink-0">
                {num}
            </span>
            {title}
        </h2>
    </div>
);

const ExecutionStatistics = ({ isDark }) => {
    const { api } = usePortalContext();
    const { t } = useTranslation('execution-center');
    const API_BASE = '/rest/v1/orchestrate';
    const getExecutionRecords = () => api.get(`${API_BASE}/execution-records`);
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedWorkflow, setSelectedWorkflow] = useState(null);

    useEffect(() => {
        const fetchRecords = async () => {
            try {
                setLoading(true);
                const res = await getExecutionRecords();
                if (res.status === 'success') {
                    setRecords(res.data || []);
                }
            } catch (err) {
                console.error("Failed to load execution records:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchRecords();
    }, []);

    const statusCounts = useMemo(() => {
        const counts = { success: 0, failed: 0, running: 0 };
        records.forEach(r => {
            const status = r.status || 'success';
            if (status in counts) {
                counts[status]++;
            } else {
                counts.success++;
            }
        });
        return counts;
    }, [records]);

    const total = records.length;
    const successRate = total > 0 ? ((statusCounts.success / total) * 100).toFixed(1) : '0.0';

    const statusDistribution = useMemo(() => {
        return Object.entries(statusCounts).map(([status, count]) => ({
            status,
            name: t(`execution.status_${status}`),
            value: count,
            percentage: total > 0 ? ((count / total) * 100).toFixed(1) : 0
        }));
    }, [statusCounts, total, t]);

    const frequencyRanking = useMemo(() => {
        const counts = {};
        records.forEach(r => {
            const name = r.psop_name || r.psop_id || 'Unknown';
            counts[name] = (counts[name] || 0) + 1;
        });

        return Object.entries(counts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);
    }, [records]);

    const workflowList = useMemo(() => {
        const names = new Set();
        records.forEach(r => {
            names.add(r.psop_name || r.psop_id || 'Unknown');
        });
        return Array.from(names);
    }, [records]);

    const trendData = useMemo(() => {
        if (!selectedWorkflow) return [];

        const monthlyData = {};
        records.forEach(r => {
            const name = r.psop_name || r.psop_id || 'Unknown';
            if (name !== selectedWorkflow) return;

            const date = new Date(r.started_at || r.created_at);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            monthlyData[monthKey] = (monthlyData[monthKey] || 0) + 1;
        });

        return Object.entries(monthlyData)
            .map(([month, count]) => ({ month, count }))
            .sort((a, b) => a.month.localeCompare(b.month))
            .slice(-12);
    }, [records, selectedWorkflow]);

    useEffect(() => {
        if (workflowList.length > 0 && !selectedWorkflow) {
            setSelectedWorkflow(workflowList[0]);
        }
    }, [workflowList, selectedWorkflow]);

    const peakMonth = useMemo(
        () => trendData.reduce((m, d) => (!m || d.count > m.count ? d : m), null),
        [trendData]
    );

    const collectedAt = useMemo(() => new Date().toLocaleDateString(), []);

    const theme = {
        page: isDark ? 'bg-zinc-950' : 'bg-[#f6f8fb]',
        card: isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-[#e2e8f0]',
        line: isDark ? 'border-zinc-800' : 'border-[#e2e8f0]',
        ink: isDark ? 'text-zinc-100' : 'text-[#0f172a]',
        muted: isDark ? 'text-zinc-400' : 'text-[#64748b]',
        value: isDark ? 'text-blue-400' : 'text-[#1a56db]',
        th: isDark ? 'bg-zinc-800/60 text-zinc-300' : 'bg-[#f1f5f9] text-[#334155]',
        sumRow: isDark ? 'bg-zinc-800/40' : 'bg-[#f8fafc]',
        chartText: isDark ? '#a1a1aa' : '#64748b',
        grid: isDark ? '#27272a' : '#e2e8f0',
        tooltip: {
            backgroundColor: isDark ? '#18181b' : '#fff',
            border: `1px solid ${isDark ? '#3f3f46' : '#e2e8f0'}`,
            borderRadius: '8px',
            color: isDark ? '#fafafa' : '#0f172a',
            fontSize: '13px'
        }
    };

    const tooltipStyle = { ...theme.tooltip };

    if (loading) {
        return (
            <div className={`h-full flex items-center justify-center ${theme.page}`}>
                <div className={`flex flex-col items-center gap-3 ${theme.muted}`}>
                    <div className="w-8 h-8 border-2 border-zinc-300 dark:border-zinc-600 border-t-[#1a56db] rounded-full animate-spin" />
                    <span className="text-sm">{t('execution.loading')}</span>
                </div>
            </div>
        );
    }

    const statCards = [
        { v: total.toLocaleString(), k: t('execution.total_executions') },
        { v: statusCounts.success.toLocaleString(), k: t('execution.status_success') },
        { v: statusCounts.failed.toLocaleString(), k: t('execution.status_failed') },
        { v: statusCounts.running.toLocaleString(), k: t('execution.status_running') },
        { v: workflowList.length.toLocaleString(), k: t('execution.workflows_involved') },
        { v: `${successRate}%`, k: t('execution.success_rate') }
    ];

    const td = `px-2.5 py-[7px] text-right border-b ${theme.line}`;
    const tdL = `${td} text-left`;
    const th = `px-2.5 py-[7px] text-right font-semibold ${theme.th}`;
    const thL = `${th} text-left`;
    const sumTd = `px-2.5 py-[7px] text-right border-b ${theme.line} font-bold ${theme.sumRow}`;
    const sumTdL = `${sumTd} text-left`;

    return (
        <div className={`h-full overflow-y-auto custom-scrollbar ${theme.page}`}>
            <div className="max-w-[1100px] mx-auto px-6 pt-9 pb-20">
                <header className="text-center pb-1">
                    <h1 className={`text-[28px] leading-snug ${theme.ink}`}>
                        {t('execution.statistics_title')}
                    </h1>
                    <div className={`text-sm mt-1.5 ${theme.muted}`}>
                        {t('execution.report_meta', { time: collectedAt, count: total.toLocaleString() })}
                    </div>
                </header>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-7">
                    {statCards.map(card => (
                        <div key={card.k} className={`${theme.card} border rounded-[10px] py-4 px-2.5 text-center`}>
                            <div className={`text-2xl font-bold leading-tight ${theme.value}`}>{card.v}</div>
                            <div className={`text-xs mt-0.5 ${theme.muted}`}>{card.k}</div>
                        </div>
                    ))}
                </div>

                <section className={`${theme.card} border rounded-xl p-6 md:p-[26px] mt-[26px]`}>
                    <SectionTitle num={1} title={t('execution.frequency_ranking')} theme={theme} />
                    <p className={`text-[13.5px] mt-2 mb-4 ${theme.muted}`}>
                        {t('execution.frequency_sub', { total: total.toLocaleString(), workflows: workflowList.length, n: frequencyRanking.length })}
                    </p>
                    {frequencyRanking.length > 0 ? (
                        <>
                            <div className={`border ${theme.line} rounded-lg`}>
                                <ResponsiveContainer width="100%" height={300}>
                                    <BarChart data={frequencyRanking} layout="vertical" margin={{ left: 16, right: 16, top: 8, bottom: 8 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
                                        <XAxis type="number" stroke={theme.grid} tick={{ fill: theme.chartText, fontSize: 12 }} allowDecimals={false} />
                                        <YAxis
                                            dataKey="name"
                                            type="category"
                                            width={150}
                                            stroke={theme.grid}
                                            tick={{ fill: theme.chartText, fontSize: 12 }}
                                            tickFormatter={(v) => ellipsize(v)}
                                        />
                                        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(26,86,219,0.04)' }} />
                                        <Bar dataKey="count" fill={ACCENT} radius={[0, 4, 4, 0]} maxBarSize={18} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            <table className="w-full border-collapse mt-4 text-[13.5px]">
                                <thead>
                                    <tr>
                                        <th className={thL}>{t('execution.stat_rank')}</th>
                                        <th className={thL}>{t('execution.stat_workflow')}</th>
                                        <th className={th}>{t('execution.stat_count')}</th>
                                        <th className={th}>{t('execution.stat_share')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {frequencyRanking.map((item, idx) => (
                                        <tr key={item.name} className={theme.ink}>
                                            <td className={tdL}>{idx + 1}</td>
                                            <td className={tdL}>{item.name}</td>
                                            <td className={td}>{item.count.toLocaleString()}</td>
                                            <td className={td}>{total > 0 ? ((item.count / total) * 100).toFixed(1) : 0}%</td>
                                        </tr>
                                    ))}
                                    <tr>
                                        <td className={sumTdL} colSpan={2}>
                                            {t('execution.stat_total')}
                                        </td>
                                        <td className={sumTd}>{total.toLocaleString()}</td>
                                        <td className={sumTd}>100%</td>
                                    </tr>
                                </tbody>
                            </table>
                        </>
                    ) : (
                        <div className={`h-[300px] flex items-center justify-center text-sm ${theme.muted}`}>
                            {t('execution.no_data')}
                        </div>
                    )}
                </section>

                <section className={`${theme.card} border rounded-xl p-6 md:p-[26px] mt-[26px]`}>
                    <SectionTitle num={2} title={t('execution.status_distribution')} theme={theme} />
                    <p className={`text-[13.5px] mt-2 mb-4 ${theme.muted}`}>
                        {t('execution.status_sub', {
                            success: statusCounts.success.toLocaleString(),
                            failed: statusCounts.failed.toLocaleString(),
                            running: statusCounts.running.toLocaleString(),
                            total: total.toLocaleString()
                        })}
                    </p>
                    {total > 0 ? (
                        <>
                            <div className={`border ${theme.line} rounded-lg`}>
                                <ResponsiveContainer width="100%" height={300}>
                                    <PieChart>
                                        <Pie
                                            data={statusDistribution}
                                            dataKey="value"
                                            nameKey="name"
                                            cx="50%"
                                            cy="50%"
                                            outerRadius={95}
                                            label={{ fill: theme.chartText, fontSize: 12 }}
                                            labelLine={{ stroke: theme.grid }}
                                        >
                                            {statusDistribution.map(entry => (
                                                <Cell key={entry.status} fill={STATUS_COLORS[entry.status]} />
                                            ))}
                                        </Pie>
                                        <Tooltip contentStyle={tooltipStyle} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <table className="w-full border-collapse mt-4 text-[13.5px]">
                                <thead>
                                    <tr>
                                        <th className={thL}>{t('execution.status')}</th>
                                        <th className={th}>{t('execution.stat_count')}</th>
                                        <th className={th}>{t('execution.stat_share')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {statusDistribution.map(item => (
                                        <tr key={item.status} className={theme.ink}>
                                            <td className={tdL}>
                                                <span
                                                    className="inline-block w-2.5 h-2.5 rounded-[2px] mr-2 align-middle"
                                                    style={{ backgroundColor: STATUS_COLORS[item.status] }}
                                                />
                                                {item.name}
                                            </td>
                                            <td className={td}>{item.value.toLocaleString()}</td>
                                            <td className={td}>{item.percentage}%</td>
                                        </tr>
                                    ))}
                                    <tr>
                                        <td className={sumTdL}>{t('execution.stat_total')}</td>
                                        <td className={sumTd}>{total.toLocaleString()}</td>
                                        <td className={sumTd}>100%</td>
                                    </tr>
                                </tbody>
                            </table>
                        </>
                    ) : (
                        <div className={`h-[300px] flex items-center justify-center text-sm ${theme.muted}`}>
                            {t('execution.no_data')}
                        </div>
                    )}
                </section>

                <section className={`${theme.card} border rounded-xl p-6 md:p-[26px] mt-[26px]`}>
                    <SectionTitle num={3} title={t('execution.monthly_trend')} theme={theme} />
                    <div className="flex items-end justify-between gap-4 flex-wrap mt-2 mb-4">
                        <p className={`text-[13.5px] ${theme.muted}`}>
                            {t('execution.trend_sub', { workflow: selectedWorkflow || '—' })}
                            {peakMonth ? t('execution.peak_month', { month: peakMonth.month, count: peakMonth.count.toLocaleString() }) : ''}
                        </p>
                        <select
                            value={selectedWorkflow || ''}
                            onChange={(e) => setSelectedWorkflow(e.target.value)}
                            className={`px-3 py-1.5 rounded-lg border text-[13px] outline-none ${theme.card} ${theme.line} ${theme.ink}`}
                        >
                            {workflowList.map(wf => (
                                <option key={wf} value={wf}>{wf}</option>
                            ))}
                        </select>
                    </div>
                    {trendData.length > 0 ? (
                        <>
                            <div className={`border ${theme.line} rounded-lg`}>
                                <ResponsiveContainer width="100%" height={300}>
                                    <LineChart data={trendData} margin={{ top: 16, right: 24, left: 8, bottom: 8 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
                                        <XAxis dataKey="month" stroke={theme.grid} tick={{ fill: theme.chartText, fontSize: 12 }} />
                                        <YAxis stroke={theme.grid} tick={{ fill: theme.chartText, fontSize: 12 }} allowDecimals={false} />
                                        <Tooltip contentStyle={tooltipStyle} />
                                        <Line
                                            type="monotone"
                                            dataKey="count"
                                            stroke={ACCENT}
                                            strokeWidth={2.5}
                                            dot={{ fill: ACCENT, r: 4 }}
                                            activeDot={{ r: 6 }}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                            <table className="w-full border-collapse mt-4 text-[13.5px]">
                                <thead>
                                    <tr>
                                        <th className={thL}>{t('execution.stat_month')}</th>
                                        <th className={th}>{t('execution.stat_count')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {trendData.map(item => (
                                        <tr key={item.month} className={theme.ink}>
                                            <td className={tdL}>{item.month}</td>
                                            <td className={td}>{item.count.toLocaleString()}</td>
                                        </tr>
                                    ))}
                                    <tr>
                                        <td className={sumTdL}>{t('execution.stat_total')}</td>
                                        <td className={sumTd}>
                                            {trendData.reduce((a, d) => a + d.count, 0).toLocaleString()}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </>
                    ) : (
                        <div className={`h-[300px] flex items-center justify-center text-sm ${theme.muted}`}>
                            {t('execution.no_data')}
                        </div>
                    )}
                </section>

                <footer className={`text-center text-[12.5px] mt-9 ${theme.muted}`}>
                    {t('execution.report_footer')}
                </footer>
            </div>
        </div>
    );
};

export default ExecutionStatistics;

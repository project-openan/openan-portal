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
import React, { useMemo } from 'react';
import { Bot, Network } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const AGENT_COLORS = ['bg-blue-500', 'bg-purple-500', 'bg-teal-500', 'bg-orange-500', 'bg-pink-500', 'bg-emerald-500', 'bg-indigo-500', 'bg-cyan-500'];

const agentColor = (name) => {
    if (!name) return 'bg-slate-400';
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return AGENT_COLORS[Math.abs(hash) % AGENT_COLORS.length];
};

const stepOrder = (id) => {
    const n = parseInt(String(id || '').replace(/\D/g, ''), 10);
    return Number.isFinite(n) ? n : 9999;
};

/**
 * Build the interaction star topology:
 *   - The FIRST step is the "Interaction Center" (交互中心) — every other
 *     agent's messages route through it.
 *   - Message counts are derived from agent_request events.
 */
const buildTopology = (nodes, events) => {
    const stepNodes = nodes
        .filter(n => n.type === 'agentNode')
        .sort((a, b) => stepOrder(a.id) - stepOrder(b.id));

    const agents = [];
    const seen = new Set();
    let hub = null;

    stepNodes.forEach((n, stepIdx) => {
        const subtasks = (n.data?.subtasks && n.data.subtasks.length > 0)
            ? n.data.subtasks
            : [{ agent: n.data?.agent }];
        subtasks.forEach(st => {
            const name = st?.agent || n.data?.agent;
            if (!name || seen.has(name)) return;
            seen.add(name);
            if (stepIdx === 0 && !hub) hub = name;
            agents.push(name);
        });
    });

    const counts = {};
    (events || []).forEach(e => {
        if (e.type === 'agent_request' && e.data?.agent) {
            counts[e.data.agent] = (counts[e.data.agent] || 0) + 1;
        }
    });

    const hubAgents = stepNodes.length > 0
        ? (stepNodes[0].data?.subtasks?.length
            ? stepNodes[0].data.subtasks.map(s => s.agent).filter(Boolean)
            : [hub].filter(Boolean))
        : [];

    return { hub, hubAgents: [...new Set(hubAgents)], others: agents.filter(a => !hubAgents.includes(a)), counts };
};

const InteractionTopology = ({ nodes, events, isDark, isRunning }) => {
    const { t } = useTranslation();
    const { hub, others, counts } = useMemo(() => buildTopology(nodes, events), [nodes, events]);

    const positions = useMemo(() => {
        const map = {};
        others.forEach((name, i) => {
            const angle = (-90 + (360 / Math.max(others.length, 1)) * i) * (Math.PI / 180);
            map[name] = {
                left: `${50 + 36 * Math.cos(angle)}%`,
                top: `${50 + 38 * Math.sin(angle)}%`,
            };
        });
        return map;
    }, [others]);

    if (!hub) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-500">
                <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
                    <Network size={26} strokeWidth={1.5} />
                </div>
                <p className="text-sm font-medium">{t('execution.interaction_tab')}</p>
                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">选择或搜索工作流开始执行</p>
            </div>
        );
    }

    return (
        <div className={`relative h-full w-full overflow-hidden ${isDark ? 'text-zinc-300' : 'text-slate-700'}`}>
            <style>{`@keyframes ecDash { to { stroke-dashoffset: -24; } }`}</style>

            {/* message channel lines: every agent <-> hub */}
            <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
                {others.map(name => {
                    const pos = positions[name];
                    return (
                        <line
                            key={name}
                            x1="50%" y1="50%"
                            x2={pos.left} y2={pos.top}
                            stroke={isDark ? '#3b82f6' : '#60a5fa'}
                            strokeOpacity="0.55"
                            strokeWidth="2"
                            strokeDasharray="7 5"
                            style={{ animation: 'ecDash 1.2s linear infinite' }}
                        />
                    );
                })}
            </svg>

            {/* hint */}
            <div className={`absolute top-3 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-full border text-[11px] font-medium backdrop-blur-md whitespace-nowrap
                ${isDark ? 'bg-zinc-900/70 border-zinc-700 text-zinc-400' : 'bg-white/80 border-slate-200 text-slate-500'}`}>
                {t('execution.interaction_hint')}
            </div>

            {/* hub card */}
            <div className="absolute z-10 -translate-x-1/2 -translate-y-1/2" style={{ left: '50%', top: '50%' }}>
                <div className={`relative w-44 rounded-2xl border-2 p-3.5 pt-4 flex flex-col items-center gap-1.5 shadow-xl transition-all
                    ${isDark ? 'bg-zinc-900 border-blue-500/60 shadow-blue-500/10' : 'bg-white border-blue-400 shadow-blue-500/10'}`}>
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-blue-600 text-white whitespace-nowrap">
                        {t('execution.interaction_hub')}
                    </span>
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                        <Bot size={18} className="text-white" />
                    </div>
                    <span className="text-[12px] font-bold text-center break-words leading-tight text-zinc-900 dark:text-white">{hub}</span>
                    <span className={`text-[10px] font-medium px-1.5 rounded ${isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-slate-100 text-slate-500'}`}>
                        {t('execution.interaction_messages', { count: counts[hub] || 0 })}
                    </span>
                    {isRunning && <span className="absolute -right-1 -top-1 w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />}
                </div>
            </div>

            {/* other agent cards */}
            {others.map(name => {
                const pos = positions[name];
                const count = counts[name] || 0;
                return (
                    <div key={name} className="absolute z-10 -translate-x-1/2 -translate-y-1/2" style={pos}>
                        <div className={`w-36 rounded-xl border p-2.5 flex flex-col items-center gap-1 shadow-md transition-all
                            ${isDark ? 'bg-zinc-900/90 border-zinc-700' : 'bg-white border-zinc-200'}`}>
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${agentColor(name)}`}>
                                <Bot size={14} className="text-white" />
                            </div>
                            <span className="text-[11px] font-semibold text-center break-words leading-tight text-zinc-900 dark:text-white">{name}</span>
                            <span className={`text-[9px] font-mono ${count > 0 ? (isDark ? 'text-blue-400' : 'text-blue-600') : 'text-zinc-400'}`}>
                                {t('execution.interaction_messages', { count })}
                            </span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default InteractionTopology;

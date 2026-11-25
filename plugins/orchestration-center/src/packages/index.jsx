// Copyright (c) 2026 Huawei Technologies Co., Ltd.
// All Rights Reserved.
//
// SPDX-License-Identifier: Apache-2.0
//
//    Licensed under the Apache License, Version 2.0 (the "License"); you may
//    not use this file except in compliance with the License. You may obtain
//    a copy of the License at
//
//        http://www.apache.org/licenses/LICENSE-2.0
//
//    Unless required by applicable law or agreed to in writing, software
//    distributed under the License is distributed on an "AS IS" BASIS,
//    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Upload, FileText, Link2, Clock, Loader2 } from 'lucide-react';

const formatDate = (dateStr, locale) => {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr || '';
    return d.toLocaleDateString(locale || 'zh-CN', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
    });
};

/**
 * Lists the REAL imported solution packages via the orchestration backend
 * (GET /rest/v1/orchestrate/solution-packages). The list must always come
 * from `listPackages` — never fall back to a hardcoded/mock list, otherwise
 * the deployed UI silently shows stale demo data (see tests/orchestration-*
 * for the regression guards).
 */
const SolutionPackages = ({ onBack, onImportPdf, onViewWorkflow, listPackages, loading, loadingStatus, progress, t }) => {
    const { i18n } = useTranslation();
    const fileInput = useRef(null);
    const [dragOver, setDragOver] = useState(false);
    const [packages, setPackages] = useState([]);
    const [listLoading, setListLoading] = useState(true);
    const [listError, setListError] = useState('');

    const refresh = useCallback(async () => {
        if (typeof listPackages !== 'function') return;
        setListLoading(true);
        setListError('');
        try {
            const data = await listPackages();
            setPackages(Array.isArray(data) ? data : []);
        } catch (e) {
            setPackages([]);
            setListError((e && e.message) || String(e));
        } finally {
            setListLoading(false);
        }
    }, [listPackages]);

    useEffect(() => { refresh(); }, [refresh]);

    // After a PDF import finishes (parent's `loading` falls back to false),
    // re-fetch so the newly imported package shows up immediately.
    const wasLoading = useRef(false);
    useEffect(() => {
        if (wasLoading.current && !loading) refresh();
        wasLoading.current = !!loading;
    }, [loading, refresh]);

    const handleDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files[0] && e.dataTransfer.files[0].type === 'application/pdf') {
            onImportPdf(e.dataTransfer.files[0]);
        }
    };

    const handleFileSelect = (e) => {
        if (e.target.files[0] && e.target.files[0].type === 'application/pdf') {
            onImportPdf(e.target.files[0]);
        }
        e.target.value = '';
    };

    return (
        <div className="h-full w-full flex flex-col overflow-hidden animate-in fade-in duration-300">
            <div className="shrink-0 px-10 pt-8 pb-4">
                <button
                    onClick={onBack}
                    className="group flex items-center gap-2 text-xs font-black text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-all uppercase tracking-[0.2em] mb-6"
                >
                    <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                    {t('orchestration.back_to_options')}
                </button>

                <div
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInput.current?.click()}
                    className={`
                        relative flex flex-col items-center justify-center gap-4 p-10 rounded-3xl border-2 border-dashed cursor-pointer transition-all duration-300
                        ${dragOver
                            ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/10 scale-[1.01]'
                            : 'border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/30 hover:border-amber-300 dark:hover:border-amber-600 hover:bg-amber-50/50 dark:hover:bg-amber-900/5'
                        }
                        ${loading ? 'pointer-events-none opacity-60' : ''}
                    `}
                >
                    {loading ? (
                        <>
                            <Loader2 size={36} className="animate-spin text-amber-500" />
                            <div className="text-center">
                                <p className="text-sm font-black text-zinc-700 dark:text-zinc-300">
                                    {t(loadingStatus)} {Math.floor(progress)}%
                                </p>
                                <div className="mt-3 w-48 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all duration-300"
                                        style={{ width: `${progress}%` }}
                                    />
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="p-4 rounded-2xl bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400">
                                <Upload size={28} />
                            </div>
                            <div className="text-center">
                                <p className="text-sm font-black text-zinc-700 dark:text-zinc-300 mb-1">
                                    {t('orchestration.packages_upload_title')}
                                </p>
                                <p className="text-xs text-zinc-400 dark:text-zinc-500">
                                    {t('orchestration.packages_upload_hint')}
                                </p>
                            </div>
                        </>
                    )}
                    <input
                        type="file"
                        ref={fileInput}
                        className="hidden"
                        accept=".pdf"
                        onChange={handleFileSelect}
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-10 pb-8 custom-scrollbar">
                <div className="flex items-center gap-3 mb-4 mt-2">
                    <h3 className="text-xs font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em]">
                        {t('orchestration.packages_list_title')}
                    </h3>
                    <span className="px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[10px] font-black text-zinc-500 dark:text-zinc-400">
                        {packages.length}
                    </span>
                </div>

                {listLoading ? (
                    <div className="flex items-center justify-center gap-2 py-10 text-zinc-400 dark:text-zinc-500">
                        <Loader2 size={18} className="animate-spin" />
                        <span className="text-xs font-black uppercase tracking-widest">
                            {t('orchestration.packages_list_loading')}
                        </span>
                    </div>
                ) : listError ? (
                    <div className="p-5 rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/10 text-red-500 text-xs font-black uppercase tracking-widest">
                        {t('orchestration.packages_list_error')} — {listError}
                    </div>
                ) : packages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-zinc-300 dark:text-zinc-600">
                        <FileText size={40} className="mb-3 opacity-40" />
                        <p className="text-sm font-black uppercase tracking-widest">
                            {t('orchestration.packages_empty')}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {packages.map(pkg => (
                            <div
                                key={pkg.pdf_filename}
                                className="group p-5 rounded-2xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 hover:border-amber-200 dark:hover:border-amber-700 hover:shadow-lg transition-all duration-300"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4 min-w-0 flex-1">
                                        <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-500 shrink-0">
                                            <FileText size={20} />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <h4 className="text-sm font-black text-zinc-800 dark:text-zinc-200 truncate" title={pkg.pdf_filename}>
                                                {pkg.pdf_filename}
                                            </h4>
                                            <div className="flex items-center gap-2 mt-1 text-zinc-400 dark:text-zinc-500">
                                                <span className="flex items-center gap-1">
                                                    <Clock size={11} />
                                                    <span className="text-[11px]">
                                                        {formatDate(pkg.created_at, i18n.language)}
                                                    </span>
                                                </span>
                                                {pkg.chapter_count ? (
                                                    <span className="text-[11px]">
                                                        · {pkg.chapter_count} {t('orchestration.packages_chapters')}
                                                    </span>
                                                ) : null}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3 shrink-0 ml-4">
                                        {pkg.workflow_id ? (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onViewWorkflow(pkg.workflow_id);
                                                }}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider text-white bg-blue-500 hover:bg-blue-600 shadow-sm shadow-blue-500/20 transition-all"
                                            >
                                                <Link2 size={13} />
                                                Workflow
                                                <ChevronRightIcon size={11} />
                                            </button>
                                        ) : null}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

const ChevronRightIcon = ({ size, className }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <polyline points="9 18 15 12 9 6" />
    </svg>
);

export default SolutionPackages;

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
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowLeft, Upload, FileText, Link2, Clock, Loader2, RefreshCw, Trash2 } from 'lucide-react';

const SolutionPackages = ({ onBack, onImportPdf, onViewWorkflow, listPackages, deletePackage, loading, loadingStatus, progress, t }) => {
    const fileInput = useRef(null);
    const [dragOver, setDragOver] = useState(false);
    const [packages, setPackages] = useState([]);
    const [listLoading, setListLoading] = useState(true);

    // Keep the latest API accessor in a ref so the mount-only fetch effect does
    // not re-run (and re-fetch) on every parent re-render.
    const listRef = useRef(listPackages);
    listRef.current = listPackages;

    const refresh = useCallback(async () => {
        setListLoading(true);
        try {
            const data = await listRef.current();
            setPackages(Array.isArray(data) ? data : []);
        } catch (e) {
            setPackages([]);
        } finally {
            setListLoading(false);
        }
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    const handleDelete = async (pkg) => {
        if (!window.confirm(`删除方案包 ${pkg.pdf_filename} ？关联的工作流不受影响。`)) return;
        try {
            await deletePackage(pkg.pdf_filename);
            await refresh();
        } catch (e) {
            console.error('Delete failed:', e.message || e);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file && file.type === 'application/pdf') {
            onImportPdf(file);
        }
    };

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (file && file.type === 'application/pdf') {
            onImportPdf(file);
        }
        e.target.value = '';
    };

    const formatDate = (dateStr) => {
        const d = new Date(dateStr);
        return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('zh-CN', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit'
        });
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
                        relative flex flex-col items-center justify-center gap-4 py-14
                        border-2 border-dashed rounded-3xl cursor-pointer transition-all duration-300
                        ${dragOver
                            ? 'border-blue-400 bg-blue-50/60 dark:bg-blue-900/20'
                            : 'border-zinc-200 dark:border-zinc-700 hover:border-blue-300 dark:hover:border-blue-600'}
                    `}
                >
                    <input
                        type="file"
                        accept="application/pdf"
                        className="hidden"
                        ref={fileInput}
                        onChange={handleFileSelect}
                    />
                    <div className="p-5 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
                        <Upload size={30} strokeWidth={2.2} />
                    </div>
                    <div className="text-center">
                        <p className="text-sm font-black text-zinc-700 dark:text-zinc-200 uppercase tracking-wider">
                            {t('orchestration.packages_upload_title')}
                        </p>
                        <p className="text-xs font-bold text-zinc-400 mt-1.5">
                            {t('orchestration.packages_upload_hint')}
                        </p>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-10 pb-8 custom-scrollbar">
                <div className="flex items-center gap-3 mb-4 mt-2">
                    <h3 className="text-xs font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em]">
                        {t('orchestration.packages_list_title')}
                    </h3>
                    <button
                        onClick={refresh}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-blue-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                        title="Refresh"
                    >
                        <RefreshCw size={13} className={listLoading ? 'animate-spin' : ''} />
                    </button>
                    <span className="px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[10px] font-black text-zinc-500 dark:text-zinc-400">
                        {packages.length}
                    </span>
                </div>

                {listLoading ? (
                    <div className="flex items-center justify-center gap-3 py-16 text-zinc-400">
                        <Loader2 size={18} className="animate-spin" />
                        <span className="text-xs font-black uppercase tracking-widest">Loading...</span>
                    </div>
                ) : packages.length === 0 ? (
                    <div className="text-center py-16 text-zinc-400">
                        <FileText size={28} className="mx-auto mb-3 opacity-50" />
                        <p className="text-xs font-bold uppercase tracking-widest">
                            暂无已导入的解决方案包——拖入上方区域即可导入解析。
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {packages.map((pkg) => (
                            <div
                                key={pkg.pdf_filename}
                                className="group p-5 rounded-2xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 hover:border-amber-200 dark:hover:border-amber-700 hover:shadow-lg transition-all duration-300"
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex items-start gap-4 min-w-0">
                                        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-500 shrink-0">
                                            <FileText size={20} />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-black text-zinc-800 dark:text-zinc-100 truncate" title={pkg.pdf_filename}>
                                                {pkg.pdf_filename}
                                            </p>
                                            <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mt-1.5 text-[11px] font-bold text-zinc-400">
                                                <span className="inline-flex items-center gap-1">
                                                    <Clock size={11} />
                                                    {formatDate(pkg.created_at)}
                                                </span>
                                                {typeof pkg.chapter_count === 'number' && (
                                                    <span className="inline-flex items-center gap-1">
                                                        <FileText size={11} />
                                                        {pkg.chapter_count} chapters
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        {pkg.workflow_id ? (
                                            <button
                                                onClick={() => onViewWorkflow(pkg.workflow_id)}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider text-white bg-blue-500 hover:bg-blue-600 shadow-sm shadow-blue-500/20 transition-all"
                                            >
                                                <Link2 size={13} />
                                                Workflow
                                            </button>
                                        ) : (
                                            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-300 dark:text-zinc-600">
                                                Workflow 未生成
                                            </span>
                                        )}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDelete(pkg);
                                            }}
                                            className="p-2 rounded-lg text-zinc-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                                            title={t('skills.delete_package')}
                                        >
                                            <Trash2 size={15} />
                                        </button>
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

export default SolutionPackages;

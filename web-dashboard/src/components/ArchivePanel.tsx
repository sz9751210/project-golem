"use client";

import React from "react";
import { X, Archive, Trash2 } from "lucide-react";
import type { Todo } from "./TodoCard";

interface ArchivedTodo extends Todo {
    archivedAt: number;
}

interface ArchivePanelProps {
    open: boolean;
    onClose: () => void;
    items: ArchivedTodo[];
    onClearAll: () => void;
}

export function ArchivePanel({ open, onClose, items, onClearAll }: ArchivePanelProps) {
    return (
        <>
            {/* Backdrop */}
            {open && (
                <div
                    className="fixed inset-0 bg-black/50 z-40"
                    onClick={onClose}
                />
            )}

            {/* Drawer */}
            <div className={`fixed top-0 right-0 h-full w-80 bg-gray-950 border-l border-gray-800 z-50 flex flex-col transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}>
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
                    <div className="flex items-center gap-2">
                        <Archive className="w-4 h-4 text-gray-400" />
                        <h2 className="text-sm font-semibold text-white">已存檔任務</h2>
                        <span className="text-xs text-gray-500 bg-gray-800 rounded-full px-2 py-0.5">{items.length}</span>
                    </div>
                    <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {items.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-600">
                            <Archive className="w-8 h-8 mb-2 opacity-30" />
                            <p className="text-xs">尚無存檔任務</p>
                        </div>
                    ) : (
                        items.map((item) => (
                            <div key={item.id} className="rounded-xl border border-gray-800 bg-gray-900 p-3">
                                <p className="text-sm font-medium text-white mb-1">{item.title}</p>
                                {item.result && (
                                    <p className="text-xs text-gray-400 line-clamp-3">{item.result}</p>
                                )}
                                <p className="text-[10px] text-gray-600 mt-1.5">
                                    存檔於 {new Date(item.archivedAt).toLocaleString("zh-TW", { hour12: false, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                                </p>
                            </div>
                        ))
                    )}
                </div>

                {/* Footer */}
                {items.length > 0 && (
                    <div className="p-3 border-t border-gray-800">
                        <button
                            onClick={onClearAll}
                            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-red-900/40 bg-red-950/20 hover:bg-red-950/40 text-red-400 text-xs transition-all"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            清空存檔
                        </button>
                    </div>
                )}
            </div>
        </>
    );
}

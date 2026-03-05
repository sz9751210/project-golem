"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronUp, GripVertical, Loader2, Trash2 } from "lucide-react";

export interface Todo {
    id: string;
    title: string;
    description: string;
    status: "backlog" | "doing" | "review" | "done";
    golemId: string;
    suggestion: string;
    result: string;
    createdAt: number;
    updatedAt: number;
}

interface TodoCardProps {
    todo: Todo;
    onDelete: (id: string) => void;
    onDragStart: (e: React.DragEvent, id: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
    backlog: "text-gray-400 bg-gray-800/60 border-gray-700/40",
    doing: "text-blue-300 bg-blue-900/30 border-blue-700/40",
    review: "text-amber-300 bg-amber-900/30 border-amber-700/40",
    done: "text-green-300 bg-green-900/30 border-green-700/40",
};

const STATUS_LABELS: Record<string, string> = {
    backlog: "待辦",
    doing: "執行中",
    review: "待確認",
    done: "完成",
};

export function TodoCard({ todo, onDelete, onDragStart }: TodoCardProps) {
    const [expanded, setExpanded] = useState(false);
    const hasExtra = !!(todo.suggestion || todo.result || todo.description);

    return (
        <div
            draggable
            onDragStart={(e) => onDragStart(e, todo.id)}
            className={`group rounded-xl border bg-gray-900 p-3 cursor-grab active:cursor-grabbing transition-all duration-200 hover:border-gray-600 ${STATUS_COLORS[todo.status]}`}
        >
            {/* Header row */}
            <div className="flex items-start gap-2">
                <GripVertical className="w-4 h-4 text-gray-600 mt-0.5 flex-shrink-0 group-hover:text-gray-400 transition-colors" />
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white leading-snug break-words">{todo.title}</p>
                    {todo.description && !expanded && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{todo.description}</p>
                    )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                    {todo.status === "doing" && (
                        <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                    )}
                    {hasExtra && (
                        <button
                            onClick={() => setExpanded(!expanded)}
                            className="p-0.5 text-gray-600 hover:text-gray-300 transition-colors"
                        >
                            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                    )}
                    <button
                        onClick={() => onDelete(todo.id)}
                        className="p-0.5 text-gray-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Expanded content */}
            {expanded && (
                <div className="mt-2 pl-6 space-y-2">
                    {todo.description && (
                        <p className="text-xs text-gray-400 leading-relaxed">{todo.description}</p>
                    )}
                    {todo.suggestion && (
                        <div className="rounded-lg bg-cyan-950/40 border border-cyan-800/30 px-2.5 py-2">
                            <p className="text-[10px] text-cyan-500 font-medium mb-0.5">🤖 Golem 建議</p>
                            <p className="text-xs text-cyan-300 leading-relaxed">{todo.suggestion}</p>
                        </div>
                    )}
                    {todo.result && (
                        <div className="rounded-lg bg-purple-950/40 border border-purple-800/30 px-2.5 py-2">
                            <p className="text-[10px] text-purple-400 font-medium mb-0.5">✅ 執行結果</p>
                            <p className="text-xs text-purple-200 leading-relaxed whitespace-pre-wrap">{todo.result}</p>
                        </div>
                    )}
                </div>
            )}

            {/* Status badge */}
            <div className="mt-2 pl-6 flex items-center gap-2">
                <span className="text-[10px] text-gray-600">
                    {new Date(todo.updatedAt).toLocaleString("zh-TW", { hour12: false, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </span>
            </div>
        </div>
    );
}

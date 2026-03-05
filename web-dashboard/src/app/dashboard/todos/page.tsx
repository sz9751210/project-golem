"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Archive, CheckSquare2 } from "lucide-react";
import { socket } from "@/lib/socket";
import { useGolem } from "@/components/GolemContext";
import { TodoCard, type Todo } from "@/components/TodoCard";
import { ArchivePanel } from "@/components/ArchivePanel";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// ── Types ────────────────────────────────────────────────────────────────────
type Status = "backlog" | "doing" | "review" | "done";
interface ArchivedTodo extends Todo { archivedAt: number; }

const COLUMNS: { id: Status; label: string; color: string; ring: string }[] = [
    { id: "backlog", label: "📋 Backlog", color: "border-gray-700/50", ring: "ring-gray-600" },
    { id: "doing", label: "🔄 進行中", color: "border-blue-700/40", ring: "ring-blue-500" },
    { id: "review", label: "⏳ 待確認", color: "border-amber-700/40", ring: "ring-amber-500" },
    { id: "done", label: "✅ 完成", color: "border-green-700/40", ring: "ring-green-500" },
];

// ── Archive Dialog ────────────────────────────────────────────────────────────
function ArchiveDialog({ open, onArchive, onDiscard }: { open: boolean; onArchive: () => void; onDiscard: () => void }) {
    return (
        <Dialog open={open} onOpenChange={() => { }}>
            <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-sm">
                <DialogHeader>
                    <div className="w-12 h-12 rounded-xl border border-green-500/20 bg-green-500/10 flex items-center justify-center mb-2">
                        <CheckSquare2 className="w-5 h-5 text-green-400" />
                    </div>
                    <DialogTitle className="text-white text-base">任務完成！要存檔嗎？</DialogTitle>
                    <DialogDescription className="text-gray-400 text-sm">
                        存檔的任務會保留在側邊「已存檔」分頁中，方便日後查閱。若不需要則直接丟棄。
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter className="gap-2 sm:gap-2">
                    <Button
                        variant="outline"
                        className="flex-1 bg-transparent border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-gray-300"
                        onClick={onDiscard}
                    >
                        丟棄
                    </Button>
                    <Button
                        className="flex-1 bg-green-700 hover:bg-green-600 text-white"
                        onClick={onArchive}
                    >
                        存檔
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TodosPage() {
    const { activeGolem } = useGolem();
    const [todos, setTodos] = useState<Todo[]>([]);
    const [archive, setArchive] = useState<ArchivedTodo[]>([]);
    const [archivePanelOpen, setArchivePanelOpen] = useState(false);
    const [newTitle, setNewTitle] = useState("");
    const [newDesc, setNewDesc] = useState("");
    const [showDesc, setShowDesc] = useState(false);
    const [dragId, setDragId] = useState<string | null>(null);
    const [dragOver, setDragOver] = useState<Status | null>(null);
    const [archiveDialog, setArchiveDialog] = useState<{ open: boolean; todoId: string | null }>({ open: false, todoId: null });
    const inputRef = useRef<HTMLInputElement>(null);

    // ── Fetch initial data ──
    useEffect(() => {
        fetch("/api/todos").then(r => r.json()).then(setTodos).catch(console.error);
        fetch("/api/todos/archive").then(r => r.json()).then(setArchive).catch(console.error);
    }, []);

    // ── Socket events ──
    useEffect(() => {
        const handleTodoUpdate = (data: any) => {
            if (data.action === "added") {
                setTodos(prev => [...prev, data.todo]);
            } else if (data.action === "updated") {
                setTodos(prev => prev.map(t => t.id === data.todo.id ? data.todo : t));
            } else if (data.action === "deleted") {
                setTodos(prev => prev.filter(t => t.id !== data.id));
            }
        };
        const handleArchiveUpdate = (data: any) => {
            if (data.action === "added") {
                setArchive(prev => [data.todo, ...prev]);
            } else if (data.action === "cleared") {
                setArchive([]);
            }
        };
        socket.on("todo_update", handleTodoUpdate);
        socket.on("archive_update", handleArchiveUpdate);
        return () => {
            socket.off("todo_update", handleTodoUpdate);
            socket.off("archive_update", handleArchiveUpdate);
        };
    }, []);

    // ── Add todo ──
    const handleAdd = async () => {
        if (!newTitle.trim()) return;
        await fetch("/api/todos", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: newTitle.trim(), description: newDesc.trim(), golemId: activeGolem }),
        });
        setNewTitle("");
        setNewDesc("");
        setShowDesc(false);
        inputRef.current?.focus();
    };

    // ── Delete todo ──
    const handleDelete = async (id: string) => {
        await fetch(`/api/todos/${id}`, { method: "DELETE" });
    };

    // ── Drag ──
    const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
        setDragId(id);
        e.dataTransfer.effectAllowed = "move";
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent, col: Status) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDragOver(col);
    }, []);

    const handleDrop = useCallback(async (e: React.DragEvent, col: Status) => {
        e.preventDefault();
        setDragOver(null);
        if (!dragId) return;
        const todo = todos.find(t => t.id === dragId);
        if (!todo || todo.status === col) { setDragId(null); return; }

        // "done" 欄位 → 彈出 Archive Dialog
        if (col === "done") {
            setArchiveDialog({ open: true, todoId: dragId });
            setDragId(null);
            return;
        }

        // Doing 欄位：Golem 執行中，卡片 UI 先更新、後端非同步執行
        setTodos(prev => prev.map(t => t.id === dragId ? { ...t, status: col } : t));
        await fetch(`/api/todos/${dragId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: col }),
        });
        setDragId(null);
    }, [dragId, todos]);

    // ── Archive Dialog handlers ──
    const handleArchive = async () => {
        const id = archiveDialog.todoId;
        setArchiveDialog({ open: false, todoId: null });
        if (!id) return;
        await fetch(`/api/todos/${id}/archive`, { method: "POST" });
    };

    const handleDiscard = async () => {
        const id = archiveDialog.todoId;
        setArchiveDialog({ open: false, todoId: null });
        if (!id) return;
        await fetch(`/api/todos/${id}`, { method: "DELETE" });
    };

    const handleClearArchive = async () => {
        await fetch("/api/todos/archive/all", { method: "DELETE" });
    };

    return (
        <div className="flex flex-col h-full p-4 gap-4 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between flex-shrink-0">
                <div>
                    <h1 className="text-lg font-bold text-white flex items-center gap-2">
                        <CheckSquare2 className="w-5 h-5 text-cyan-400" />
                        任務看板
                    </h1>
                    <p className="text-xs text-gray-500 mt-0.5">與 Golem 協作管理任務，拖曳卡片到「進行中」讓 Golem 開始實作</p>
                </div>
                <button
                    onClick={() => setArchivePanelOpen(true)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-900 hover:bg-gray-800 text-gray-400 hover:text-white text-xs transition-all"
                >
                    <Archive className="w-3.5 h-3.5" />
                    存檔
                    {archive.length > 0 && (
                        <span className="bg-gray-700 text-gray-300 rounded-full px-1.5 py-px text-[10px]">{archive.length}</span>
                    )}
                </button>
            </div>

            {/* Add input */}
            <div className="flex-shrink-0 bg-gray-900 border border-gray-800 rounded-xl p-3 space-y-2">
                <div className="flex gap-2">
                    <input
                        ref={inputRef}
                        value={newTitle}
                        onChange={e => setNewTitle(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAdd(); } }}
                        placeholder="新增任務標題... (Enter 送出)"
                        className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-cyan-600 transition-colors"
                    />
                    <button
                        onClick={() => setShowDesc(!showDesc)}
                        className="px-2.5 py-2 rounded-lg border border-gray-700 bg-gray-800 text-gray-500 hover:text-gray-300 text-xs transition-all"
                        title="新增描述"
                    >
                        詳細
                    </button>
                    <button
                        onClick={handleAdd}
                        disabled={!newTitle.trim()}
                        className="px-3 py-2 rounded-lg bg-cyan-700 hover:bg-cyan-600 text-white text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                    >
                        <Plus className="w-4 h-4" />
                        新增
                    </button>
                </div>
                {showDesc && (
                    <textarea
                        value={newDesc}
                        onChange={e => setNewDesc(e.target.value)}
                        placeholder="任務描述（選填）"
                        rows={2}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-cyan-600 resize-none transition-colors"
                    />
                )}
            </div>

            {/* Kanban columns */}
            <div className="flex-1 grid grid-cols-4 gap-3 min-h-0 overflow-hidden">
                {COLUMNS.map(col => {
                    const colTodos = todos.filter(t => t.status === col.id);
                    const isOver = dragOver === col.id;
                    return (
                        <div
                            key={col.id}
                            onDragOver={e => handleDragOver(e, col.id)}
                            onDragLeave={() => setDragOver(null)}
                            onDrop={e => handleDrop(e, col.id)}
                            className={`flex flex-col rounded-xl border bg-gray-950/60 transition-all duration-150 ${col.color} ${isOver ? `ring-1 ${col.ring} bg-gray-900/60` : ""}`}
                        >
                            {/* Column header */}
                            <div className="px-3 pt-3 pb-2 flex items-center justify-between flex-shrink-0">
                                <span className="text-sm font-semibold text-white">{col.label}</span>
                                <span className="text-xs text-gray-500 bg-gray-800 rounded-full px-2 py-px">{colTodos.length}</span>
                            </div>

                            {/* Cards */}
                            <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2 scrollbar-thin scrollbar-thumb-gray-700">
                                {colTodos.length === 0 ? (
                                    <div className={`h-20 rounded-lg border-2 border-dashed flex items-center justify-center text-xs text-gray-700 transition-colors ${isOver ? "border-gray-500 text-gray-500" : "border-gray-800"}`}>
                                        {isOver ? "放開以移入" : "拖曳任務到此"}
                                    </div>
                                ) : (
                                    colTodos.map(todo => (
                                        <TodoCard
                                            key={todo.id}
                                            todo={todo}
                                            onDelete={handleDelete}
                                            onDragStart={handleDragStart}
                                        />
                                    ))
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Archive Panel */}
            <ArchivePanel
                open={archivePanelOpen}
                onClose={() => setArchivePanelOpen(false)}
                items={archive}
                onClearAll={handleClearArchive}
            />

            {/* Archive Confirm Dialog */}
            <ArchiveDialog
                open={archiveDialog.open}
                onArchive={handleArchive}
                onDiscard={handleDiscard}
            />
        </div>
    );
}

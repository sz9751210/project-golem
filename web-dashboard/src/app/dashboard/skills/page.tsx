"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { BookOpen, AlertCircle, CheckCircle2, RefreshCcw, ChevronRight, Zap, TriangleAlert, Plus, Pencil, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

// ── Inject Confirm Dialog ───────────────────────────────────────────────────
function InjectConfirmDialog({
    open, onOpenChange, onConfirm, isLoading,
}: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    onConfirm: () => void;
    isLoading: boolean;
}) {
    return (
        <Dialog open={open} onOpenChange={isLoading ? undefined : onOpenChange}>
            <DialogContent showCloseButton={!isLoading} className="bg-card border-border text-foreground max-w-sm">
                <DialogHeader>
                    <div className="w-12 h-12 rounded-xl border bg-cyan-100 dark:bg-cyan-500/10 border-cyan-200 dark:border-cyan-500/20 flex items-center justify-center mb-2">
                        <Zap className="w-5 h-5 text-cyan-700 dark:text-cyan-400" />
                    </div>
                    <DialogTitle className="text-foreground text-base">注入技能書？</DialogTitle>
                    <DialogDescription className="text-muted-foreground text-sm leading-relaxed">
                        系統將依據目前配置，重新開啟全新的 Gemini 對話視窗進行注入。過往設定的人格與歷史記憶將會完整保留。
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                    <div className="flex items-start gap-2 rounded-lg bg-muted/60 border border-border/50 px-3 py-2.5">
                        <TriangleAlert className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-muted-foreground">此動作將暫時開新視窗中斷目前對話，但人格設定與長期記憶不受影響。</p>
                    </div>
                    <div className="rounded-lg bg-muted/40 border border-border/30 px-3 py-2">
                        <p className="text-[11px] text-muted-foreground mb-1 font-medium">確認後將自動執行：</p>
                        <ol className="text-[11px] text-muted-foreground space-y-0.5 list-decimal list-inside">
                            <li>清除技能快取</li>
                            <li>重新開啟 Gemini 通訊視窗</li>
                            <li>自存檔載入人格，並注入所有技能記憶</li>
                        </ol>
                    </div>
                </div>
                <DialogFooter className="gap-2 sm:gap-2">
                    <Button variant="outline" className="flex-1 bg-transparent border-border text-muted-foreground hover:bg-muted hover:text-muted-foreground"
                        onClick={() => onOpenChange(false)} disabled={isLoading}>取消</Button>
                    <Button className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white" onClick={onConfirm} disabled={isLoading}>
                        {isLoading ? (
                            <span className="flex items-center gap-1.5"><RefreshCcw className="w-3.5 h-3.5 animate-spin" />注入中...</span>
                        ) : (
                            <span className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" />確認注入</span>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ── Inject Done Dialog ──────────────────────────────────────────────────────
function InjectDoneDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-card border-border text-foreground max-w-sm" showCloseButton={false}>
                <DialogHeader>
                    <div className="w-12 h-12 rounded-xl border bg-green-500/10 border-green-500/20 flex items-center justify-center mb-2">
                        <CheckCircle2 className="w-5 h-5 text-green-700 dark:text-green-400" />
                    </div>
                    <DialogTitle className="text-foreground text-base">技能注入完成 ✅</DialogTitle>
                    <DialogDescription className="text-muted-foreground text-sm">
                        已於新的 Gemini 對話視窗中完成注入。人格設定與歷史記憶已從存檔完整還原，3 秒後自動關閉。
                    </DialogDescription>
                </DialogHeader>
            </DialogContent>
        </Dialog>
    );
}

// ── Skill Editor Dialog ─────────────────────────────────────────────────────
function SkillEditorDialog({
    open, onOpenChange, mode, initialId = "", initialContent = "", onSaved,
}: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    mode: "create" | "edit";
    initialId?: string;
    initialContent?: string;
    onSaved: () => void;
}) {
    const [id, setId] = useState(initialId);
    const [content, setContent] = useState(initialContent);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (open) {
            setId(initialId);
            setContent(initialContent || "# 新技能\n\n在這裡輸入 Markdown 格式的提示詞...");
            setError(null);
        }
    }, [open, initialId, initialContent]);

    const handleSubmit = async () => {
        if (!id.trim()) { setError("請填寫技能 ID"); return; }
        if (!content.trim()) { setError("請填寫技能內容"); return; }

        setIsLoading(true); setError(null);
        try {
            const endpoint = mode === "create" ? "/api/skills/create" : "/api/skills/update";
            const res = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: id.trim(), content }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                onOpenChange(false);
                onSaved();
            } else {
                setError(data.error || "儲存失敗");
            }
        } catch {
            setError("請求發送失敗");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={isLoading ? undefined : onOpenChange}>
            <DialogContent showCloseButton={!isLoading} className="bg-card border-border text-foreground max-w-2xl max-h-[90vh] flex flex-col">
                <DialogHeader className="flex-shrink-0">
                    <div className="w-10 h-10 rounded-xl border bg-cyan-100 dark:bg-cyan-500/10 border-cyan-200 dark:border-cyan-500/20 flex items-center justify-center mb-2">
                        {mode === "create" ? <Plus className="w-5 h-5 text-cyan-700 dark:text-cyan-400" /> : <Pencil className="w-5 h-5 text-cyan-700 dark:text-cyan-400" />}
                    </div>
                    <DialogTitle className="text-foreground text-base">
                        {mode === "create" ? "新增自訂技能" : "編輯自訂技能"}
                    </DialogTitle>
                    <DialogDescription className="text-muted-foreground text-sm">
                        編輯 Markdown 格式的技能提示詞。將自動存為 <code>src/skills/lib/{id || '<id>'}.md</code>
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto space-y-4 py-2 min-h-[300px] flex flex-col">
                    <div className="flex-shrink-0">
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">檔案 ID (英文數字底線)</label>
                        <input
                            value={id}
                            onChange={e => setId(e.target.value)}
                            disabled={mode === "edit"}
                            placeholder="my_custom_skill"
                            className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-mono"
                        />
                    </div>
                    <div className="flex-1 flex flex-col min-h-[200px]">
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">提示詞內容 (Markdown)</label>
                        <textarea
                            value={content}
                            onChange={e => setContent(e.target.value)}
                            className="w-full flex-1 bg-background border border-border rounded-xl px-3 py-2 text-sm text-muted-foreground font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 transition-all resize-none"
                            placeholder="# 標題\n\n對 AI 的系統指令..."
                        />
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 text-red-400 text-sm bg-red-950/20 border border-red-900/30 rounded-lg px-3 py-2 flex-shrink-0">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
                        </div>
                    )}
                </div>

                <DialogFooter className="gap-2 sm:gap-2 flex-shrink-0 pt-2">
                    <Button variant="outline" className="flex-1 bg-transparent border-border text-muted-foreground hover:bg-muted hover:text-muted-foreground"
                        onClick={() => onOpenChange(false)} disabled={isLoading}>取消</Button>
                    <Button className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white" onClick={handleSubmit} disabled={isLoading}>
                        {isLoading ? (
                            <span className="flex items-center gap-1.5"><RefreshCcw className="w-3.5 h-3.5 animate-spin" />儲存中...</span>
                        ) : (
                            <span className="flex items-center gap-1.5">
                                {mode === "create" ? <Plus className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                                儲存技能
                            </span>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}


// ── Main Page ───────────────────────────────────────────────────────────────
export default function SkillsPage() {
    const [skills, setSkills] = useState<any[]>([]);
    const [selectedSkill, setSelectedSkill] = useState<any | null>(null);
    const [hasUnsyncedChanges, setHasUnsyncedChanges] = useState(false);

    const [isInjecting, setIsInjecting] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [showDone, setShowDone] = useState(false);

    // Editor state
    const [showEditor, setShowEditor] = useState(false);
    const [editorMode, setEditorMode] = useState<"create" | "edit">("create");
    const [editTarget, setEditTarget] = useState<{ id: string, content: string }>({ id: "", content: "" });

    const loadSkills = useCallback(() => {
        fetch("/api/skills")
            .then((res) => res.json())
            .then((data) => {
                if (Array.isArray(data)) {
                    setSkills(data);
                    // Update selected skill if it exists
                    if (selectedSkill) {
                        const updated = data.find(s => s.id === selectedSkill.id);
                        if (updated) setSelectedSkill(updated);
                    } else if (data.length > 0) {
                        setSelectedSkill(data[0]);
                    }
                }
            })
            .catch((err) => console.error(err));
    }, [selectedSkill]);

    useEffect(() => {
        loadSkills();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const toggleSkill = async (id: string, enabled: boolean) => {
        try {
            const res = await fetch("/api/skills/toggle", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, enabled }),
            });
            const data = await res.json();
            if (data.success) {
                setSkills((prev) =>
                    prev.map((s) => (s.id === id ? { ...s, isEnabled: enabled } : s))
                );
                // ✅ 同步更新右側詳情目前選擇的技能狀態，避免 UI 按鈕卡住不變
                if (selectedSkill?.id === id) {
                    setSelectedSkill((prev: any) => prev ? { ...prev, isEnabled: enabled } : null);
                }
                setHasUnsyncedChanges(true);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleInject = async () => {
        setIsInjecting(true);
        try {
            const res = await fetch("/api/skills/inject", { method: "POST" });
            const data = await res.json();
            if (data.success) {
                setShowConfirm(false);
                setHasUnsyncedChanges(false);
                setShowDone(true);
                // ✅ [修復] 不再重啟整個程序（會導致 golem 狀態重置到 pending_setup）
                // reloadSkills() 現在直接對 Gemini 重注入，技能即時生效
                // 3 秒後關閉 "完成" Dialog 並刷新技能列表
                setTimeout(() => {
                    setShowDone(false);
                    setIsInjecting(false);
                    loadSkills();
                }, 3000);
            } else {
                setIsInjecting(false);
            }
        } catch (err) {
            console.error(err);
            setIsInjecting(false);
        }
    };

    const handleCreateSkill = () => {
        setEditorMode("create");
        setEditTarget({ id: "", content: "" });
        setShowEditor(true);
    };

    const handleEditSkill = (e: React.MouseEvent, skill: any) => {
        e.stopPropagation();
        setEditorMode("edit");
        setEditTarget({ id: skill.id, content: skill.content });
        setShowEditor(true);
    };


    return (
        <>
            <div className="flex-1 overflow-hidden bg-background p-6 flex flex-col text-foreground">
                <div className="max-w-6xl w-full mx-auto h-full flex flex-col pt-4">

                    {/* Header */}
                    <div className="flex items-center justify-between mb-8 animate-in fade-in slide-in-from-top-4 duration-500">
                        <div className="flex items-center gap-4">
                            <div className="inline-flex items-center justify-center p-3 bg-cyan-100 dark:bg-cyan-950/50 border border-cyan-200 dark:border-cyan-800/50 rounded-xl shadow-[0_0_20px_-5px_rgba(6,182,212,0.4)]">
                                <BookOpen className="w-6 h-6 text-cyan-700 dark:text-cyan-400" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-zinc-800 via-cyan-700 to-cyan-600 dark:from-white dark:via-cyan-100 dark:to-cyan-400 tracking-tight">
                                    技能說明書 (Skills)
                                </h1>
                                <p className="text-sm text-muted-foreground mt-0.5">管理 Golem 的核心能力與選配模組</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={handleCreateSkill}
                                className="px-4 py-2 text-sm font-medium rounded-lg flex items-center gap-2 transition-all bg-muted text-muted-foreground border border-border hover:bg-accent hover:text-foreground"
                            >
                                <Plus className="w-4 h-4" />
                                新增技能
                            </button>
                            <button
                                onClick={() => setShowConfirm(true)}
                                disabled={isInjecting}
                                className={`px-4 py-2 text-sm font-medium rounded-lg flex items-center gap-2 transition-all ${hasUnsyncedChanges
                                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/50 hover:bg-amber-500/30 animate-pulse"
                                    : "bg-cyan-100 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-300 dark:border-cyan-500/30 hover:bg-cyan-200 dark:hover:bg-cyan-500/20"
                                    } ${isInjecting ? "opacity-60 cursor-not-allowed" : ""}`}
                            >
                                <Zap className={`w-4 h-4 ${isInjecting ? "animate-pulse" : ""}`} />
                                {isInjecting ? "注入中..." : "注入技能書"}
                            </button>
                        </div>
                    </div>

                    {/* Main Content */}
                    <div className="flex flex-1 min-h-0 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
                        {/* Selected Skill Detail (Left) */}
                        <Card className="flex-[2] bg-card/40 border-border shadow-2xl flex flex-col min-h-0 rounded-2xl overflow-hidden backdrop-blur-sm">
                            <CardHeader className="flex-shrink-0 border-b border-border bg-card/60 p-5 px-6">
                                {selectedSkill ? (
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-muted border border-border flex items-center justify-center shadow-inner">
                                                <BookOpen className="w-5 h-5 text-cyan-700 dark:text-cyan-400/80" />
                                            </div>
                                            <div>
                                                <h3 className="text-lg font-bold text-foreground leading-tight">
                                                    {selectedSkill.title}
                                                </h3>
                                                <p className="text-xs text-muted-foreground font-mono mt-0.5">
                                                    {selectedSkill.id}.md
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            {!selectedSkill.isOptional && (
                                                <div className="flex items-center gap-1.5 px-3 py-1 bg-muted/80 border border-border text-muted-foreground text-[11px] uppercase tracking-wider font-bold rounded-lg select-none">
                                                    <AlertCircle className="w-3.5 h-3.5 opacity-70" />
                                                    常駐核心技能
                                                </div>
                                            )}
                                            {selectedSkill.isOptional && (
                                                <button
                                                    onClick={(e) => handleEditSkill(e, selectedSkill)}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/80 border border-border text-muted-foreground hover:text-foreground hover:bg-accent text-xs font-medium rounded-lg transition-colors"
                                                >
                                                    <Pencil className="w-3.5 h-3.5" /> 編輯
                                                </button>
                                            )}
                                            {selectedSkill.isOptional && (
                                                <label className="relative inline-flex items-center cursor-pointer ml-1">
                                                    <input
                                                        type="checkbox"
                                                        className="sr-only peer"
                                                        checked={selectedSkill.isEnabled}
                                                        onChange={(e) => toggleSkill(selectedSkill.id, e.target.checked)}
                                                    />
                                                    <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-border after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-muted peer-checked:after:bg-card after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all border border-border peer-checked:bg-cyan-600 peer-checked:border-cyan-500 shadow-inner"></div>
                                                </label>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="h-[46px] flex items-center text-muted-foreground text-sm">請選擇一個技能以檢視內容</div>
                                )}
                            </CardHeader>
                            <CardContent className="flex-1 overflow-y-auto p-0 scroll-smooth">
                                {selectedSkill ? (
                                    <div className="prose max-w-none p-6 !text-foreground/90 text-[15px] leading-relaxed 
                                        [&_h1]:!text-foreground [&_h2]:!text-foreground [&_h3]:!text-foreground
                                        [&_a]:!text-primary hover:[&_a]:!text-primary/80 
                                        [&_code]:!text-foreground [&_code]:!bg-muted [&_code]:!px-1.5 [&_code]:!py-0.5 [&_code]:!rounded-md [&_code::before]:!content-none [&_code::after]:!content-none
                                        [&_pre]:!bg-zinc-950 [&_pre]:!border [&_pre]:!border-zinc-800 [&_pre]:!shadow-lg [&_pre]:!p-4 [&_pre]:!rounded-lg [&_pre_code]:!bg-transparent [&_pre_code]:!text-zinc-100
                                        [&_blockquote]:!border-l-primary [&_blockquote]:!bg-muted/50 [&_blockquote]:!px-4 [&_blockquote]:!py-2 [&_blockquote]:!rounded-r-lg not-italic [&_blockquote]:!text-muted-foreground
                                        [&_strong]:!text-foreground [&_strong]:!font-bold [&_li::marker]:!text-muted-foreground"
                                    >
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                            {selectedSkill.content.replace(/<SkillModule[^>]*>([\s\S]*?)<\/SkillModule>/g, '$1').trim()}
                                        </ReactMarkdown>
                                    </div>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-4">
                                        <BookOpen className="w-12 h-12 opacity-20" />
                                        <p>在右側列表中選擇技能</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Skill List (Right) */}
                        <div className="flex-1 flex flex-col min-h-0 bg-card/30 border border-border/80 rounded-2xl overflow-hidden shadow-xl">
                            <div className="p-4 border-b border-border/80 bg-card/50 backdrop-blur-sm flex justify-between items-center shrink-0">
                                <h2 className="text-sm font-bold text-foreground uppercase tracking-widest flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.8)]"></div>
                                    已載入模組 ({skills.length})
                                </h2>
                            </div>
                            <div className="flex-1 overflow-y-auto p-2 space-y-1 scroll-smooth">
                                {skills.map((skill) => (
                                    <button
                                        key={skill.id}
                                        onClick={() => setSelectedSkill(skill)}
                                        className={`w-full text-left px-4 py-3 rounded-xl flex items-center justify-between transition-all duration-200 group relative overflow-hidden ${selectedSkill?.id === skill.id
                                            ? "bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-800/50 shadow-lg"
                                            : "hover:bg-muted/50 border border-transparent"
                                            }`}
                                    >
                                        {/* Highlight accent on selected */}
                                        {selectedSkill?.id === skill.id && (
                                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-cyan-500 shadow-[0_0_12px_rgba(6,182,212,0.6)] rounded-r-full"></div>
                                        )}

                                        <div className="flex flex-col gap-1 pr-4 z-10">
                                            <span className={`font-semibold text-[15px] ${selectedSkill?.id === skill.id ? "text-cyan-900 dark:text-cyan-100" : "text-muted-foreground"
                                                }`}>
                                                {skill.title}
                                            </span>
                                            <div className="flex items-center gap-2">
                                                {!skill.isOptional ? (
                                                    <span className="text-[9px] bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-500/30 px-1.5 py-0.5 rounded-md uppercase tracking-wider font-bold shadow-[0_0_10px_-2px_rgba(99,102,241,0.2)]">
                                                        常駐核心
                                                    </span>
                                                ) : skill.isEnabled ? (
                                                    <span className="flex items-center gap-1 text-[10px] text-cyan-700 dark:text-cyan-400 uppercase tracking-wider font-bold">
                                                        <CheckCircle2 className="w-3 h-3" /> 已啟用
                                                    </span>
                                                ) : (
                                                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">未啟用</span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 z-10 shrink-0">
                                            {skill.isOptional && (
                                                <div
                                                    onClick={(e) => handleEditSkill(e, skill)}
                                                    className={`p-1.5 rounded-md transition-colors ${selectedSkill?.id === skill.id
                                                        ? "text-cyan-700 dark:text-cyan-400 hover:bg-cyan-900/50"
                                                        : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-accent hover:text-muted-foreground"
                                                        }`}
                                                >
                                                    <Pencil className="w-3.5 h-3.5" />
                                                </div>
                                            )}
                                            <ChevronRight className={`w-4 h-4 transition-transform ${selectedSkill?.id === skill.id ? "text-cyan-700 dark:text-cyan-400 translate-x-1" : "text-muted-foreground group-hover:text-muted-foreground group-hover:translate-x-0.5"
                                                }`} />
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Dialogs */}
            <InjectConfirmDialog open={showConfirm} onOpenChange={setShowConfirm} onConfirm={handleInject} isLoading={isInjecting} />
            <InjectDoneDialog open={showDone} onOpenChange={setShowDone} />
            <SkillEditorDialog
                open={showEditor}
                onOpenChange={setShowEditor}
                mode={editorMode}
                initialId={editTarget.id}
                initialContent={editTarget.content}
                onSaved={() => {
                    setHasUnsyncedChanges(true);
                    loadSkills();
                }}
            />
        </>
    );
}

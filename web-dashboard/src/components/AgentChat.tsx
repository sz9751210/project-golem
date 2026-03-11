"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { socket } from "@/lib/socket";
import { User, Bot } from "lucide-react";

interface AgentMessage {
    id: string;
    sender: string;
    content: string;
    timestamp: string;
    isSystem: boolean;
}

export function AgentChat() {
    const [messages, setMessages] = useState<AgentMessage[]>([]);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Fetch history
        fetch('/api/agent/logs')
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) {
                    setMessages(data.map((log: any) => ({
                        id: log.timestamp + Math.random().toString(),
                        sender: log.sender,
                        content: log.content,
                        timestamp: new Date(log.timestamp).toLocaleTimeString(),
                        isSystem: log.isSystem
                    })));
                }
            })
            .catch(err => console.error("Failed to load history:", err));

        socket.on("log", (data: any) => {
            // Filter for agent related logs
            if (data.type === 'agent' || data.msg.includes('[MultiAgent]')) {
                let rawMsg = data.msg;

                // Strip [MultiAgent] tag if present to clean up
                if (rawMsg.startsWith('[MultiAgent]')) {
                    rawMsg = rawMsg.replace('[MultiAgent]', '').trim();
                }

                let sender = "System";
                let content = rawMsg;
                let isSystem = true;

                // Parse: "[AgentName] content"
                const match = rawMsg.match(/\[(.*?)\]\s*(.*)/);
                if (match) {
                    sender = match[1];
                    content = match[2];
                    // System if sender is strictly MultiAgent or InteractiveMultiAgent
                    isSystem = sender === "MultiAgent" || sender === "InteractiveMultiAgent";
                }

                setMessages((prev) => [...prev.slice(-1000), {
                    id: Date.now().toString() + Math.random(),
                    sender,
                    content,
                    timestamp: data.time,
                    isSystem
                }]);
            }
        });

        return () => {
            socket.off("log");
        };
    }, []);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    return (
        <div className="flex flex-col h-full bg-background rounded-xl border border-border p-4">
            <div className="flex-1 overflow-y-auto space-y-4 pr-2" ref={scrollRef}>
                {messages.map((msg) => {
                    const isUser = msg.sender === 'User';
                    return (
                        <div
                            key={msg.id}
                            className={cn(
                                "flex flex-col max-w-[80%]",
                                msg.isSystem ? "mx-auto items-center text-center" : isUser ? "ml-auto items-end" : "mr-auto"
                            )}
                        >
                            {!msg.isSystem && (
                                <div className={cn("flex items-center space-x-2 mb-1", isUser && "flex-row-reverse space-x-reverse")}>
                                    <div className={cn(
                                        "w-6 h-6 rounded-full flex items-center justify-center border",
                                        isUser ? "bg-blue-900 border-blue-700" : "bg-cyan-900 border-cyan-700"
                                    )}>
                                        {isUser ? <User className="w-3 h-3 text-blue-300" /> : <Bot className="w-3 h-3 text-cyan-300" />}
                                    </div>
                                    <span className={cn("text-xs font-bold", isUser ? "text-blue-700 dark:text-blue-400" : "text-cyan-700 dark:text-cyan-400")}>{msg.sender}</span>
                                    <span className="text-[10px] text-muted-foreground">{msg.timestamp}</span>
                                </div>
                            )}
                            <div
                                className={cn(
                                    "p-3 rounded-lg text-sm",
                                    msg.isSystem
                                        ? "bg-card text-muted-foreground text-xs border border-border"
                                        : isUser
                                            ? "bg-blue-950/30 text-blue-100 border border-blue-900/50 rounded-tr-none"
                                            : "bg-cyan-950/30 text-cyan-100 border border-cyan-900/50 rounded-tl-none"
                                )}
                            >
                                {msg.content}
                            </div>
                        </div>
                    );
                })}
                {messages.length === 0 && (
                    <div className="flex items-center justify-center h-full text-muted-foreground italic">
                        Waiting for agent activity...
                    </div>
                )}
            </div>
        </div>
    );
}

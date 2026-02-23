"use client";

import { useEffect, useState } from "react";
import { socket } from "@/lib/socket";

interface AgentStatus {
    name: string;
    status: 'idle' | 'working' | 'speaking';
    lastMessage: string;
    lastActive: number;
    isPermanent?: boolean;
    deskIndex?: number;
}

const PERMANENT_AGENTS = [
    { name: 'golem_memory', displayName: 'MEMORY', index: 0 },
    { name: 'golem_action', displayName: 'ACTION', index: 1 },
    { name: 'golem_replay', displayName: 'REPLAY', index: 2 }
];

export function VirtualOffice() {
    const [agents, setAgents] = useState<Map<string, AgentStatus>>(new Map(
        PERMANENT_AGENTS.map(agent => [
            agent.name,
            { name: agent.name, status: 'idle', lastMessage: '', lastActive: Date.now(), isPermanent: true, deskIndex: agent.index }
        ])
    ));

    useEffect(() => {
        const handleLog = (data: any) => {
            // Filter for agent related logs, including the new GOLEM block format
            if (data.type === 'agent' || data.msg.includes('[MultiAgent]') || data.msg.includes('[GOLEM_')) {
                let rawMsg = data.msg;
                if (rawMsg.startsWith('[MultiAgent]')) {
                    rawMsg = rawMsg.replace('[MultiAgent]', '').trim();
                }

                let parsedMessages: { sender: string, content: string }[] = [];

                // Try parsing multi-block format
                if (rawMsg.includes('[GOLEM_')) {
                    const regex = /\[(GOLEM_[A-Z_]+)\]([\s\S]*?)(?=\[(?:GOLEM_[A-Z_]+)\]|\[\[END|$)/g;
                    let match;
                    while ((match = regex.exec(rawMsg)) !== null) {
                        let s = match[1].trim().toLowerCase();
                        let c = match[2].trim();

                        // Clean up [[BEGIN:xxx]] or [[END:xxx]] if they accidentally got caught
                        c = c.replace(/\[\[BEGIN.*?\]\]/g, '').replace(/\[\[END.*?\]\]/g, '').trim();

                        // Map reply to replay if mismatched
                        // if (s === 'golem_reply') s = 'golem_replay'; // Removed as per instruction

                        if (c && c !== 'null') {
                            parsedMessages.push({ sender: s, content: c });
                        }
                    }
                }

                // Fallback to classic format
                if (parsedMessages.length === 0) {
                    const match = rawMsg.match(/\[(.*?)\]\s*([\s\S]*)/);
                    if (match) {
                        let s = match[1].toLowerCase();
                        // if (s === 'golem_reply') s = 'golem_replay'; // Removed as per instruction
                        parsedMessages.push({ sender: s, content: match[2].trim() });
                    }
                }

                setAgents(prev => {
                    const next = new Map(prev);

                    for (const { sender, content } of parsedMessages) {
                        // Ignore pure system messages like "Session started" if they aren't from a specific skill
                        if (sender === "system" || sender === "multiagent" || sender === "interactivemultiagent") continue;

                        // If sender is GOLEM_REPLY, the permanent agent name is GOLEM_REPLAY
                        let agentNameMatch = sender;
                        if (sender === 'golem_reply') agentNameMatch = 'golem_replay';

                        // Check if it's one of our permanent agents
                        const isPerm = PERMANENT_AGENTS.some(a => a.name === agentNameMatch || agentNameMatch.includes(a.name.split('_')[1]));

                        const existing = next.get(agentNameMatch);
                        next.set(agentNameMatch, {
                            name: agentNameMatch,
                            status: 'speaking',
                            lastMessage: content,
                            lastActive: Date.now(),
                            isPermanent: existing?.isPermanent || isPerm,
                            deskIndex: existing?.deskIndex
                        });
                    }

                    return next;
                });
            }
        };

        socket.on("log", handleLog);

        // Listen for local demo events
        const handleDemoLog = (e: any) => handleLog(e.detail);
        window.addEventListener("demo-log", handleDemoLog);

        // Cleanup idle agents loop
        const interval = setInterval(() => {
            setAgents(prev => {
                const next = new Map(prev);
                let changed = false;
                const now = Date.now();
                next.forEach((status, name) => {
                    // Turn to idle after 5 seconds of silence
                    if (status.status !== 'idle' && now - status.lastActive > 5000) {
                        next.set(name, { ...status, status: 'idle', lastMessage: '' });
                        changed = true;
                    }
                    // Remove if idle for too long (e.g. 60 seconds), but keep permanent agents
                    if (now - status.lastActive > 60000 && !status.isPermanent) {
                        next.delete(name);
                        changed = true;
                    }
                });
                return changed ? next : prev;
            });
        }, 1000);

        return () => {
            socket.off("log", handleLog);
            window.removeEventListener("demo-log", handleDemoLog);
            clearInterval(interval);
        };
    }, []);

    // Determine the current background image based on speaking status
    let activeBg = '/office-idle.png';
    const activeAgent = Array.from(agents.values()).find(a => a.status === 'speaking');

    if (activeAgent) {
        if (activeAgent.name === 'golem_memory') activeBg = '/office-memory.png';
        else if (activeAgent.name === 'golem_action') activeBg = '/office-action.png';
        else if (activeAgent.name === 'golem_replay' || activeAgent.name === 'golem_reply') activeBg = '/office-replay.png';
    }

    return (
        // Container height grows naturally up to 100%, matching an expected 16:9 widescreen or the cropped ratio.
        <div className="relative w-full shadow-inner bg-slate-900 rounded-lg overflow-hidden virtual-office" style={{ aspectRatio: '16 / 9' }}>
            {/* Office Background (Now dynamically changing to create animation) */}
            <div
                className="absolute inset-0 bg-cover bg-bottom opacity-100 transition-all duration-100 ease-in-out"
                style={{
                    backgroundImage: `url('${activeBg}')`,
                    imageRendering: 'pixelated'
                }}
            ></div>

            {/* Agents positioned absolutely based on the image desk locations for speech bubbles and nameplates */}
            <div className="absolute inset-0">
                {Array.from(agents.values()).map((agent, i) => (
                    <VirtualEmployee
                        key={agent.name}
                        data={agent}
                        posIndex={agent.deskIndex !== undefined ? agent.deskIndex : i % 3}
                    />
                ))}
            </div>
        </div>
    );
}

function VirtualEmployee({ data, posIndex }: { data: AgentStatus, posIndex: number }) {
    // Formatting display name
    let displayName = data.name;
    if (displayName === 'golem_memory') displayName = 'MEMORY';
    if (displayName === 'golem_action') displayName = 'ACTION';
    if (displayName === 'golem_replay' || displayName === 'golem_reply') displayName = 'REPLAY';

    // Map posIndex to absolute desk positions within the background.
    // The image has desks at roughly 17%, 50%, and 83% width.
    // The desks' horizontal surface is around 40-45% from the bottom of the image.
    // We adjust the bottom slightly higher since the character sprites are now baked into the background
    const positions = [
        { left: '17%', bottom: '48%' }, // Desk 1 (Memory)
        { left: '50%', bottom: '48%' }, // Desk 2 (Action)
        { left: '83%', bottom: '48%' }, // Desk 3 (Replay)
    ];

    const currentPos = positions[posIndex % positions.length];

    return (
        <div
            className="absolute flex flex-col items-center -translate-x-1/2"
            style={{ left: currentPos.left, bottom: currentPos.bottom }}
        >
            {/* Speech Bubble */}
            {data.status === 'speaking' && data.lastMessage && (
                <div className="absolute bottom-[20px] mb-2 bg-white text-black p-2 rounded max-w-[150px] sm:max-w-[200px] text-[10px] sm:text-xs z-30 pixel-font shadow-lg border-2 border-slate-800 break-words line-clamp-4 animate-in fade-in zoom-in duration-200">
                    {data.lastMessage}
                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-t-[8px] border-t-white border-r-[6px] border-r-transparent"></div>
                </div>
            )}

            {/* Nameplate - placed slightly lower since character is already in BG */}
            <div className="mt-0 bg-slate-900/90 px-3 py-1.5 rounded text-[10px] font-bold text-white pixel-font border-2 border-slate-600 shadow-xl z-20 whitespace-nowrap translate-y-12 sm:translate-y-16">
                {displayName}
            </div>
        </div>
    );
}

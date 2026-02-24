"use client";

import { useEffect, useState, useRef } from "react";
import { socket } from "@/lib/socket";
import { ChatBubble } from "@/components/ChatBubble";

interface ChatMessage {
    id: string;
    role: "user" | "brain" | "memory" | "action" | "system" | string;
    text: string;
    timestamp: number;
}

type TeamType = "default" | "tech" | "debate" | "creative" | "business";

interface OfficeItem {
    id: string;
    type: "character" | "prop";
    name: string;
    src: string;
    x: number; // percentage
    y: number; // percentage
    zIndex: number;
    team: TeamType | "all";
    width: number; // px or string class? let's stick to standard w/h or classes
    height: number;
    label?: string;
    labelColor?: string;
    labelBorder?: string;
}

type Message = ChatMessage; // Alias for clarity with the snippet

export default function OfficePage() {
    const [messageHistory, setMessageHistory] = useState<ChatMessage[]>([]);
    const [activeFilter, setActiveFilter] = useState<"all" | "user" | "brain" | "memory" | "action">("all");
    const [selectedTeam, setSelectedTeam] = useState<TeamType>('default');
    const [selectedFilter, setSelectedFilter] = useState<'all' | 'brain' | 'memory' | 'action'>('all');
    const [isLogExpanded, setIsLogExpanded] = useState(true); // Feature 15: Collapsible Log
    const [activeMessages, setActiveMessages] = useState<Record<string, Message | null>>({
        user: null, brain: null, memory: null, action: null,
        alex: null, bob: null, carol: null, devil: null,
        angel: null, judge: null, writer: null, designer: null,
        strategist: null, finance: null, marketing: null, operations: null
    });
    const [isTeamDropdownOpen, setIsTeamDropdownOpen] = useState(false);

    // --- EDITOR STATE ---
    const [isEditMode, setIsEditMode] = useState(false);
    const [placedItems, setPlacedItems] = useState<OfficeItem[]>([]);
    const [backpack, setBackpack] = useState<OfficeItem[]>([]);
    const [draggedItem, setDraggedItem] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const DEFAULT_LAYOUT: OfficeItem[] = [
        // Characters
        { id: 'user', type: 'character', name: 'user', src: '/characters/user.png', x: 8, y: 75, zIndex: 40, team: 'all', width: 192, height: 192 },
        { id: 'alex', type: 'character', name: 'alex', src: '/characters/alex.png', x: 28, y: 65, zIndex: 30, team: 'tech', width: 176, height: 176, label: 'ALEX (FE)', labelColor: 'text-cyan-400', labelBorder: 'border-cyan-800' },
        { id: 'bob', type: 'character', name: 'bob', src: '/characters/bob.png', x: 50, y: 75, zIndex: 20, team: 'tech', width: 128, height: 128, label: 'BOB (BE)', labelColor: 'text-orange-400', labelBorder: 'border-orange-800' },
        { id: 'carol', type: 'character', name: 'carol', src: '/characters/carol.png', x: 72, y: 75, zIndex: 20, team: 'tech', width: 128, height: 128, label: 'CAROL (PM)', labelColor: 'text-pink-400', labelBorder: 'border-pink-800' },
        { id: 'devil', type: 'character', name: 'devil', src: '/characters/devil.png', x: 35, y: 25, zIndex: 30, team: 'debate', width: 160, height: 160 },
        { id: 'angel', type: 'character', name: 'angel', src: '/characters/angel.png', x: 65, y: 25, zIndex: 30, team: 'debate', width: 160, height: 160 },
        { id: 'judge', type: 'character', name: 'judge', src: '/characters/judge.png', x: 50, y: 45, zIndex: 20, team: 'debate', width: 160, height: 160 },
        { id: 'writer', type: 'character', name: 'writer', src: '/characters/writer.png', x: 30, y: 35, zIndex: 30, team: 'creative', width: 144, height: 144 },
        { id: 'designer', type: 'character', name: 'designer', src: '/characters/designer.png', x: 50, y: 35, zIndex: 30, team: 'creative', width: 144, height: 144 },
        { id: 'strategist', type: 'character', name: 'strategist', src: '/characters/strategist.png', x: 70, y: 35, zIndex: 30, team: 'creative', width: 144, height: 144 },
        { id: 'finance', type: 'character', name: 'finance', src: '/characters/finance.png', x: 30, y: 38, zIndex: 30, team: 'business', width: 144, height: 144 },
        { id: 'marketing', type: 'character', name: 'marketing', src: '/characters/marketing.png', x: 50, y: 38, zIndex: 30, team: 'business', width: 144, height: 144 },
        { id: 'operations', type: 'character', name: 'operations', src: '/characters/operations.png', x: 70, y: 38, zIndex: 30, team: 'business', width: 144, height: 144 },

        // Props
        { id: 'bookshelf', type: 'prop', name: 'bookshelf', src: '/props/bookshelf.png', x: 85, y: 25, zIndex: 0, team: 'default', width: 96, height: 128 },
        { id: 'bean_bag', type: 'prop', name: 'bean_bag', src: '/props/bean_bag.png', x: 60, y: 60, zIndex: 20, team: 'default', width: 96, height: 96 },
        { id: 'meeting_group', type: 'prop', name: 'meeting_group', src: '/props/meeting_group.png', x: 55, y: 35, zIndex: 20, team: 'default', width: 400, height: 300 },

        { id: 'tech_rack_l', type: 'prop', name: 'server_rack', src: '/props/server_rack.png', x: 8, y: 42, zIndex: 10, team: 'tech', width: 96, height: 192 },
        { id: 'tech_rack_r', type: 'prop', name: 'server_rack', src: '/props/server_rack.png', x: 84, y: 34, zIndex: 10, team: 'tech', width: 96, height: 192 },
        { id: 'hologram', type: 'prop', name: 'hologram', src: '/office-assets/tech/hologram.png', x: 45, y: 10, zIndex: 20, team: 'tech', width: 112, height: 112 },
        { id: 'drone_dock', type: 'prop', name: 'drone_dock', src: '/office-assets/tech/drone_dock.png', x: 65, y: 27, zIndex: 20, team: 'tech', width: 150, height: 150 },
        { id: 'quantum_terminal', type: 'prop', name: 'quantum_terminal', src: '/office-assets/tech/quantum_terminal.png', x: 8, y: 40, zIndex: 20, team: 'tech', width: 104, height: 160 },
        { id: 'arcade', type: 'prop', name: 'arcade', src: '/office-assets/tech/arcade.png', x: 84, y: 58, zIndex: 20, team: 'tech', width: 128, height: 128 },
        { id: 'robot_pet', type: 'prop', name: 'robot_pet', src: '/office-assets/tech/robot_pet.png', x: 45, y: 40, zIndex: 30, team: 'tech', width: 112, height: 112 },

        { id: 'debate_rack', type: 'prop', name: 'server_rack', src: '/props/server_rack.png', x: 10, y: 10, zIndex: 0, team: 'debate', width: 128, height: 256 },
        { id: 'debate_monstera', type: 'prop', name: 'monstera', src: '/props/monstera.png', x: 80, y: 60, zIndex: 10, team: 'debate', width: 96, height: 96 },

        { id: 'creative_beanbag', type: 'prop', name: 'bean_bag', src: '/props/bean_bag.png', x: 10, y: 60, zIndex: 10, team: 'creative', width: 96, height: 96 },
        { id: 'creative_monstera', type: 'prop', name: 'monstera', src: '/props/monstera.png', x: 67, y: 15, zIndex: 10, team: 'creative', width: 128, height: 128 },

        { id: 'business_trophy', type: 'prop', name: 'trophy', src: '/props/trophy.png', x: 80, y: 10, zIndex: 10, team: 'business', width: 80, height: 80 },
        { id: 'business_meeting', type: 'prop', name: 'meeting_group', src: '/props/meeting_group.png', x: 55, y: 22, zIndex: 10, team: 'business', width: 192, height: 192 },

        // New Decorations
        { id: 'holographic_table', type: 'prop', name: 'holographic_table', src: '/office-assets/decoration/holographic_table.png', x: 50, y: 70, zIndex: 35, team: 'tech', width: 200, height: 200 },
        { id: 'supercomputer', type: 'prop', name: 'supercomputer', src: '/office-assets/decoration/supercomputer_cluster.png', x: 15, y: 40, zIndex: 5, team: 'tech', width: 180, height: 180 },
        { id: 'obsidian_table', type: 'prop', name: 'obsidian_table', src: '/office-assets/decoration/obsidian_round_table.png', x: 50, y: 65, zIndex: 15, team: 'debate', width: 180, height: 180 },
        { id: 'digital_bookshelf', type: 'prop', name: 'digital_bookshelf', src: '/office-assets/decoration/digital_bookshelf.png', x: 15, y: 55, zIndex: 5, team: 'debate', width: 140, height: 180 },
        { id: 'incubation_pod', type: 'prop', name: 'incubation_pod', src: '/office-assets/decoration/incubation_pod.png', x: 20, y: 65, zIndex: 15, team: 'creative', width: 150, height: 180 },
        { id: 'infinity_canvas', type: 'prop', name: 'infinity_canvas', src: '/office-assets/decoration/infinity_canvas.png', x: 80, y: 30, zIndex: 5, team: 'creative', width: 220, height: 150 },
        { id: 'stock_ticker', type: 'prop', name: 'stock_ticker', src: '/office-assets/decoration/stock_ticker.png', x: 50, y: 15, zIndex: 5, team: 'business', width: 300, height: 100 },
    ];

    const timersRef = useRef<Record<string, NodeJS.Timeout | null>>({});

    // Initialize and persistent storage
    useEffect(() => {
        const saved = localStorage.getItem('golem_office_layout');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                const savedPlaced: OfficeItem[] = data.placedItems || [];
                const savedBackpack: OfficeItem[] = data.backpack || [];

                // --- Sync Logic: Find new items in DEFAULT_LAYOUT that aren't in saved state ---
                const allSavedIds = new Set([
                    ...savedPlaced.map(i => i.id),
                    ...savedBackpack.map(i => i.id)
                ]);

                const newItems = DEFAULT_LAYOUT.filter(item => !allSavedIds.has(item.id));

                if (newItems.length > 0) {
                    // Update state and save back to storage to keep in sync
                    const updatedBackpack = [...savedBackpack, ...newItems];
                    setPlacedItems(savedPlaced);
                    setBackpack(updatedBackpack);
                    localStorage.setItem('golem_office_layout', JSON.stringify({
                        placedItems: savedPlaced,
                        backpack: updatedBackpack
                    }));
                } else {
                    setPlacedItems(savedPlaced);
                    setBackpack(savedBackpack);
                }
            } catch (e) {
                setPlacedItems(DEFAULT_LAYOUT);
                setBackpack([]);
            }
        } else {
            setPlacedItems(DEFAULT_LAYOUT);
            setBackpack([]);
        }
    }, []);

    // Handle outside clicks for the dropdown
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsTeamDropdownOpen(false);
            }
        };

        if (isTeamDropdownOpen) {
            document.addEventListener("mousedown", handleClickOutside);
        } else {
            document.removeEventListener("mousedown", handleClickOutside);
        }

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [isTeamDropdownOpen]);

    const saveLayout = (items: OfficeItem[], bp: OfficeItem[]) => {
        localStorage.setItem('golem_office_layout', JSON.stringify({ placedItems: items, backpack: bp }));
    };

    const handleReset = () => {
        if (confirm("Reset to default layout?")) {
            setPlacedItems(DEFAULT_LAYOUT);
            setBackpack([]);
            localStorage.removeItem('golem_office_layout');
        }
    };

    const handlePointerDown = (e: React.PointerEvent, id: string) => {
        if (!isEditMode) return;
        setDraggedItem(id);
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isEditMode || !draggedItem || !containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;

        setPlacedItems(prev => prev.map(item =>
            item.id === draggedItem ? { ...item, x, y } : item
        ));
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (draggedItem) {
            saveLayout(placedItems, backpack);
            setDraggedItem(null);
        }
    };

    const removeFromOffice = (id: string) => {
        const item = placedItems.find(i => i.id === id);
        if (item) {
            setPlacedItems(prev => prev.filter(i => i.id !== id));
            setBackpack(prev => [...prev, item]);
            saveLayout(placedItems.filter(i => i.id !== id), [...backpack, item]);
        }
    };

    const placeFromBackpack = (id: string) => {
        const item = backpack.find(i => i.id === id);
        if (item) {
            const newItem = { ...item, x: 50, y: 50 }; // Place in center
            setBackpack(prev => prev.filter(i => i.id !== id));
            setPlacedItems(prev => [...prev, newItem]);
            saveLayout([...placedItems, newItem], backpack.filter(i => i.id !== id));
        }
    };

    // Auto-scroll the log console to bottom when messageHistory changes
    const logConsoleRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (logConsoleRef.current) {
            logConsoleRef.current.scrollTop = logConsoleRef.current.scrollHeight;
        }
    }, [messageHistory]);

    useEffect(() => {
        const handleLog = (logData: any) => {
            if (!logData || (!logData.msg && !logData.raw)) return;
            const text = logData.cleanMsg || logData.msg || logData.raw;
            if (!text) return;

            let role: string = "system";
            const lowerText = text.toLowerCase();

            // MultiAgent detection: [MultiAgent] [Name]
            const multiAgentMatch = text.match(/\[MultiAgent\]\s*\[(.*?)\]/i);
            if (multiAgentMatch) {
                const name = multiAgentMatch[1].trim().toLowerCase();
                role = name;

                // Auto-switch team view
                if (['alex', 'bob', 'carol'].includes(name)) setSelectedTeam('tech');
                if (['devil', 'angel', 'judge'].includes(name)) setSelectedTeam('debate');
                if (['writer', 'designer', 'strategist'].includes(name)) setSelectedTeam('creative');
                if (['finance', 'marketing', 'operations'].includes(name)) setSelectedTeam('business');
            } else if (text.includes('[GOLEM_MEMORY]')) {
                role = "memory";
            } else if (text.includes('[GOLEM_ACTION]')) {
                role = "action";
            } else if (text.includes('🤖 [Golem] 說:') || text.includes('[GOLEM_REPLY]')) {
                role = "brain";
            } else if (text.includes('🗣️ [User] 說:') || lowerText.includes('[user]') || lowerText.includes('you:') || lowerText.includes('使用者:')) {
                role = "user";
            }

            if (role === 'system') return;

            // Strip the prefix tags
            let displayText = text;
            if (multiAgentMatch) {
                displayText = text.replace(/\[MultiAgent\]\s*\[.*?\]\s*/i, '').trim();
            } else {
                if (role === "memory") displayText = text.replace(/\[GOLEM_MEMORY\]\n?/i, '').trim();
                if (role === "action") displayText = text.replace(/\[GOLEM_ACTION\]\n?/i, '').trim();
                if (role === "brain") displayText = text.replace(/🤖 \[Golem\] 說:\s*/i, '').replace(/\[GOLEM_REPLY\]\n?/i, '').trim();
                if (role === "user") displayText = text.replace(/🗣️ \[User\] 說:\s*/i, '').trim();
            }

            const newMsg: ChatMessage = {
                id: Math.random().toString(36).substring(7),
                role,
                text: displayText,
                timestamp: Date.now()
            };

            setActiveMessages(prev => ({ ...prev, [role]: newMsg }));
            setMessageHistory(prev => [...prev, newMsg].slice(-100)); // Keep last 100

            // Reset hide timer for this specific role
            if (timersRef.current[role]) clearTimeout(timersRef.current[role]!);
            timersRef.current[role] = setTimeout(() => {
                setActiveMessages(prev => ({ ...prev, [role]: null }));
            }, role === "user" ? 5000 : 8000);
        };

        socket.on("log", handleLog);
        return () => {
            socket.off("log", handleLog);
            Object.values(timersRef.current).forEach(t => t && clearTimeout(t));
        };
    }, []);

    return (
        <div className="h-full w-full bg-[#1A1A1A] p-0 flex flex-col items-center justify-center font-[family-name:var(--font-press-start)] antialiased">

            {/* The Outer Monitor Wrapper (Game Console) */}
            <div className="relative w-full h-full bg-[#3A3C45] border-8 border-[#2B2D31] p-1 shadow-2xl overflow-hidden flex flex-col">

                {/* Top HUD Bar */}
                <div className="w-full bg-[#3B5B8C] border-4 border-[#25395A] rounded-sm p-2 mb-1 flex justify-between items-center text-white text-[10px] md:text-[10px] z-30">
                    <div className="flex items-center gap-2">
                        <span className="text-[#FFD700] drop-shadow-[2px_2px_0_rgba(0,0,0,1)] whitespace-nowrap hidden md:inline">GOLEM DEV STORY</span>

                        {/* Feature 12 & 13: Team Dropdown Selection */}
                        <div className="relative ml-2" ref={dropdownRef}>
                            <button
                                onClick={() => setIsTeamDropdownOpen(!isTeamDropdownOpen)}
                                className="px-3 py-1 border-2 border-black bg-[#1D2B44] text-[8px] font-bold text-white hover:bg-[#25395A] transition-all flex items-center gap-2"
                            >
                                👥 {selectedTeam === 'default' ? 'MAIN OFFICE' : selectedTeam.toUpperCase() + ' SESSION'} <span className="text-[6px]">▼</span>
                            </button>
                            {isTeamDropdownOpen && (
                                <div className="absolute top-full left-0 mt-1 w-48 bg-[#25395A] border-4 border-black flex flex-col z-[60] shadow-xl">
                                    <button onClick={() => { setSelectedTeam("default"); setIsTeamDropdownOpen(false); }} className="p-2 text-[8px] text-left hover:bg-white hover:text-black border-b-2 border-black/20">🏠 MAIN OFFICE</button>
                                    <button onClick={() => { setSelectedTeam("tech"); setIsTeamDropdownOpen(false); }} className="p-2 text-[8px] text-left hover:bg-cyan-500 hover:text-black border-b-2 border-black/20">💻 TECH TEAM</button>
                                    <button onClick={() => { setSelectedTeam("debate"); setIsTeamDropdownOpen(false); }} className="p-2 text-[8px] text-left hover:bg-red-500 hover:text-black border-b-2 border-black/20">⚖️ DEBATE TEAM</button>
                                    <button onClick={() => { setSelectedTeam("creative"); setIsTeamDropdownOpen(false); }} className="p-2 text-[8px] text-left hover:bg-pink-500 hover:text-black border-b-2 border-black/20">🎨 CREATIVE TEAM</button>
                                    <button onClick={() => { setSelectedTeam("business"); setIsTeamDropdownOpen(false); }} className="p-2 text-[8px] text-left hover:bg-yellow-500 hover:text-black">💰 BUSINESS TEAM</button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Filter Buttons (Simplified) */}
                    <div className="flex gap-1 md:gap-2 ml-auto">
                        <button onClick={() => setIsEditMode(!isEditMode)} className={`px-2 py-1 border-2 font-bold flex items-center gap-1 ${isEditMode ? "bg-red-600 text-white border-white" : "bg-[#25395A] text-[#FFD700] border-black"}`}>
                            {isEditMode ? "💾 SAVE" : "🔧 EDIT"}
                        </button>
                        {isEditMode && (
                            <button onClick={handleReset} className="px-2 py-1 border-2 bg-gray-600 text-white border-black font-bold text-[8px]">RESET</button>
                        )}
                        <button onClick={() => setActiveFilter("all")} className={`px-2 py-1 border-2 font-bold ${activeFilter === "all" ? "bg-white text-black border-gray-400" : "bg-[#25395A] text-white border-black"}`}>ALL</button>
                        <button onClick={() => setActiveFilter("brain")} className={`px-2 py-1 border-2 font-bold ${activeFilter === "brain" ? "bg-yellow-900/50 border-yellow-400 text-yellow-400" : "bg-[#25395A] border-black text-gray-400"}`}>🧠</button>
                        <button onClick={() => setActiveFilter("memory")} className={`px-2 py-1 border-2 font-bold ${activeFilter === "memory" ? "bg-purple-900/50 border-purple-400 text-purple-400" : "bg-[#25395A] border-black text-gray-400"}`}>💾</button>
                        <button onClick={() => setActiveFilter("action")} className={`px-2 py-1 border-2 font-bold ${activeFilter === "action" ? "bg-red-900/50 border-red-400 text-red-400" : "bg-[#25395A] border-black text-gray-400"}`}>⚙️</button>
                    </div>
                </div>

                {/* Inner Room Area - DYNAMIC BACKGROUND */}
                <div
                    ref={containerRef}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    className={`flex-1 relative bg-center bg-no-repeat border-4 border-[#25395A] rounded-sm overflow-hidden z-0 shadow-[inset_0_20px_50px_rgba(0,0,0,0.5)] transition-all duration-700`}
                    style={{
                        backgroundImage: selectedTeam === 'tech' ? "url('/pixel_bg_tech.png')" :
                            selectedTeam === 'debate' ? "url('/pixel_db_debate.png')" :
                                selectedTeam === 'creative' ? "url('/pixel_bg_creative.png')" :
                                    selectedTeam === 'business' ? "url('/pixel_bg_business.png')" :
                                        "url('/office_bg.png')",
                        backgroundColor: selectedTeam === 'tech' ? '#0a0a2a' :
                            selectedTeam === 'debate' ? '#2a0a0a' :
                                selectedTeam === 'creative' ? '#2a0a2a' :
                                    selectedTeam === 'business' ? '#1a1a1a' : '#3B5B8C',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        imageRendering: 'pixelated'
                    }}
                >
                    {/* --- DYNAMIC ITEMS --- */}
                    {placedItems.filter(item => item.team === 'all' || item.team === selectedTeam).map((item) => (
                        <div
                            key={item.id}
                            onPointerDown={(e) => handlePointerDown(e, item.id)}
                            className={`absolute flex flex-col items-center group transition-all duration-300 ${isEditMode ? 'cursor-move ring-2 ring-yellow-400/50 ring-offset-2 ring-offset-black/20 z-[100]' : ''}`}
                            style={{
                                left: `${item.x}%`,
                                top: `${item.y}%`,
                                transform: 'translate(-50%, -50%)',
                                zIndex: item.zIndex,
                                width: item.width,
                                height: item.height,
                            }}
                        >
                            {/* Removal control in edit mode */}
                            {isEditMode && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); removeFromOffice(item.id); }}
                                    className="absolute -top-4 -right-4 bg-red-600 text-white w-6 h-6 rounded-full border-2 border-white flex items-center justify-center text-[10px] z-[110] hover:bg-red-700"
                                >
                                    ×
                                </button>
                            )}

                            <img
                                src={item.src}
                                alt={item.name}
                                className={`w-full h-full object-contain ${item.name === 'user' ? 'drop-shadow-[-5px_5px_8px_rgba(0,0,0,0.6)]' : 'drop-shadow-[0px_10px_15px_rgba(0,0,0,0.5)]'} ${item.id === draggedItem ? 'opacity-50 scale-105' : ''} transition-transform`}
                            />

                            {item.label && (
                                <span className={`absolute bottom-[-10px] text-[7px] font-bold p-1 bg-black/80 rounded uppercase border whitespace-nowrap ${item.labelColor} ${item.labelBorder}`}>
                                    {item.label}
                                </span>
                            )}

                            {/* Chat Bubbles */}
                            {activeMessages[item.name] && (
                                <div className={`absolute z-50 ${item.name === 'user' ? 'top-[-115px] left-[60px] min-w-[200px]' : 'top-[-115px] w-[240px]'}`}>
                                    <ChatBubble role={item.name} text={activeMessages[item.name]!.text} />
                                </div>
                            )}

                            {/* Specialized Triad Bubbles for Default Mode Group */}
                            {item.id === 'meeting_group' && selectedTeam === 'default' && (
                                <>
                                    {activeMessages.action && <div className="absolute top-[10px] left-[-170px] min-w-[200px] z-50"><ChatBubble role="action" text={activeMessages.action.text} /></div>}
                                    {activeMessages.brain && <div className="absolute top-[-135px] left-[-50px] min-w-[240px] z-50"><ChatBubble role="brain" text={activeMessages.brain.text} /></div>}
                                    {activeMessages.memory && <div className="absolute top-[-65px] left-[320px] min-w-[200px] z-50"><ChatBubble role="memory" text={activeMessages.memory.text} /></div>}
                                </>
                            )}
                        </div>
                    ))}

                    {/* Editor Backpack Drawer */}
                    {isEditMode && (
                        <div className="absolute bottom-0 left-0 w-full bg-black/80 border-t-4 border-[#FFD700] p-3 z-[200] animate-in slide-in-from-bottom duration-300 h-28">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-[#FFD700] text-[8px] font-bold">🛠️ FURNITURE & CHARACTERS STORAGE</span>
                                <span className="text-gray-400 text-[6px]">({backpack.length} items)</span>
                            </div>
                            <div className="flex gap-4 overflow-x-auto pb-2 custom-scrollbar no-scrollbar scroll-smooth">
                                {backpack.length === 0 ? (
                                    <div className="text-gray-500 text-[8px] italic flex items-center h-12 w-full justify-center">Backpack is empty...</div>
                                ) : (
                                    backpack.map(item => (
                                        <div
                                            key={item.id}
                                            onClick={() => placeFromBackpack(item.id)}
                                            className="min-w-16 h-16 bg-[#1D2B44] border-2 border-[#25395A] hover:border-[#FFD700] cursor-pointer flex flex-col items-center justify-center relative p-1 transition-all active:scale-90 group"
                                        >
                                            <img src={item.src} className="w-10 h-10 object-contain" />
                                            <span className="text-[5px] text-white mt-1 text-center truncate w-full">{item.name}</span>
                                            <div className="absolute inset-0 bg-[#FFD700]/10 opacity-0 group-hover:opacity-100" />
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Bottom HUD bar & Filter */}
                <div className="w-full bg-[#3B5B8C] border-4 border-[#25395A] border-t-0 p-2 flex justify-between items-center text-[8px] md:text-[10px] text-white z-40">
                    <div className="flex items-center gap-4">
                        <span className="text-[#FFD700]">PROJECT: <span className="text-white ml-2">Multi-Agent System v2.0</span></span>
                        <span className="text-gray-400">|</span>
                        <div className="flex gap-2">
                            {(['all', 'brain', 'memory', 'action'] as const).map(f => (
                                <button
                                    key={f}
                                    onClick={() => setSelectedFilter(f)}
                                    className={`px-2 py-0.5 border-2 ${selectedFilter === f ? 'bg-yellow-600 border-yellow-400' : 'bg-[#25395A] border-[#3B5B8C] hover:bg-blue-900'} rounded-none uppercase transform active:scale-95 transition-all`}
                                >
                                    {f}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <span className="text-[#FFD700]">CURRENT SCENE: <span className="text-cyan-400 ml-2 uppercase">{selectedTeam} {selectedTeam !== 'default' ? 'STUDIO' : 'OFFICE'}</span></span>
                        <button
                            onClick={() => setIsLogExpanded(!isLogExpanded)}
                            className="bg-black/60 border-2 border-[#FFD700] px-2 py-0.5 text-[#FFD700] hover:bg-black transition-colors transform active:scale-95 flex items-center gap-1"
                        >
                            {isLogExpanded ? 'CLOSE LOG ▲' : 'OPEN LOG ▼'}
                        </button>
                    </div>
                </div>

                {/* Bottom Log Console (Feature 10: Hybrid UI + Feature 15: Collapsible) */}
                <div
                    ref={logConsoleRef}
                    className={`w-full bg-black/80 border-4 border-[#25395A] border-t-0 p-2 overflow-y-auto font-[family-name:Courier_New] text-[10px] text-green-400 custom-scrollbar flex flex-col gap-1 z-40 shrink-0 shadow-[inset_0_2px_10px_rgba(0,0,0,0.8)] transition-all duration-500 origin-bottom ${isLogExpanded ? 'h-32 opacity-100' : 'h-0 opacity-0 py-0 border-b-0'}`}
                >
                    {messageHistory.length === 0 ? (
                        <div className="text-gray-500 italic">Waiting for system logs...</div>
                    ) : (
                        messageHistory.filter(msg => {
                            if (selectedFilter === "all") return true;
                            const brainRoles = ['brain', 'alex', 'angel', 'writer', 'finance'];
                            const actionRoles = ['action', 'bob', 'devil', 'designer', 'marketing'];
                            const memoryRoles = ['memory', 'carol', 'strategist', 'operations'];
                            if (selectedFilter === 'brain') return brainRoles.includes(msg.role);
                            if (selectedFilter === 'action') return actionRoles.includes(msg.role);
                            if (selectedFilter === 'memory') return memoryRoles.includes(msg.role);
                            return msg.role === selectedFilter;
                        }).map((msg, idx) => (
                            <div key={msg.id} className="border-b border-green-900/40 pb-1 mb-1">
                                <span className={
                                    msg.role === 'user' ? 'text-cyan-400 font-bold' :
                                        msg.role === 'brain' ? 'text-yellow-400 font-bold' :
                                            msg.role === 'memory' ? 'text-purple-400 font-bold' :
                                                'text-red-400 font-bold'
                                }>[{msg.role.toUpperCase()}]</span>
                                <span className="text-gray-500 ml-1">{(new Date(msg.timestamp)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                                <div className="mt-1 text-white/90 whitespace-pre-wrap pl-2 border-l-2 border-gray-700 ml-1">{msg.text}</div>
                            </div>
                        ))
                    )}
                </div>

            </div>
        </div>
    );
}

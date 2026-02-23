"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Users, Database, Globe, Gamepad2 } from "lucide-react";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();

    const navItems = [
        { name: "戰術控制台", href: "/dashboard", icon: LayoutDashboard },
        { name: "Agent 會議室", href: "/dashboard/agents", icon: Users },
        { name: "虛擬辦公室", href: "/dashboard/office", icon: Gamepad2 },
    ];

    return (
        <div className="flex h-screen bg-gray-950 text-white overflow-hidden">
            {/* Sidebar */}
            <aside className="w-64 border-r border-gray-800 bg-gray-950 flex flex-col">
                <div className="p-6">
                    <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-cyan-400">
                        Golem v9.0
                    </h1>
                    <p className="text-xs text-gray-500 mt-1">MultiAgent War Room</p>
                </div>

                <nav className="flex-1 px-4 space-y-2">
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        // Handle root dashboard path strictly, others with startsWith
                        // Use exact matching to prevent overlapping highlights
                        // Since we have distinct routes (/dashboard, /dashboard/agents, /dashboard/memory)
                        const isActive = pathname === item.href;

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                    "flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors text-sm",
                                    isActive
                                        ? "bg-gray-800 text-white"
                                        : "text-gray-400 hover:bg-gray-800/50 hover:text-white"
                                )}
                            >
                                <Icon className="w-5 h-5" />
                                <span>{item.name}</span>
                            </Link>
                        );
                    })}
                </nav>

                <div className="p-4 border-t border-gray-800">
                    <div className="flex items-center space-x-2 text-xs text-gray-500">
                        <Globe className="w-4 h-4" />
                        <span>Web Gemini: Online</span>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-auto bg-gray-950">
                {children}
            </main>
        </div>
    );
}

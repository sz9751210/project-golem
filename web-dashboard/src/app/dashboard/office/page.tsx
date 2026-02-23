"use client";

import { VirtualOffice } from "@/components/VirtualOffice";
import { Gamepad2, Play } from "lucide-react";

export default function OfficePage() {
    // A quick debugger to emit fake socket events to see characters
    const runSimulator = () => {
        const fakePayloads = [
            `[[BEGIN:test]]\n[GOLEM_MEMORY]\n- 🧠 載入專案上下文...\n[GOLEM_ACTION]\nnull\n[GOLEM_REPLY]\n正在為您查詢相關資料。[[END:test]]`,
            `[[BEGIN:test2]]\n[GOLEM_MEMORY]\n- 🧠 確認檔案結構\n[GOLEM_ACTION]\n- 🚀 執行 npm install\n[GOLEM_REPLY]\n已開始執行套件安裝，請稍候。[[END:test2]]`
        ];

        let i = 0;
        const interval = setInterval(() => {
            if (i >= fakePayloads.length) {
                clearInterval(interval);
                return;
            }

            window.dispatchEvent(new CustomEvent('demo-log', {
                detail: {
                    type: 'agent',
                    msg: fakePayloads[i]
                }
            }));

            i++;
        }, 3000);
    };

    return (
        <div className="p-6 h-full flex flex-col space-y-4">
            <div className="flex justify-between items-center mb-2">
                <div className="flex items-center space-x-2">
                    <Gamepad2 className="w-6 h-6 text-purple-400" />
                    <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-400">
                        虛擬辦公室 (Virtual Office)
                    </h1>
                </div>
                <button
                    onClick={runSimulator}
                    className="flex items-center space-x-2 bg-gray-800 hover:bg-gray-700 px-3 py-2 rounded-lg text-sm text-gray-300 transition-colors border border-gray-700"
                >
                    <Play className="w-4 h-4 text-green-400" />
                    <span>Test Animation</span>
                </button>
            </div>

            <div className="flex-1 rounded-xl border-4 border-slate-700 overflow-hidden shadow-2xl relative shadow-purple-900/20">
                <VirtualOffice />
            </div>
        </div>
    );
}

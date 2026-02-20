// ============================================================
// 🗄️ AppState (集中式狀態管理 - 取代 global.*)
// ============================================================
class AppState {
    constructor() {
        /** @type {{ path: string, target: string, name: string, description: string } | null} */
        this.pendingPatch = null;

        /** @type {Map<string, function>} */
        this.multiAgentListeners = new Map();

        /** @type {Map<string, object>} */
        this.pausedConversations = new Map();
    }
}

// Singleton — 所有模組共用同一實例
module.exports = new AppState();

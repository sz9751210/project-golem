/**
 * 🦞 Project Golem v9.0.1 (Integrity Core Edition)
 * -------------------------------------------------------------------------
 * 架構：[Universal Context] -> [Conversation Queue] -> [NeuroShunter] <==> [Web Gemini]
 * 
 * 🎯 v9.0.1 核心升級：
 * 1. ⚡ 非同步部署 (Async Deployment): 自我升級不再卡住 Event Loop。
 * 2. 🛡️ 全域錯誤防護 (Global Error Guard): 防止未捕獲的 Promise 導致崩潰。
 * 3. 🧠 深度整合 Introspection: 啟動時建立自我結構快取。
 * 
 * [保留功能]
 * - v9.0 所有功能 (InteractiveMultiAgent, WebSkillEngine)
 * - KeyChain v2 智慧冷卻機制
 * - Flood Guard 啟動時間過濾
 * - DOM Doctor 自動修復
 */
require('dotenv').config();

// ==========================================
// 🛡️ 全域錯誤防護 (Global Safety Nets)
// ==========================================
process.on('uncaughtException', (err) => {
    console.error('🔥 [CRITICAL] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ [WARNING] Unhandled Rejection at:', promise, 'reason:', reason);
});

// ==========================================
// 📟 儀表板外掛 (Dashboard Switch)
// ==========================================
if (process.argv.includes('dashboard')) {
    try {
        require('./dashboard');
        console.log("✅ 戰術控制台已啟動 (繁體中文版)");
    } catch (e) {
        console.error("❌ 無法載入 Dashboard:", e.message);
    }
} else {
    console.log("ℹ️  以標準模式啟動 (無 Dashboard)。若需介面請輸入 'npm start dashboard'");
}

// ==========================================
// 📦 模組載入
// ==========================================
const TelegramBot = require('node-telegram-bot-api');
const { Client, GatewayIntentBits, Partials } = require('discord.js');

const { CONFIG } = require('./src/config');
const GolemBrain = require('./src/core/GolemBrain');
const TaskController = require('./src/core/TaskController');
const AutonomyManager = require('./src/managers/AutonomyManager');
const ConversationManager = require('./src/core/ConversationManager');
const { registerListeners } = require('./src/core/EventHandlers');
const introspection = require('./src/services/Introspection');

// ==========================================
// 🔌 初始化核心元件
// ==========================================
const tgBot = CONFIG.TG_TOKEN ? new TelegramBot(CONFIG.TG_TOKEN, { polling: true }) : null;
const dcClient = CONFIG.DC_TOKEN ? new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel]
}) : null;

const brain = new GolemBrain();
const controller = new TaskController();
const autonomy = new AutonomyManager(brain, controller, brain.memoryDriver);
const convoManager = new ConversationManager(brain, require('./src/core/NeuroShunter'), controller);

autonomy.setIntegrations(tgBot, dcClient, convoManager);

// ⏱️ Flood Guard - 啟動時間戳記
const BOOT_TIME = Date.now();
console.log(`🛡️ [Flood Guard] 系統啟動時間: ${new Date(BOOT_TIME).toLocaleString('zh-TW', { hour12: false })}`);

// ==========================================
// 📨 註冊事件監聽器 (依賴注入)
// ==========================================
const deps = {
    brain,
    controller,
    autonomy,
    convoManager,
    pendingTasks: controller.pendingTasks,
    BOOT_TIME
};

registerListeners(tgBot, dcClient, deps);

// ==========================================
// 🎮 啟動主迴圈
// ==========================================
(async () => {
    if (process.env.GOLEM_TEST_MODE === 'true') { console.log('🚧 GOLEM_TEST_MODE active.'); return; }
    await brain.init();

    // 啟動時預掃描專案結構
    console.log('🧠 [Introspection] Pre-scanning project structure...');
    await introspection.getStructure();

    autonomy.start();
    console.log('✅ Golem v9.0.1 (Integrity Core Edition) is Online.');
    if (dcClient) dcClient.login(CONFIG.DC_TOKEN);
})();

module.exports = { brain, controller, autonomy, convoManager };

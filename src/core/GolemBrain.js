// ============================================================
// 🧠 Golem Brain (Web Gemini) - Clean Architecture Facade
// ============================================================
const path = require('path');
const { CONFIG, cleanEnv } = require('../config');
const DOMDoctor = require('../services/DOMDoctor');
const BrowserMemoryDriver = require('../memory/BrowserMemoryDriver');
const SystemQmdDriver = require('../memory/SystemQmdDriver');
const SystemNativeDriver = require('../memory/SystemNativeDriver');

const BrowserLauncher = require('./BrowserLauncher');
const ProtocolFormatter = require('../services/ProtocolFormatter');
const ChatLogManager = require('../managers/ChatLogManager');
const EngineFactory = require('./engines/EngineFactory');

// ============================================================
// 🧠 Golem Brain (Web Gemini) - Dual-Engine + Titan Protocol
// ============================================================
class GolemBrain {
    constructor(options = {}) {
        // ── 實體識別與設定 ──
        this.golemId = options.golemId || 'default';
        this.userDataDir = options.userDataDir || path.resolve(CONFIG.USER_DATA_DIR || './golem_memory');

        // ── AI 引擎 (策略模式) ──
        const aiModel = options.aiModel || CONFIG.AI_MODEL || 'gemini';
        this.engine = EngineFactory.create(aiModel);
        console.log(`⚙️ [System] AI Engine: ${this.engine.getName().toUpperCase()} (Golem: ${this.golemId})`);

        // ── 瀏覽器狀態 ──
        this.browser = null;
        this.page = null;
        this.memoryPage = null;
        this.cdpSession = null;

        // ── DOM 修復服務 ──
        this.doctor = new DOMDoctor();
        this.selectors = this.doctor.loadSelectors();

        // ── 記憶引擎 ──
        const mode = cleanEnv(process.env.GOLEM_MEMORY_MODE || 'browser').toLowerCase();
        console.log(`⚙️ [System] 記憶引擎模式: ${mode.toUpperCase()} (Golem: ${this.golemId})`);
        if (mode === 'qmd') this.memoryDriver = new SystemQmdDriver();
        else if (mode === 'native' || mode === 'system') this.memoryDriver = new SystemNativeDriver();
        else this.memoryDriver = new BrowserMemoryDriver(this);

        // ── 對話日誌 ──
        this.chatLogManager = new ChatLogManager({
            golemId: this.golemId,
            logDir: options.logDir || path.join(process.cwd(), 'logs'),
            isSingleMode: options.isSingleMode || false
        });
    }

    // ─── Public API (向後相容) ─────────────────────────────

    /**
     * 初始化瀏覽器、記憶引擎、注入系統 Prompt
     * @param {boolean} [forceReload=false] - 是否強制重新載入
     */
    async init(forceReload = false) {
        if (this.browser && !forceReload) return;

        let isNewSession = false;

        // 1. 啟動 / 連線瀏覽器
        if (!this.browser) {
            console.log(`📂 [System] Browser User Data Dir: ${this.userDataDir} (Golem: ${this.golemId})`);

            this.browser = await BrowserLauncher.launch({
                userDataDir: this.userDataDir,
                headless: process.env.PUPPETEER_HEADLESS,
            });
        }

        // 2. 取得或建立頁面
        if (!this.page) {
            const pages = await this.browser.pages();
            this.page = pages.length > 0 ? pages[0] : await this.browser.newPage();
            await this.page.goto(this.engine.getAppUrl(), { waitUntil: 'networkidle2' });
            isNewSession = true;
        }

        // 3. 初始化記憶引擎 (含降級策略)
        await this._initMemoryDriver();

        // 4. Dashboard 整合 (可選)
        this._linkDashboard();

        // 5. 新會話: 注入系統 Prompt
        if (forceReload || isNewSession) {
            await this._injectSystemPrompt(forceReload);
        }
    }

    /**
     * 建立 Chrome DevTools Protocol 連線
     */
    async setupCDP() {
        if (this.cdpSession) return;
        try {
            this.cdpSession = await this.page.target().createCDPSession();
            await this.cdpSession.send('Network.enable');
            console.log("🔌 [CDP] 網路神經連結已建立 (Neuro-Link Active)");
        } catch (e) {
            console.error("❌ [CDP] 連線失敗:", e.message);
        }
    }

    // ✨ 動態模型切換 (委派給引擎)
    async switchModel(targetMode) {
        if (!this.page) throw new Error("大腦尚未啟動。");
        return this.engine.switchModel(this.page, targetMode);
    }

    /**
     * 發送訊息到 Gemini 並等待結構化回應
     * @param {string} text - 訊息內容
     * @param {boolean} [isSystem=false] - 是否為系統訊息
     * @returns {Promise<string>} 清理後的 AI 回應
     */
    async sendMessage(text, isSystem = false) {
        if (!this.browser) await this.init();
        try { await this.page.bringToFront(); } catch (e) { }
        await this.setupCDP();

        const reqId = ProtocolFormatter.generateReqId();
        const startTag = ProtocolFormatter.buildStartTag(reqId);
        const endTag = ProtocolFormatter.buildEndTag(reqId);
        const payload = ProtocolFormatter.buildEnvelope(text, reqId);

        console.log(`📡 [Brain] 發送訊號: ${reqId} (引擎: ${this.engine.getName()})`);

        return this.engine.sendMessage(
            this.page, this.doctor, payload, this.selectors, isSystem, startTag, endTag
        );
    }

    /**
     * 從記憶中回憶相關內容
     * @param {string} queryText - 查詢文字
     * @returns {Promise<Array>}
     */
    async recall(queryText) {
        if (!queryText) return [];
        try { return await this.memoryDriver.recall(queryText); } catch (e) { return []; }
    }

    /**
     * 將內容存入長期記憶
     * @param {string} text - 要記憶的文字
     * @param {Object} [metadata={}] - 附加 metadata
     */
    async memorize(text, metadata = {}) {
        try { await this.memoryDriver.memorize(text, metadata); } catch (e) { }
    }

    /**
     * 附加對話日誌
     * @param {Object} entry - 日誌紀錄
     */
    _appendChatLog(entry) {
        this.chatLogManager.append(entry);
    }

    // ─── Private Methods ─────────────────────────────────────

    /** 初始化記憶引擎，失敗時降級 */
    async _initMemoryDriver() {
        try {
            await this.memoryDriver.init();
        } catch (e) {
            console.warn("🔄 [System] 記憶引擎降級為 Browser/Native...");
            this.memoryDriver = new BrowserMemoryDriver(this);
            await this.memoryDriver.init();
        }
    }

    /** 連結 Dashboard (若以 dashboard 模式啟動) */
    _linkDashboard() {
        if (!process.argv.includes('dashboard')) return;
        try {
            const dashboard = require('../../dashboard');
            dashboard.setContext(this, this.memoryDriver);
        } catch (e) {
            try {
                const dashboard = require('../../dashboard.js');
                dashboard.setContext(this, this.memoryDriver);
            } catch (err) {
                console.error("Failed to link dashboard context:", err);
            }
        }
    }

    /**
     * 組裝並發送系統 Prompt
     * @param {boolean} [forceRefresh=false]
     */
    async _injectSystemPrompt(forceRefresh = false) {
        let { systemPrompt, skillMemoryText } = await ProtocolFormatter.buildSystemPrompt(forceRefresh);

        if (skillMemoryText) {
            await this.memorize(skillMemoryText, { type: 'system_skills', source: 'boot_init' });
            console.log(`🧠 [Memory] 已成功將技能載入長期記憶中！`);
        }

        // 🚀 [第一階段] 發送底層系統協議 (不含歷史摘要)
        const compressedPrompt = ProtocolFormatter.compress(systemPrompt);
        await this.sendMessage(compressedPrompt, false); // ⚡ 改為 false：等待完整回應
        console.log(`📡 [Brain] 階段一：底層協議注入完成。`);

        // 🧠 [第二階段] 注入完整歷史日誌摘要 (獨立訊息以優化記憶壓縮)
        if (this.chatLogManager) {
            const fs = require('fs');
            const logDir = this.chatLogManager.logDir;

            try {
                // 掃描符合 YYYYMMDD.log 格式的檔案 (每日摘要)
                const files = fs.readdirSync(logDir)
                    .filter(f => f.length === 12 && f.endsWith('.log'))
                    .sort();

                if (files.length > 0) {
                    let historicalMemory = "";
                    files.forEach(file => {
                        try {
                            const dateStr = file.replace('.log', '');
                            const logs = JSON.parse(fs.readFileSync(path.join(logDir, file), 'utf8'));
                            if (Array.isArray(logs)) {
                                logs.forEach((entry, idx) => {
                                    // 🛡️ [防呆] 只注入有內容的摘要，避免空字串污染 Prompt
                                    if (entry.content && entry.content.trim()) {
                                        historicalMemory += `\n--- [${dateStr} 摘要 #${idx + 1}] ---\n${entry.content}\n`;
                                    }
                                });
                            }
                        } catch (e) { }
                    });

                    if (historicalMemory) {
                        const memoryPulse = `【指令：載入長期記憶與背景壓縮】\n以下是你過去所有對話的彙總精華（依時間排序）。請完整閱讀並內化這些背景，將其視為你目前已知的所有先驗知識與決策紀錄：\n${historicalMemory}`;
                        await this.sendMessage(memoryPulse, false); // ⚡ 改為 false：確保記憶載入完成
                        console.log(`🧠 [Brain] 階段二：已注入 ${files.length} 個歷史日誌檔案作為獨立回憶。`);
                    }
                }
            } catch (e) {
                console.warn(`⚠️ [Brain] 歷史記憶掃描或注入失敗: ${e.message}`);
            }
        }
    }
}

module.exports = GolemBrain;

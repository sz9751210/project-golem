// ============================================================
// 🧠 Golem Brain (Web Gemini) - Clean Architecture Facade
// ============================================================
const path = require('path');
const fs = require('fs'); // ✨ 修正：補上 fs 取代部分流程中的 fsSync
const { CONFIG, cleanEnv } = require('../config');
const DOMDoctor = require('../services/DOMDoctor');
const BrowserMemoryDriver = require('../memory/BrowserMemoryDriver');
const SystemQmdDriver = require('../memory/SystemQmdDriver');
const SystemNativeDriver = require('../memory/SystemNativeDriver');

const BrowserLauncher = require('./BrowserLauncher');
const ProtocolFormatter = require('../services/ProtocolFormatter');
const PageInteractor = require('./PageInteractor');
const ChatLogManager = require('../managers/ChatLogManager');
const { URLS } = require('./constants');

// ============================================================
// 🧠 Golem Brain (Web Gemini) - Dual-Engine + Titan Protocol
// ============================================================
class GolemBrain {
    constructor() {
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
        console.log(`⚙️ [System] 記憶引擎模式: ${mode.toUpperCase()}`);
        if (mode === 'qmd') this.memoryDriver = new SystemQmdDriver();
        else if (mode === 'native' || mode === 'system') this.memoryDriver = new SystemNativeDriver();
        else this.memoryDriver = new BrowserMemoryDriver(this);

        // ── 對話日誌 ──
        this.chatLogManager = new ChatLogManager();
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
            const userDataDir = path.resolve(CONFIG.USER_DATA_DIR);
            console.log(`📂 [System] Browser User Data Dir: ${userDataDir}`);

            this.browser = await BrowserLauncher.launch({
                userDataDir,
                headless: process.env.PUPPETEER_HEADLESS,
            });
        }

        // 2. 取得或建立頁面
        if (!this.page) {
            const pages = await this.browser.pages();
            this.page = pages.length > 0 ? pages[0] : await this.browser.newPage();
            await this.page.goto(URLS.GEMINI_APP, { waitUntil: 'networkidle2' });
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

        // ✨ 強化：設定下載目錄
        const downloadPath = path.resolve(process.cwd(), 'downloads');
        if (!fs.existsSync(downloadPath)) {
            fs.mkdirSync(downloadPath, { recursive: true });
        }
        try {
            const client = await this.page.target().createCDPSession();
            await client.send('Page.setDownloadBehavior', {
                behavior: 'allow',
                downloadPath: downloadPath,
            });
            console.log(`📥 [Brain] 下載目錄已設定: ${downloadPath}`);
        } catch (e) {
            console.error("❌ [Brain] 設定下載目錄失敗:", e.message);
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

    // ✨ [新增] 動態視覺腳本：針對新版 UI 切換模型
    async switchModel(targetMode) {
        if (!this.page) throw new Error("大腦尚未啟動。");
        try {
            const result = await this.page.evaluate(async (mode) => {
                const delay = (ms) => new Promise(r => setTimeout(r, ms));
                const modeKeywords = {
                    'fast': ['fast', '快捷'],
                    'thinking': ['thinking', '思考型', '思考'],
                    'pro': ['pro']
                };
                const targetKeywords = modeKeywords[mode] || [mode];
                const allKnownKeywords = [...modeKeywords.fast, ...modeKeywords.thinking, ...modeKeywords.pro];
                const buttons = Array.from(document.querySelectorAll('div[role="button"], button'));
                let pickerBtn = null;

                for (const btn of buttons) {
                    const txt = (btn.innerText || "").toLowerCase().trim();
                    if (allKnownKeywords.some(k => txt.includes(k.toLowerCase())) && btn.offsetHeight > 10 && btn.offsetHeight < 60) {
                        const rect = btn.getBoundingClientRect();
                        if (rect.top > window.innerHeight / 2) {
                            pickerBtn = btn;
                            break;
                        }
                    }
                }

                if (!pickerBtn) return "⚠️ 找不到畫面底部的模型切換按鈕。";

                const isDisabled = pickerBtn.disabled || pickerBtn.getAttribute('aria-disabled') === 'true';
                if (isDisabled) return "⚠️ 模型切換按鈕目前呈現灰色不可點擊狀態。";

                pickerBtn.click();
                await delay(1000);

                const items = Array.from(document.querySelectorAll('*'));
                let targetElement = null;
                let bestMatch = null;

                for (const el of items) {
                    if (pickerBtn === el || pickerBtn.contains(el)) continue;
                    const rect = el.getBoundingClientRect();
                    if (rect.width === 0 || rect.height === 0) continue;
                    const txt = (el.innerText || "").trim().toLowerCase();
                    if (txt.length === 0 || txt.length > 50) continue;
                    if (targetKeywords.some(keyword => txt.includes(keyword.toLowerCase()))) {
                        const role = el.getAttribute('role');
                        if (role === 'menuitem' || role === 'menuitemradio' || role === 'option') {
                            targetElement = el;
                            break;
                        }
                        bestMatch = el;
                    }
                }

                if (!targetElement) targetElement = bestMatch;
                if (!targetElement) {
                    document.body.click();
                    return `⚠️ 選單已展開，但找不到對應「${mode}」的選項。`;
                }

                targetElement.click();
                await delay(800);
                return `✅ 成功為您點擊並切換至 [${mode}] 模式！`;
            }, targetMode.toLowerCase());

            return result;
        } catch (error) {
            return `❌ 視覺腳本執行失敗: ${error.message}`;
        }
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

        console.log(`📡 [Brain] 發送訊號: ${reqId}`);

        const interactor = new PageInteractor(this.page, this.doctor);

        try {
            return await interactor.interact(
                payload, this.selectors, isSystem, startTag, endTag
            );
        } catch (e) {
            if (e.message && e.message.startsWith('SELECTOR_HEALED:')) {
                const [, type, newSelector] = e.message.split(':');
                this.selectors[type] = newSelector;
                this.doctor.saveSelectors(this.selectors);
                return interactor.interact(
                    payload, this.selectors, isSystem, startTag, endTag, 1
                );
            }
            throw e;
        }
    }

    /**
     * 發送檔案到 Gemini (v9.0.6 強化版)
     * @param {string} filePath - 本地檔案路徑
     * @param {string} [text] - 隨附文字
     * @returns {Promise<string>} AI 回應
     */
    async sendFile(filePath, text = "") {
        if (!this.browser) await this.init();
        try { await this.page.bringToFront(); } catch (e) { }

        // 前置驗證
        if (!fs.existsSync(filePath)) {
            throw new Error(`檔案不存在: ${filePath}`);
        }
        const stats = fs.statSync(filePath);
        const sizeKB = (stats.size / 1024).toFixed(1);
        console.log(`📄 [Brain] 準備上傳檔案: ${path.basename(filePath)} (${sizeKB} KB)`);

        const interactor = new PageInteractor(this.page, this.doctor);
        const uploadSuccess = await interactor.uploadFile(filePath);

        if (!uploadSuccess) {
            throw new Error("檔案上傳失敗。");
        }

        return this.sendMessage(text || "請分析此檔案。");
    }

    /**
     * 等待並獲取最新下載的檔案 (v9.0.6 強化版)
     * @param {Object} [options] - 選項
     * @param {number} [options.timeout=30000] - 等待超時（毫秒）
     * @param {function} [options.onProgress] - 進度回報 callback
     * @param {boolean} [options.tryClickDownload=true] - 是否主動搜尋下載按鈕
     * @returns {Promise<string|null>} 檔案路徑
     */
    async waitForDownload({ timeout = 30000, onProgress = null, tryClickDownload = true } = {}) {
        const downloadPath = path.resolve(process.cwd(), 'downloads');
        const interactor = new PageInteractor(this.page, this.doctor);

        // 策略 1: 嘗試主動點擊頁面上的下載按鈕 (Canvas / Code Block 場景)
        if (tryClickDownload) {
            const triggered = await interactor.triggerDownloadButton();
            if (triggered && onProgress) {
                onProgress('🖱️ 已點擊下載按鈕，等待檔案...');
            }
        }

        // 策略 2: 監控 downloads 目錄
        return interactor.waitForDownload(downloadPath, timeout, onProgress);
    }

    /**
     * 從記憶中回憶相關內容
     */
    async recall(queryText) {
        if (!queryText) return [];
        try { return await this.memoryDriver.recall(queryText); } catch (e) { return []; }
    }

    async memorize(text, metadata = {}) {
        try { await this.memoryDriver.memorize(text, metadata); } catch (e) { }
    }

    _appendChatLog(entry) {
        this.chatLogManager.append(entry);
    }

    // ─── Private Methods ─────────────────────────────────────

    async _initMemoryDriver() {
        try {
            await this.memoryDriver.init();
        } catch (e) {
            console.warn("🔄 [System] 記憶引擎降級...");
            this.memoryDriver = new BrowserMemoryDriver(this);
            await this.memoryDriver.init();
        }
    }

    _linkDashboard() {
        if (!process.argv.includes('dashboard')) return;
        try {
            const dashboard = require('../../dashboard');
            dashboard.setContext(this, this.memoryDriver);
        } catch (e) {
            try {
                const dashboard = require('../../dashboard.js');
                dashboard.setContext(this, this.memoryDriver);
            } catch (err) { }
        }
    }

    /**
     * 組裝並發送系統 Prompt
     * @param {boolean} [forceRefresh=false]
     */
    async _injectSystemPrompt(forceRefresh = false) {
        const { systemPrompt, skillMemoryText } = await ProtocolFormatter.buildSystemPrompt(forceRefresh);

        if (skillMemoryText) {
            await this.memorize(skillMemoryText, { type: 'system_skills', source: 'boot_init' });
        }

        const compressedPrompt = ProtocolFormatter.compress(systemPrompt);
        await this.sendMessage(compressedPrompt, true);
    }
}

module.exports = GolemBrain;

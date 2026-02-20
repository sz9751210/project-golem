const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { CONFIG, cleanEnv } = require('../config');
const { getSystemFingerprint } = require('../utils/system');
const DOMDoctor = require('../services/DOMDoctor');
const BrowserMemoryDriver = require('../memory/BrowserMemoryDriver');
const SystemQmdDriver = require('../memory/SystemQmdDriver');
const SystemNativeDriver = require('../memory/SystemNativeDriver');
const skills = require('../skills');
const skillManager = require('../skills/lib/skill-manager');
const {
    TIMEOUTS,
    LIMITS,
    LOCK_FILES,
    BROWSER_ARGS,
    buildSuperProtocol,
} = require('./constants');

puppeteer.use(StealthPlugin());

// ============================================================
// 🧠 Golem Brain (Web Gemini) - Dual-Engine + Titan Protocol
// ============================================================
class GolemBrain {
    constructor() {
        this.browser = null;
        this.page = null;
        this.memoryPage = null;
        this.doctor = new DOMDoctor();
        this.selectors = this.doctor.loadSelectors();
        this.cdpSession = null;

        // --- Memory Engine Selection ---
        const mode = cleanEnv(process.env.GOLEM_MEMORY_MODE || 'browser').toLowerCase();
        console.log(`⚙️ [System] 記憶引擎模式: ${mode.toUpperCase()}`);
        if (mode === 'qmd') this.memoryDriver = new SystemQmdDriver();
        else if (mode === 'native' || mode === 'system') this.memoryDriver = new SystemNativeDriver();
        else this.memoryDriver = new BrowserMemoryDriver(this);

        // --- Chat Log Path ---
        this.chatLogFile = path.join(process.cwd(), 'logs', 'agent_chat.jsonl');
        this._ensureLogDirectory();
        this._cleanupLogs(LIMITS.LOG_MAX_AGE_MS);
    }

    // ----------------------------------------------------------
    // 📁 Private: Log Management
    // ----------------------------------------------------------

    /** Ensure the log directory exists (sync — only in constructor). */
    _ensureLogDirectory() {
        const dir = path.dirname(this.chatLogFile);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    /**
     * Remove chat log entries older than `maxAgeMs`.
     * @param {number} maxAgeMs — retention window in milliseconds
     */
    _cleanupLogs(maxAgeMs) {
        if (!fs.existsSync(this.chatLogFile)) return;
        try {
            const now = Date.now();
            const content = fs.readFileSync(this.chatLogFile, 'utf8');
            const lines = content.trim().split('\n');
            const keptLines = lines.filter(line => {
                try {
                    const entry = JSON.parse(line);
                    return (now - entry.timestamp) < maxAgeMs;
                } catch { return false; }
            });

            if (keptLines.length < lines.length) {
                fs.writeFileSync(this.chatLogFile, keptLines.join('\n') + '\n');
                console.log(`🧹 [System] 已清理過期對話日誌 (${lines.length - keptLines.length} 條)`);
            }
        } catch (e) {
            console.error('Cleanup logs failed:', e);
        }
    }

    /**
     * Append a structured entry to the chat log (non-blocking).
     * @param {object} entry
     */
    _appendChatLog(entry) {
        fs.appendFile(this.chatLogFile, JSON.stringify(entry) + '\n', (err) => {
            if (err) console.error('Failed to write chat log:', err);
        });
    }

    // ----------------------------------------------------------
    // 🚀 Initialization (decomposed from the original 185-line init)
    // ----------------------------------------------------------

    /**
     * Master initializer. Idempotent unless `forceReload` is true.
     * @param {boolean} forceReload — force re-injection of system prompt
     */
    async init(forceReload = false) {
        if (this.browser && !forceReload) return;

        let isNewSession = false;

        if (!this.browser) {
            const isDocker = fs.existsSync('/.dockerenv');
            const remoteDebugPort = process.env.PUPPETEER_REMOTE_DEBUGGING_PORT;

            this.browser = (isDocker && remoteDebugPort)
                ? await this._connectRemoteChrome(remoteDebugPort)
                : await this._launchLocalBrowser();
        }

        if (!this.page) {
            const pages = await this.browser.pages();
            this.page = pages.length > 0 ? pages[0] : await this.browser.newPage();
            await this.page.goto('https://gemini.google.com/app', { waitUntil: 'networkidle2' });
            isNewSession = true;
        }

        await this._initMemoryDriver();
        this._linkDashboard();

        if (forceReload || isNewSession) {
            await this._injectSystemPrompt();
        }
    }

    /**
     * Connect to a remote Chrome instance via DevTools Protocol (Docker).
     * @param {string} remoteDebugPort
     * @returns {Promise<import('puppeteer').Browser>}
     */
    async _connectRemoteChrome(remoteDebugPort) {
        const host = 'host.docker.internal';
        const browserURL = `http://${host}:${remoteDebugPort}`;
        console.log(`🔌 [System] Connecting to Remote Chrome at ${browserURL}...`);

        try {
            const http = require('http');
            const wsEndpoint = await new Promise((resolve, reject) => {
                const req = http.get(
                    `http://${host}:${remoteDebugPort}/json/version`,
                    { headers: { 'Host': 'localhost' } },
                    (res) => {
                        let data = '';
                        res.on('data', chunk => data += chunk);
                        res.on('end', () => {
                            try {
                                const json = JSON.parse(data);
                                // Rebuild wsURL — Chrome may omit port in ws://localhost/devtools/...
                                const rawWsUrl = new URL(json.webSocketDebuggerUrl);
                                rawWsUrl.hostname = host;
                                rawWsUrl.port = remoteDebugPort;
                                resolve(rawWsUrl.toString());
                            } catch (e) {
                                reject(new Error(`Failed to parse /json/version: ${data}`));
                            }
                        });
                    }
                );
                req.on('error', reject);
                req.setTimeout(TIMEOUTS.BROWSER_WS_TIMEOUT, () => {
                    req.destroy();
                    reject(new Error('Timeout fetching /json/version'));
                });
            });

            console.log(`🔗 [System] WebSocket Endpoint: ${wsEndpoint}`);
            const browser = await puppeteer.connect({
                browserWSEndpoint: wsEndpoint,
                defaultViewport: null,
            });
            console.log('✅ [System] Connected to Remote Chrome!');
            return browser;
        } catch (e) {
            console.error(`❌ [System] Failed to connect to Remote Chrome: ${e.message}`);
            console.error("   Make sure you ran './scripts/start-host-chrome.sh' on the host and 'host.docker.internal' is reachable.");
            throw e;
        }
    }

    /**
     * Launch a local Chromium instance with lock-file cleanup and retry.
     * @returns {Promise<import('puppeteer').Browser>}
     */
    async _launchLocalBrowser() {
        const userDataDir = path.resolve(CONFIG.USER_DATA_DIR);
        console.log(`📂 [System] Browser User Data Dir: ${userDataDir}`);

        // Initial lock cleanup
        this._cleanLocks(userDataDir);

        const launchBrowser = async (retries = 3) => {
            try {
                return await puppeteer.launch({
                    headless: this._resolveHeadlessMode(),
                    userDataDir,
                    args: BROWSER_ARGS,
                });
            } catch (err) {
                if (retries > 0 && err.message.includes('profile appears to be in use')) {
                    console.warn(`⚠️ [System] Profile locked. Retrying launch (${retries} left)...`);
                    this._cleanLocks(userDataDir);
                    await new Promise(r => setTimeout(r, TIMEOUTS.LOCK_RETRY_DELAY));
                    return launchBrowser(retries - 1);
                }
                throw err;
            }
        };

        return launchBrowser();
    }

    /**
     * Resolve the Puppeteer headless mode from env.
     * @returns {boolean|'new'}
     */
    _resolveHeadlessMode() {
        const val = process.env.PUPPETEER_HEADLESS;
        if (val === 'true') return true;
        if (val === 'new') return 'new';
        return false;
    }

    /**
     * 🧹 Remove stale Chrome lock files.
     * Validates that each path is strictly inside `baseDir` before deleting.
     * @param {string} baseDir — the Chrome user-data directory
     */
    _cleanLocks(baseDir) {
        const resolvedBase = path.resolve(baseDir);
        let cleaned = 0;

        for (const file of LOCK_FILES) {
            const target = path.join(resolvedBase, file);
            // Security: ensure resolved path is strictly within baseDir
            if (!path.resolve(target).startsWith(resolvedBase + path.sep) &&
                path.resolve(target) !== resolvedBase) {
                console.warn(`⚠️ [System] Skipping suspicious path: ${target}`);
                continue;
            }

            try {
                fs.lstatSync(target);
                fs.rmSync(target, { force: true, recursive: true });
                console.log(`🔓 [System] Removed Stale Lock: ${file}`);
                cleaned++;
            } catch (e) {
                if (e.code !== 'ENOENT') {
                    console.warn(`⚠️ [System] Failed to remove ${file}: ${e.message}`);
                }
            }
        }
        return cleaned;
    }

    /**
     * Initialize the memory driver with graceful fallback.
     */
    async _initMemoryDriver() {
        try {
            await this.memoryDriver.init();
        } catch (e) {
            console.warn('🔄 [System] 記憶引擎降級為 Browser/Native...', e.message);
            this.memoryDriver = new BrowserMemoryDriver(this);
            await this.memoryDriver.init();
        }
    }

    /**
     * Link the dashboard context if running in dashboard mode.
     */
    _linkDashboard() {
        if (!process.argv.includes('dashboard')) return;
        try {
            const dashboard = require('../../dashboard');
            dashboard.setContext(this, this.memoryDriver);
        } catch (e) {
            console.error('Failed to link dashboard context:', e.message);
        }
    }

    /**
     * Build & inject the system prompt including skills and protocol.
     */
    async _injectSystemPrompt() {
        let systemPrompt = skills.getSystemPrompt(getSystemFingerprint());

        // Inject dynamic skill list
        try {
            const activeSkills = skillManager.listSkills();
            if (activeSkills.length > 0) {
                systemPrompt += '\n\n### 🛠️ DYNAMIC SKILLS AVAILABLE (Output {"action": "skill_name", ...}):\n';
                for (const s of activeSkills) {
                    systemPrompt += `- Action: "${s.name}" | Desc: ${s.description}\n`;
                }
                systemPrompt += '(Use these skills via [GOLEM_ACTION] when requested by user.)\n';
            }
        } catch (e) {
            console.warn('Skills injection failed:', e.message);
        }

        await this.sendMessage(systemPrompt + buildSuperProtocol(), true);
    }

    // ----------------------------------------------------------
    // 🔌 CDP & Memory Accessors
    // ----------------------------------------------------------

    async setupCDP() {
        if (this.cdpSession) return;
        try {
            this.cdpSession = await this.page.target().createCDPSession();
            await this.cdpSession.send('Network.enable');
            console.log('🔌 [CDP] 網路神經連結已建立 (Neuro-Link Active)');
        } catch (e) {
            console.error('❌ [CDP] 連線失敗:', e.message);
        }
    }

    /**
     * Query the memory driver for related memories.
     * @param {string} queryText
     * @returns {Promise<Array>}
     */
    async recall(queryText) {
        if (!queryText) return [];
        try {
            return await this.memoryDriver.recall(queryText);
        } catch {
            return [];
        }
    }

    /**
     * Store a memory entry. Logs a warning on failure instead of silently swallowing.
     * @param {string} text
     * @param {object} metadata
     */
    async memorize(text, metadata = {}) {
        try {
            await this.memoryDriver.memorize(text, metadata);
        } catch (e) {
            console.warn('⚠️ [Memory] memorize 失敗:', e.message);
        }
    }

    // ----------------------------------------------------------
    // ✨ Neuro-Link: Sandwich Envelope Protocol
    // ----------------------------------------------------------

    /**
     * Send a message through the Gemini web UI and parse the response.
     * @param {string} text — user or system message
     * @param {boolean} isSystem — if true, skip waiting for a response
     * @returns {Promise<string>} — cleaned response text
     */
    async sendMessage(text, isSystem = false) {
        if (!this.browser) await this.init();
        try { await this.page.bringToFront(); } catch { /* page may already be in front */ }
        await this.setupCDP();

        const reqId = crypto.randomUUID().slice(0, LIMITS.REQ_ID_LENGTH);
        const TAG_START = `[[BEGIN:${reqId}]]`;
        const TAG_END = `[[END:${reqId}]]`;

        const payload = this._buildPayload(text, TAG_START, TAG_END);
        console.log(`📡 [Brain] 發送訊號: ${reqId} (三流全激活模式)`);

        return this._interactWithDOM(payload, isSystem, TAG_START, TAG_END);
    }

    /**
     * Build the sandwich-envelope payload string.
     * @param {string} text
     * @param {string} tagStart
     * @param {string} tagEnd
     * @returns {string}
     */
    _buildPayload(text, tagStart, tagEnd) {
        return (
            `[SYSTEM: STRICT FORMAT. Wrap response with ${tagStart} and ${tagEnd}. Inside, organize content using these tags:\n` +
            '1. [GOLEM_MEMORY] (Optional)\n' +
            '2. [GOLEM_ACTION] (Optional)\n' +
            '3. [GOLEM_REPLY] (Required)\n' +
            `Do not output raw text outside tags.]\n\n${text}`
        );
    }

    /**
     * Interact with the DOM: type the payload, click send, and wait for response.
     * Includes DOM Doctor self-healing on selector failures.
     * @param {string} payload
     * @param {boolean} isSystem
     * @param {string} tagStart
     * @param {string} tagEnd
     * @param {number} retryCount
     * @returns {Promise<string>}
     */
    async _interactWithDOM(payload, isSystem, tagStart, tagEnd, retryCount = 0) {
        if (retryCount > LIMITS.MAX_DOM_RETRY) {
            throw new Error('🔥 DOM Doctor 修復失敗，請檢查網路或 HTML 結構大幅變更。');
        }

        const sel = this.selectors;

        try {
            // Capture baseline text of the last response bubble
            const baseline = await this.page.evaluate((s) => {
                const bubbles = document.querySelectorAll(s);
                return bubbles.length > 0 ? bubbles[bubbles.length - 1].innerText : '';
            }, sel.response);

            // --- Type into input ---
            await this._typeIntoInput(sel, payload, retryCount);

            await new Promise(r => setTimeout(r, TIMEOUTS.INPUT_DELAY));

            // --- Click send ---
            await this._clickSend(sel, retryCount);

            // For system prompts, no need to wait for a response
            if (isSystem) {
                await new Promise(r => setTimeout(r, TIMEOUTS.SYSTEM_PROMPT_DELAY));
                return '';
            }

            // --- Wait for response ---
            console.log(`⚡ [Brain] 等待信封完整性 (${tagStart} ... ${tagEnd})...`);
            const finalResponse = await this._waitForResponse(sel.response, tagStart, tagEnd, baseline);

            if (finalResponse.status === 'TIMEOUT') {
                throw new Error('等待回應超時');
            }

            console.log(`🏁 [Brain] 捕獲: ${finalResponse.status} | 長度: ${finalResponse.text.length}`);
            return this._cleanResponseText(finalResponse.text, tagStart, tagEnd);

        } catch (e) {
            console.warn(`⚠️ [Brain] 互動失敗: ${e.message}`);

            // On first failure, attempt DOM Doctor diagnosis for response selector
            if (retryCount === 0) {
                console.log('🩺 [Brain] 啟動 DOM Doctor 進行 Response 診斷...');
                const htmlDump = await this.page.content();
                const newSelector = await this.doctor.diagnose(htmlDump, 'response');
                if (newSelector) {
                    this.selectors.response = newSelector;
                    this.doctor.saveSelectors(this.selectors);
                    return this._interactWithDOM(payload, isSystem, tagStart, tagEnd, retryCount + 1);
                }
            }
            throw e;
        }
    }

    /**
     * Type text into the Gemini input field. Self-heals via DOM Doctor.
     * @param {object} sel — current selectors
     * @param {string} text — text to type
     * @param {number} retryCount
     */
    async _typeIntoInput(sel, text, retryCount) {
        const inputEl = await this.page.$(sel.input);
        if (!inputEl) {
            console.log('🚑 找不到輸入框，呼叫 DOM Doctor...');
            const html = await this.page.content();
            const newSel = await this.doctor.diagnose(html, 'input');
            if (newSel) {
                this.selectors.input = newSel;
                this.doctor.saveSelectors(this.selectors);
                return this._typeIntoInput(this.selectors, text, retryCount + 1);
            }
            throw new Error('無法修復輸入框 Selector');
        }

        await this.page.evaluate((s, t) => {
            const el = document.querySelector(s);
            el.focus();
            document.execCommand('insertText', false, t);
        }, sel.input, text);
    }

    /**
     * Click the send button. Falls back to Enter key.
     * @param {object} sel — current selectors
     * @param {number} retryCount
     */
    async _clickSend(sel, retryCount) {
        const sendEl = await this.page.$(sel.send);
        if (!sendEl) {
            console.log('🚑 找不到發送按鈕，呼叫 DOM Doctor...');
            const html = await this.page.content();
            const newSel = await this.doctor.diagnose(html, 'send');
            if (newSel) {
                this.selectors.send = newSel;
                this.doctor.saveSelectors(this.selectors);
                return this._clickSend(this.selectors, retryCount + 1);
            }
            console.log('⚠️ 無法修復按鈕，嘗試使用 Enter 鍵發送...');
            await this.page.keyboard.press('Enter');
            return;
        }

        try {
            await this.page.waitForSelector(sel.send, { timeout: TIMEOUTS.SEND_BUTTON_WAIT });
            await this.page.click(sel.send);
        } catch {
            await this.page.keyboard.press('Enter');
        }
    }

    /**
     * Poll the DOM for the AI response, using the envelope tags to detect completion.
     * Runs inside `page.evaluate` for performance.
     *
     * @param {string} responseSelector
     * @param {string} startTag
     * @param {string} endTag
     * @param {string} baseline — text of the last bubble before sending
     * @returns {Promise<{status: string, text: string}>}
     */
    async _waitForResponse(responseSelector, startTag, endTag, baseline) {
        const pollInterval = TIMEOUTS.RESPONSE_POLL_INTERVAL;
        const timeout = TIMEOUTS.RESPONSE_TIMEOUT;
        const stableThreshold = LIMITS.STABLE_COUNT_THRESHOLD;

        return this.page.evaluate(
            (selector, sTag, eTag, oldText, interval, maxWait, maxStable) => {
                return new Promise((resolve) => {
                    const startTime = Date.now();
                    let stableCount = 0;
                    let lastCheckText = '';

                    const check = () => {
                        const bubbles = document.querySelectorAll(selector);
                        if (bubbles.length === 0) {
                            setTimeout(check, interval);
                            return;
                        }

                        const rawText = bubbles[bubbles.length - 1].innerText || '';
                        const startIndex = rawText.indexOf(sTag);

                        if (startIndex !== -1) {
                            // Found start tag — look for end tag
                            const endIndex = rawText.indexOf(eTag);
                            if (endIndex !== -1 && endIndex > startIndex) {
                                const content = rawText.substring(startIndex + sTag.length, endIndex).trim();
                                resolve({ status: 'ENVELOPE_COMPLETE', text: content });
                                return;
                            }

                            // Start tag found but no end tag yet — check stability
                            // BUG FIX: original had `rawText === lastCheckText && rawText.length > lastCheckText.length`
                            // which is logically impossible. Now correctly detects text growth vs stability.
                            if (rawText !== lastCheckText) {
                                stableCount = 0;
                            } else {
                                stableCount++;
                            }
                            lastCheckText = rawText;

                            if (stableCount > maxStable) {
                                const content = rawText.substring(startIndex + sTag.length).trim();
                                resolve({ status: 'ENVELOPE_TRUNCATED', text: content });
                                return;
                            }
                        } else if (rawText !== oldText && !rawText.includes('SYSTEM: Please WRAP')) {
                            // Fallback: no envelope tags but text changed
                            if (rawText === lastCheckText && rawText.length > 5) stableCount++;
                            else stableCount = 0;
                            lastCheckText = rawText;
                            if (stableCount > maxStable) {
                                resolve({ status: 'FALLBACK_DIFF', text: rawText });
                                return;
                            }
                        }

                        if (Date.now() - startTime > maxWait) {
                            resolve({ status: 'TIMEOUT', text: '' });
                            return;
                        }
                        setTimeout(check, interval);
                    };
                    check();
                });
            },
            responseSelector, startTag, endTag, baseline,
            pollInterval, timeout, stableThreshold
        );
    }

    /**
     * Strip envelope tags and system noise from the response.
     * @param {string} text
     * @param {string} tagStart
     * @param {string} tagEnd
     * @returns {string}
     */
    _cleanResponseText(text, tagStart, tagEnd) {
        return text
            .replace(tagStart, '')
            .replace(tagEnd, '')
            .replace(/\[SYSTEM: Please WRAP.*?\]/, '')
            .trim();
    }
}

module.exports = GolemBrain;

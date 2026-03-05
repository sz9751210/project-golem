// ============================================================
// 🚀 BrowserLauncher - 瀏覽器啟動 / 連線管理 (Playwright Edition)
// ============================================================
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { BROWSER_ARGS, LOCK_FILES, LIMITS, TIMINGS } = require('./constants');

class BrowserLauncher {
    /**
     * 統一入口：根據環境自動選擇連線或啟動瀏覽器
     * @param {Object} options
     * @param {string} options.userDataDir - 瀏覽器使用者資料目錄
     * @param {string} [options.headless] - 無頭模式設定 ('true' | falsy)
     * @returns {Promise<import('playwright').BrowserContext>}
     */
    static async launch({ userDataDir, headless }) {
        const isDocker = fs.existsSync('/.dockerenv');
        const remoteDebugPort = process.env.PLAYWRIGHT_REMOTE_DEBUGGING_PORT
            || process.env.PUPPETEER_REMOTE_DEBUGGING_PORT; // 向後相容

        if (isDocker && remoteDebugPort) {
            return BrowserLauncher.connectRemote('host.docker.internal', remoteDebugPort);
        }
        return BrowserLauncher.launchLocal(userDataDir, headless);
    }

    /**
     * Docker 環境下，透過 CDP 連線到宿主機 Chrome
     * @param {string} host - 宿主機主機名
     * @param {string|number} port - Debugging 埠號
     * @returns {Promise<import('playwright').BrowserContext>}
     */
    static async connectRemote(host, port) {
        const endpointURL = `http://${host}:${port}`;
        console.log(`🔌 [System] Connecting to Remote Chrome via CDP at ${endpointURL}...`);

        // 確認遠端 Chrome 可達
        await new Promise((resolve, reject) => {
            const req = http.get(
                `http://${host}:${port}/json/version`,
                { headers: { 'Host': 'localhost' } },
                (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => {
                        try { JSON.parse(data); resolve(); }
                        catch (e) { reject(new Error(`Failed to parse /json/version: ${data}`)); }
                    });
                }
            );
            req.on('error', reject);
            req.setTimeout(TIMINGS.CDP_TIMEOUT, () => {
                req.destroy();
                reject(new Error('Timeout fetching /json/version'));
            });
        });

        // Playwright 使用 connectOverCDP 取代 puppeteer.connect
        const browser = await chromium.connectOverCDP({ endpointURL });
        const context = browser.contexts()[0] || await browser.newContext();
        console.log(`✅ [System] Connected to Remote Chrome via CDP!`);
        return context;
    }

    /**
     * 本地環境啟動瀏覽器 (含 Lock 清理 + 重試機制)
     * Playwright 使用 launchPersistentContext 保留 Google 登入 cookie
     * @param {string} userDataDir - 使用者資料目錄
     * @param {string} [headless] - 無頭模式
     * @param {number} [retries] - 剩餘重試次數
     * @returns {Promise<import('playwright').BrowserContext>}
     */
    static async launchLocal(userDataDir, headless, retries = LIMITS.MAX_BROWSER_RETRY) {
        BrowserLauncher.cleanLocks(userDataDir);

        const isHeadless = headless === 'true';

        try {
            // launchPersistentContext 直接返回 BrowserContext（含持久化 session）
            const context = await chromium.launchPersistentContext(userDataDir, {
                headless: isHeadless,
                args: [...BROWSER_ARGS],
                // Stealth：讓自動化特徵無法被 Gemini 偵測到
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                viewport: { width: 1280, height: 900 },
            });
            return context;
        } catch (err) {
            if (retries > 0 && err.message.includes('profile appears to be in use')) {
                console.warn(`⚠️ [System] Profile locked. Retrying launch (${retries} left)...`);
                BrowserLauncher.cleanLocks(userDataDir);
                await new Promise(r => setTimeout(r, TIMINGS.BROWSER_RETRY_DELAY));
                return BrowserLauncher.launchLocal(userDataDir, headless, retries - 1);
            }
            throw err;
        }
    }

    /**
     * 清理 Chrome 殘留的 Lock 檔案
     * @param {string} userDataDir - 使用者資料目錄
     * @returns {number} 成功清理的檔案數
     */
    static cleanLocks(userDataDir) {
        let cleaned = 0;
        LOCK_FILES.forEach(file => {
            const p = path.join(userDataDir, file);
            try {
                fs.lstatSync(p);
                fs.rmSync(p, { force: true, recursive: true });
                console.log(`🔓 [System] Removed Stale Lock: ${file}`);
                cleaned++;
            } catch (e) {
                if (e.code !== 'ENOENT') {
                    console.warn(`⚠️ [System] Failed to remove ${file}: ${e.message}`);
                }
            }
        });
        return cleaned;
    }
}

module.exports = BrowserLauncher;

// ============================================================
// 🚀 BrowserLauncher - 瀏覽器啟動 / 連線管理
// ============================================================
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { BROWSER_ARGS, LOCK_FILES, LIMITS, TIMINGS } = require('./constants');

puppeteer.use(StealthPlugin());

class BrowserLauncher {
    // 靜態實例池，避免重複啟動相同 userDataDir 的瀏覽器
    static _instances = new Map();

    /**
     * 統一入口：根據環境自動選擇連線或啟動瀏覽器
     * @param {Object} options
     * @param {string} options.userDataDir - 瀏覽器使用者資料目錄
     * @param {string} [options.headless] - 無頭模式設定 ('true' | 'new' | falsy)
     * @returns {Promise<import('puppeteer').Browser>}
     */
    static async launch({ userDataDir, headless }) {
        const isDocker = fs.existsSync('/.dockerenv');
        const remoteDebugPort = process.env.PUPPETEER_REMOTE_DEBUGGING_PORT;

        if (isDocker && remoteDebugPort) {
            return BrowserLauncher.connectRemote('host.docker.internal', remoteDebugPort);
        }
        
        // 實例化 Singleton 邏輯
        const absolutePath = path.resolve(userDataDir);
        if (BrowserLauncher._instances.has(absolutePath)) {
            const existingBrowser = BrowserLauncher._instances.get(absolutePath);
            if (existingBrowser.isConnected()) {
                console.log(`♻️ [System] Reusing existing browser instance for: ${absolutePath}`);
                return existingBrowser;
            }
            BrowserLauncher._instances.delete(absolutePath);
        }

        const browser = await BrowserLauncher.launchLocal(absolutePath, headless);
        BrowserLauncher._instances.set(absolutePath, browser);
        
        // 監聽斷開事件
        browser.once('disconnected', () => {
            BrowserLauncher._instances.delete(absolutePath);
        });

        return browser;
    }

    /**
     * Docker 環境下，透過 Remote Debugging Protocol 連線到宿主機 Chrome
     * @param {string} host - 宿主機主機名
     * @param {string|number} port - Debugging 埠號
     * @returns {Promise<import('puppeteer').Browser>}
     */
    static async connectRemote(host, port) {
        const browserURL = `http://${host}:${port}`;
        console.log(`🔌 [System] Connecting to Remote Chrome at ${browserURL}...`);

        const wsEndpoint = await new Promise((resolve, reject) => {
            const req = http.get(
                `http://${host}:${port}/json/version`,
                { headers: { 'Host': 'localhost' } },
                (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => {
                        try {
                            const json = JSON.parse(data);
                            const rawWsUrl = new URL(json.webSocketDebuggerUrl);
                            rawWsUrl.hostname = host;
                            rawWsUrl.port = port;
                            resolve(rawWsUrl.toString());
                        } catch (e) {
                            reject(new Error(`Failed to parse /json/version: ${data}`));
                        }
                    });
                }
            );
            req.on('error', reject);
            req.setTimeout(TIMINGS.CDP_TIMEOUT, () => {
                req.destroy();
                reject(new Error('Timeout fetching /json/version'));
            });
        });

        console.log(`🔗 [System] WebSocket Endpoint: ${wsEndpoint}`);
        const browser = await puppeteer.connect({
            browserWSEndpoint: wsEndpoint,
            defaultViewport: null,
        });
        console.log(`✅ [System] Connected to Remote Chrome!`);
        return browser;
    }

    /**
     * 本地環境啟動瀏覽器 (含 Lock 清理 + 重試機制)
     * @param {string} userDataDir - 使用者資料目錄
     * @param {string} [headless] - 無頭模式
     * @param {number} [retries] - 剩餘重試次數
     * @returns {Promise<import('puppeteer').Browser>}
     */
    static async launchLocal(userDataDir, headless, retries = LIMITS.MAX_BROWSER_RETRY) {
        BrowserLauncher.cleanLocks(userDataDir);

        try {
            return await puppeteer.launch({
                headless: headless === 'true' ? true : (headless === 'new' ? 'new' : false),
                userDataDir,
                args: [...BROWSER_ARGS],
            });
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

    /**
     * 優化頁面：屏蔽圖片、字體、CSS (可選) 以提升速度
     * @param {import('puppeteer').Page} page 
     * @param {Object} options 
     */
    static async optimizePage(page, { blockImages = true, blockFonts = true, blockCSS = false } = {}) {
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const type = req.resourceType();
            if (blockImages && type === 'image') return req.abort();
            if (blockFonts && type === 'font') return req.abort();
            if (blockCSS && type === 'stylesheet') return req.abort();
            req.continue();
        });
        console.log(`🛡️ [System] Page optimized: Blocked ${[blockImages && 'Images', blockFonts && 'Fonts', blockCSS && 'CSS'].filter(Boolean).join(', ')}`);
    }
}

module.exports = BrowserLauncher;

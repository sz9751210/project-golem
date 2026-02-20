const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const { CONFIG } = require('../config');

puppeteer.use(StealthPlugin());

// ============================================================
// 🌐 BrowserManager (瀏覽器生命週期管理)
// ============================================================
class BrowserManager {
    constructor() {
        this.browser = null;
        this.page = null;
    }

    /**
     * 初始化瀏覽器：自動判斷本地啟動或 Docker 遠端連線。
     * @returns {{ browser: object, page: object, isNewSession: boolean }}
     */
    async init() {
        let isNewSession = false;

        if (!this.browser) {
            const userDataDir = path.resolve(CONFIG.USER_DATA_DIR);
            console.log(`📂 [System] Browser User Data Dir: ${userDataDir}`);

            const isDocker = fs.existsSync('/.dockerenv');
            const remoteDebugPort = process.env.PUPPETEER_REMOTE_DEBUGGING_PORT;

            if (isDocker && remoteDebugPort) {
                this.browser = await this._connectRemote(remoteDebugPort);
            } else {
                this._cleanLocks(userDataDir);
                this.browser = await this._launchLocal(userDataDir);
            }
        }

        if (!this.page) {
            const pages = await this.browser.pages();
            this.page = pages.length > 0 ? pages[0] : await this.browser.newPage();
            await this.page.goto('https://gemini.google.com/app', { waitUntil: 'networkidle2' });
            isNewSession = true;
        }

        return { browser: this.browser, page: this.page, isNewSession };
    }

    // --- Private: Docker 遠端連線 ---
    async _connectRemote(remoteDebugPort) {
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
                                const rawWsUrl = new URL(json.webSocketDebuggerUrl);
                                rawWsUrl.hostname = host;
                                rawWsUrl.port = remoteDebugPort;
                                resolve(rawWsUrl.toString());
                            } catch (e) { reject(new Error(`Failed to parse /json/version: ${data}`)); }
                        });
                    }
                );
                req.on('error', reject);
                req.setTimeout(5000, () => { req.destroy(); reject(new Error('Timeout fetching /json/version')); });
            });

            console.log(`🔗 [System] WebSocket Endpoint: ${wsEndpoint}`);
            const browser = await puppeteer.connect({
                browserWSEndpoint: wsEndpoint,
                defaultViewport: null
            });
            console.log(`✅ [System] Connected to Remote Chrome!`);
            return browser;
        } catch (e) {
            console.error(`❌ [System] Failed to connect to Remote Chrome: ${e.message}`);
            console.error(`   Make sure you ran './scripts/start-host-chrome.sh' on the host and 'host.docker.internal' is reachable.`);
            throw e;
        }
    }

    // --- Private: 本地啟動 (含重試) ---
    async _launchLocal(userDataDir, retries = 3) {
        try {
            return await puppeteer.launch({
                headless: process.env.PUPPETEER_HEADLESS === 'true' ? true : (process.env.PUPPETEER_HEADLESS === 'new' ? 'new' : false),
                userDataDir: userDataDir,
                args: [
                    '--no-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-setuid-sandbox',
                    '--window-size=1280,900',
                    '--disable-gpu'
                ]
            });
        } catch (err) {
            if (retries > 0 && err.message.includes('profile appears to be in use')) {
                console.warn(`⚠️ [System] Profile locked. Retrying launch (${retries} left)...`);
                this._cleanLocks(userDataDir);
                await new Promise(r => setTimeout(r, 1000));
                return this._launchLocal(userDataDir, retries - 1);
            }
            throw err;
        }
    }

    // --- Private: 鎖檔清理 ---
    _cleanLocks(userDataDir) {
        const lockFiles = ['SingletonLock', 'SingletonSocket', 'SingletonCookie'];
        lockFiles.forEach(file => {
            const p = path.join(userDataDir, file);
            try {
                fs.lstatSync(p);
                fs.rmSync(p, { force: true, recursive: true });
                console.log(`🔓 [System] Removed Stale Lock: ${file}`);
            } catch (e) {
                if (e.code !== 'ENOENT') {
                    console.warn(`⚠️ [System] Failed to remove ${file}: ${e.message}`);
                }
            }
        });
    }
}

module.exports = BrowserManager;

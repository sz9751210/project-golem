// ============================================================
z// 🎯 PageInteractor - Gemini 頁面 DOM 互動引擎 (抗 UI 改版強化版 v9.0.6)
// ============================================================
const fs = require('fs');
const path = require('path');
const { TIMINGS, LIMITS } = require('./constants');
const ResponseExtractor = require('./ResponseExtractor');

class PageInteractor {
    /**
     * @param {import('puppeteer').Page} page - Puppeteer 頁面實例
     * @param {import('../services/DOMDoctor')} doctor - DOM 修復服務
     */
    constructor(page, doctor) {
        this.page = page;
        this.doctor = doctor;
    }

    /**
     * 清洗 DOMDoctor 回傳的 Selector 字串
     * @param {string} rawSelector
     * @returns {string}
     */
    static cleanSelector(rawSelector) {
        if (!rawSelector) return "";
        let cleaned = rawSelector
            .replace(/```[a-zA-Z]*\s*/gi, '')
            .replace(/`/g, '')
            .trim();

        if (cleaned.toLowerCase().startsWith('css ')) {
            cleaned = cleaned.substring(4).trim();
        }
        return cleaned;
    }

    /**
     * 主互動流程：輸入文字 → 點擊發送 → 等待回應 → 🌟自動點擊按鈕 (智慧判斷)
     */
    async interact(payload, selectors, isSystem, startTag, endTag, retryCount = 0) {
        if (retryCount > LIMITS.MAX_INTERACT_RETRY) {
            throw new Error("🔥 DOM Doctor 修復失敗，請檢查網路或 HTML 結構大幅變更。");
        }

        try {
            // 1. 捕獲基準文字
            const baseline = await this._captureBaseline(selectors.response);

            // 2. 輸入文字 (使用無敵定位法 + 斜線指令標籤召喚術)
            await this._typeInput(selectors.input, payload);

            // 3. 等待輸入穩定
            await new Promise(r => setTimeout(r, TIMINGS.INPUT_DELAY));

            // 4. 發送訊息 (使用物理 Enter 爆破法)
            await this._clickSend(selectors.send);

            // 5. 若為系統訊息，延遲後直接返回
            if (isSystem) {
                await new Promise(r => setTimeout(r, TIMINGS.SYSTEM_DELAY));
                return "";
            }

            // 6. 等待信封回應
            console.log(`⚡ [Brain] 等待信封完整性 (${startTag} ... ${endTag})...`);
            const finalResponse = await ResponseExtractor.waitForResponse(
                this.page, selectors.response, startTag, endTag, baseline
            );

            if (finalResponse.status === 'TIMEOUT') throw new Error("等待回應超時");

            // 💡 效能優化：判斷這回合有沒有使用 /@ 擴充功能指令
            const hasExtensionCommand = /\/@(Gmail|Google Calendar|Google Keep|Google Tasks|Google 文件|Google 雲端硬碟|Workspace|YouTube Music|YouTube|Google Maps|Google 航班|Google 飯店|Spotify|Google Home|SynthID)/i.test(payload);

            if (hasExtensionCommand) {
                // 只有呼叫了擴充功能，才需要花 1.5 秒去巡邏有沒有儲存按鈕
                await this._autoClickWorkspaceButtons();
            } else {
                console.log("⏩ [PageInteractor] 此次對話無擴充功能，跳過幽靈掃描，極速返回！");
            }

            console.log(`🏁 [Brain] 捕獲: ${finalResponse.status} | 長度: ${finalResponse.text.length}`);
            return ResponseExtractor.cleanResponse(finalResponse.text, startTag, endTag);

        } catch (e) {
            console.warn(`⚠️ [Brain] 互動失敗: ${e.message}`);

            if (retryCount === 0) {
                console.log('🩺 [Brain] 啟動 DOM Doctor 進行 Response 診斷...');
                const healed = await this._healSelector('response', selectors);
                if (healed) {
                    return this.interact(payload, selectors, isSystem, startTag, endTag, retryCount + 1);
                }
            }
            throw e;
        }
    }

    /**
     * 檔案上傳核心邏輯 (v9.0.6 強化版)
     * @param {string} filePath - 本地檔案路徑
     * @param {number} [maxRetries=2] - 最大重試次數
     * @returns {Promise<boolean>} 是否上傳成功
     */
    async uploadFile(filePath, maxRetries = 2) {
        console.log(`📤 [PageInteractor] 準備上傳檔案: ${filePath}`);

        // 0. 前置驗證：檔案是否存在且可讀
        if (!fs.existsSync(filePath)) {
            console.error(`❌ [PageInteractor] 檔案不存在: ${filePath}`);
            return false;
        }
        const stats = fs.statSync(filePath);
        console.log(`📊 [PageInteractor] 檔案大小: ${(stats.size / 1024).toFixed(1)} KB`);

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            if (attempt > 0) {
                console.log(`🔄 [PageInteractor] 上傳重試 (${attempt}/${maxRetries})...`);
                await new Promise(r => setTimeout(r, 2000));
            }
            try {
                const success = await this._attemptUpload(filePath);
                if (success) return true;
            } catch (e) {
                console.warn(`⚠️ [PageInteractor] 上傳嘗試 ${attempt + 1} 失敗: ${e.message}`);
            }
        }

        console.error(`❌ [PageInteractor] 上傳完全失敗 (已重試 ${maxRetries} 次)`);
        return false;
    }

    /**
     * 單次上傳嘗試
     * @param {string} filePath
     * @returns {Promise<boolean>}
     * @private
     */
    async _attemptUpload(filePath) {
        // 1. 直接尋找隱藏的 file input (最快路徑)
        let fileInput = await this.page.$('input[type="file"]');

        // 2. 如果找不到，嘗試點擊上傳按鈕以觸發 input 生成
        if (!fileInput) {
            console.log("🔍 [PageInteractor] 嘗試定位上傳按鈕...");
            // 🎯 優先度排序：根據實際 Gemini Web DOM 結構 (2025)
            const uploadBtnSelectors = [
                // ===== 最高優先：Gemini 2025 UI 確認的 + 按鈕 =====
                'button.upload-card-button',
                'button[aria-label*="上傳檔案選單"]',
                'button[aria-label*="upload file menu"]',
                // ===== 次優先：通用上傳/附件按鈕 =====
                'button[aria-label*="上傳"]',
                'button[aria-label*="Upload"]',
                'button[aria-label*="附加"]',
                'button[aria-label*="Attach"]',
                'button[aria-label*="Add file"]',
                'button[aria-label*="新增檔案"]',
                // ===== 低優先：Material Icon 按鈕 =====
                'button:has(mat-icon[data-mat-icon-name="add_circle"])',
                'button:has(mat-icon[data-mat-icon-name="attach_file"])',
                'button:has(mat-icon[data-mat-icon-name="add"])',
            ];

            for (const sel of uploadBtnSelectors) {
                try {
                    const btn = await this.page.$(sel);
                    if (btn) {
                        console.log(`🎯 [PageInteractor] 找到上傳按鈕: ${sel}`);
                        await btn.click();
                        await new Promise(r => setTimeout(r, 1500));

                        // 先檢查是否直接出現了 file input（有些 UI 版本跳過選單）
                        fileInput = await this.page.$('input[type="file"]');
                        if (fileInput) break;

                        // 點擊 + 按鈕後出現的選單（mat-menu / popup / dropdown）
                        console.log("🔍 [PageInteractor] 搜尋上傳子選單...");
                        const menuItemSelectors = [
                            // Angular Material mat-menu
                            'button[mat-menu-item]',
                            'a[mat-menu-item]',
                            'mat-menu-item',
                            '[role="menuitem"]',
                            // 通用 popup / overlay 選項
                            '.cdk-overlay-pane button',
                            '.cdk-overlay-pane [role="menuitem"]',
                            '.cdk-overlay-pane a',
                            '.mat-mdc-menu-panel button',
                            // 任何彈窗中的可點擊項
                            '.mdc-menu-surface button',
                            '.mdc-menu-surface [role="menuitem"]',
                        ];

                        let menuClicked = false;
                        for (const menuSel of menuItemSelectors) {
                            const items = await this.page.$$(menuSel);
                            for (const item of items) {
                                const itemInfo = await item.evaluate(el => ({
                                    text: (el.innerText || el.textContent || '').trim(),
                                    visible: el.offsetHeight > 0
                                }));
                                if (!itemInfo.visible || itemInfo.text.length === 0 || itemInfo.text.length > 30) continue;

                                // 匹配「上傳檔案」「從電腦上傳」「Upload file」等
                                if (/上傳|Upload|我的電腦|from computer|local file/i.test(itemInfo.text)) {
                                    console.log(`📁 [PageInteractor] 點擊選單項: "${itemInfo.text}"`);
                                    await item.click();
                                    await new Promise(r => setTimeout(r, 1500));
                                    menuClicked = true;
                                    break;
                                }
                            }
                            if (menuClicked) break;
                        }

                        // 如果選單沒找到匹配項，嘗試點擊選單中第一個可見項（通常就是本地上傳）
                        if (!menuClicked) {
                            const firstItem = await this.page.$('.cdk-overlay-pane button, .cdk-overlay-pane [role="menuitem"], .mat-mdc-menu-panel button');
                            if (firstItem) {
                                const text = await firstItem.evaluate(el => (el.innerText || '').trim());
                                console.log(`📁 [PageInteractor] 點擊選單第一項: "${text}"`);
                                await firstItem.click();
                                await new Promise(r => setTimeout(r, 1500));
                            }
                        }

                        fileInput = await this.page.$('input[type="file"]');
                        if (fileInput) break;
                    }
                } catch (e) {
                    // 單個選擇器失敗不中斷迴圈
                }
            }
        }

        // 3. 最終防線：DOM Doctor 萬能診斷
        if (!fileInput) {
            console.log("🩺 [PageInteractor] 啟動 DOM Doctor 診斷上傳控制項...");
            const html = await this.page.content();
            const newSel = await this.doctor.diagnose(html, 'upload_input');
            if (newSel) {
                fileInput = await this.page.$(PageInteractor.cleanSelector(newSel));
            }
        }

        if (!fileInput) {
            throw new Error("無法定位 Gemini 的檔案上傳控制項");
        }

        // 4. 執行上傳
        await fileInput.uploadFile(filePath);
        console.log("⏳ [PageInteractor] 檔案已壓入上傳隊列，等待 UI 確認...");

        // 5. 等待上傳完成確認 (觀察 DOM 中是否出現檔案預覽)
        const uploadConfirmed = await this._waitForUploadConfirmation();
        if (uploadConfirmed) {
            console.log("✅ [PageInteractor] 檔案上傳已確認 (UI 預覽已生成)。");
        } else {
            console.log("✅ [PageInteractor] 檔案已壓入上傳隊列 (無法確認預覽，但已送出)。");
        }
        return true;
    }

    /**
     * 等待上傳完成的 UI 確認
     * @param {number} [timeout=8000]
     * @returns {Promise<boolean>}
     * @private
     */
    async _waitForUploadConfirmation(timeout = 8000) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            const hasPreview = await this.page.evaluate(() => {
                // 常見的 Gemini 檔案預覽標識
                const indicators = [
                    '[data-file-name]',
                    '.file-preview',
                    '.attachment-preview',
                    'img[alt*="preview"]',
                    '.upload-chip',
                    '.file-chip',
                    // Gemini 的檔案 chip 通常在輸入框區域內
                    '.input-area-container [class*="chip"]',
                    '.input-area-container [class*="file"]',
                ];
                return indicators.some(sel => document.querySelector(sel) !== null);
            });
            if (hasPreview) return true;
            await new Promise(r => setTimeout(r, 500));
        }
        return false;
    }

    /**
     * 偵測並捕捉最新下載的檔案 (v9.0.6 事件驅動版)
     * @param {string} downloadPath - 下載目錄
     * @param {number} timeout - 等待超時（毫秒）
     * @param {function} [onProgress] - 進度回報 callback(message)
     * @returns {Promise<string|null>} 下載後的本地路徑
     */
    async waitForDownload(downloadPath, timeout = 60000, onProgress = null) {
        console.log(`📥 [PageInteractor] 監控下載目錄: ${downloadPath}...`);

        if (!fs.existsSync(downloadPath)) {
            fs.mkdirSync(downloadPath, { recursive: true });
        }

        const beforeFiles = new Set(fs.readdirSync(downloadPath));

        return new Promise((resolve) => {
            let watcher = null;
            let pollTimer = null;
            let timeoutTimer = null;
            let resolved = false;

            const cleanup = () => {
                if (resolved) return;
                resolved = true;
                if (watcher) { try { watcher.close(); } catch (e) { } }
                if (pollTimer) clearInterval(pollTimer);
                if (timeoutTimer) clearTimeout(timeoutTimer);
            };

            /**
             * 檢查新檔案（排除暫存檔），並等待 .crdownload 完成
             */
            const checkForNewFiles = async () => {
                try {
                    const currentFiles = fs.readdirSync(downloadPath);

                    // 偵測 .crdownload 檔案 - 表示有下載正在進行
                    const downloading = currentFiles.filter(f =>
                        !beforeFiles.has(f) && (f.endsWith('.crdownload') || f.endsWith('.tmp'))
                    );
                    if (downloading.length > 0 && onProgress) {
                        onProgress(`⏬ 下載進行中... (${downloading[0]})`);
                    }

                    // 檢查已完成的新檔案
                    const completedFiles = currentFiles.filter(f =>
                        !beforeFiles.has(f) && !f.endsWith('.crdownload') && !f.endsWith('.tmp')
                    );

                    if (completedFiles.length > 0) {
                        const newestFile = completedFiles.sort((a, b) => {
                            return fs.statSync(path.join(downloadPath, b)).mtimeMs
                                - fs.statSync(path.join(downloadPath, a)).mtimeMs;
                        })[0];

                        // 再等 500ms 確認檔案寫入完成
                        await new Promise(r => setTimeout(r, 500));

                        console.log(`🎯 [PageInteractor] 捕捉到新檔案: ${newestFile}`);
                        if (onProgress) onProgress(`✅ 已捕捉到檔案: ${newestFile}`);
                        cleanup();
                        resolve(path.join(downloadPath, newestFile));
                        return true;
                    }
                } catch (e) {
                    console.warn(`⚠️ [PageInteractor] 下載偵測異常: ${e.message}`);
                }
                return false;
            };

            // 策略 1: fs.watch 事件驅動 (快速回應)
            try {
                watcher = fs.watch(downloadPath, async (eventType, filename) => {
                    if (resolved) return;
                    if (eventType === 'rename' || eventType === 'change') {
                        await checkForNewFiles();
                    }
                });
            } catch (e) {
                console.warn(`⚠️ [PageInteractor] fs.watch 不可用，退化為輪詢模式: ${e.message}`);
            }

            // 策略 2: 定期輪詢作為備用 (每 2 秒)
            pollTimer = setInterval(async () => {
                if (resolved) return;
                await checkForNewFiles();
            }, 2000);

            // 超時清理
            timeoutTimer = setTimeout(() => {
                if (!resolved) {
                    console.warn("⏳ [PageInteractor] 下載等待超時。");
                    if (onProgress) onProgress("⏳ 下載等待超時，Gemini 可能未產生檔案。");
                    cleanup();
                    resolve(null);
                }
            }, timeout);
        });
    }

    /**
     * 嘗試在 Gemini 頁面上主動點擊下載按鈕 (Canvas / Code Block 場景)
     * @returns {Promise<boolean>} 是否成功觸發下載
     */
    async triggerDownloadButton() {
        console.log("🔍 [PageInteractor] 搜尋 Gemini 頁面上的下載按鈕...");
        try {
            const clicked = await this.page.evaluate(() => {
                const downloadKeywords = ['下載', 'Download', 'Export', '匯出', '儲存檔案', 'Save file'];
                // 搜尋所有可點擊元素
                const clickables = Array.from(document.querySelectorAll(
                    'button, [role="button"], a[download], a[href*="download"]'
                ));

                // 從後往前搜尋（最新的回應通常在底部）
                for (let i = clickables.length - 1; i >= 0; i--) {
                    const el = clickables[i];
                    // 跳過導航區域的按鈕
                    if (el.closest('nav') || el.closest('aside')) continue;

                    const text = (el.innerText || el.textContent || '').trim();
                    const ariaLabel = el.getAttribute('aria-label') || '';
                    const combined = `${text} ${ariaLabel}`;

                    if (downloadKeywords.some(kw => combined.includes(kw)) && combined.length < 30) {
                        el.click();
                        return combined.trim();
                    }
                }

                // 嘗試 Canvas 區域的下載圖標
                const canvasDownload = document.querySelector(
                    'canvas-container button[aria-label*="download"], ' +
                    'canvas-container button[aria-label*="下載"], ' +
                    '.canvas-actions button[data-action="download"]'
                );
                if (canvasDownload) {
                    canvasDownload.click();
                    return 'Canvas Download';
                }

                return null;
            });

            if (clicked) {
                console.log(`🎯 [PageInteractor] 已觸發下載按鈕: "${clicked}"`);
                await new Promise(r => setTimeout(r, 2000));
                return true;
            }
            console.log("👻 [PageInteractor] 未發現可點擊的下載按鈕。");
            return false;
        } catch (e) {
            console.warn(`⚠️ [PageInteractor] 下載按鈕搜尋異常: ${e.message}`);
            return false;
        }
    }

    // ─── Private Methods ─────────────────────────────────────

    async _captureBaseline(responseSelector) {
        if (!responseSelector || responseSelector.trim() === "") {
            console.log("⚠️ Response Selector 為空，等待觸發修復。");
            throw new Error("空的 Response Selector");
        }

        return this.page.evaluate((s) => {
            const bubbles = document.querySelectorAll(s);
            if (bubbles.length === 0) return "";
            let target = bubbles[bubbles.length - 1];
            let container = target.closest('model-response') ||
                target.closest('.markdown') ||
                target.closest('.model-response-text') ||
                target.parentElement || target;
            return container.innerText || "";
        }, responseSelector).catch(() => "");
    }

    /**
     * 在輸入框中填入文字 (無敵屬性定位法 + 斜線標籤召喚)
     */
    async _typeInput(inputSelector, text) {
        // 🚀 定義網頁原生文字編輯器的通用特徵 (無視 class 改變)
        const fallbackSelectors = [
            '.ProseMirror',
            'rich-textarea',
            'div[role="textbox"][contenteditable="true"]',
            'div[contenteditable="true"]',
            'textarea'
        ];

        let targetSelector = inputSelector;

        if (!targetSelector || targetSelector.trim() === "") {
            targetSelector = fallbackSelectors.join(', ');
        }

        let inputEl = await this.page.$(targetSelector);

        if (!inputEl) {
            targetSelector = fallbackSelectors.join(', ');
            inputEl = await this.page.$(targetSelector);
        }

        if (!inputEl) {
            console.log("🚑 連通用特徵都找不到輸入框，呼叫 DOM Doctor...");
            const html = await this.page.content();
            const newSel = await this.doctor.diagnose(html, 'input');
            if (newSel) {
                const cleaned = PageInteractor.cleanSelector(newSel);
                throw new Error(`SELECTOR_HEALED:input:${cleaned}`);
            }
            throw new Error("無法修復輸入框 Selector");
        }

        const extRegex = /\/@(Gmail|Google Calendar|Google Keep|Google Tasks|Google 文件|Google 雲端硬碟|Workspace|YouTube Music|YouTube|Google Maps|Google 航班|Google 飯店|Spotify|Google Home|SynthID)/i;
        const extMatch = text.match(extRegex);

        let textToPaste = text;

        if (extMatch) {
            const originalSlashCommand = extMatch[0];
            const extensionName = extMatch[1];
            const summonWord = '@' + extensionName;

            console.log(`🪄 [PageInteractor] 偵測到明確指令 [${originalSlashCommand}]，轉換為 [${summonWord}] 啟動召喚儀式...`);

            textToPaste = text.replace(originalSlashCommand, '').trim();

            await inputEl.focus();

            await this.page.keyboard.type(summonWord, { delay: 100 });
            await new Promise(r => setTimeout(r, 1500));
            await this.page.keyboard.press('Enter');
            await new Promise(r => setTimeout(r, 500));

            console.log(`✅ [PageInteractor] [${summonWord}] 標籤召喚完成！準備貼上主指令...`);
        }

        await this.page.evaluate((s, t) => {
            const el = document.querySelector(s);
            el.focus();
            document.execCommand('insertText', false, (t ? ' ' + t : ''));
        }, targetSelector, textToPaste);
    }

    async _clickSend(sendSelector) {
        console.log("🚀 [PageInteractor] 啟動物理 Enter 爆破法，無視所有發送按鈕變更！");
        await this.page.keyboard.press('Enter');
        await new Promise(r => setTimeout(r, 200));
    }

    /**
     * 🌟 幽靈按鈕點擊術：加裝防禦機制的升級版
     */
    async _autoClickWorkspaceButtons() {
        try {
            console.log("🕵️ [PageInteractor] 啟動幽靈掃描，尋找是否需要點擊【儲存/建立】按鈕...");

            await new Promise(r => setTimeout(r, 1500));

            const clickedButtonText = await this.page.evaluate(() => {
                const targetKeywords = ['儲存活動', '儲存', '建立', '建立活動', 'Save event', 'Save', 'Create'];
                const buttons = Array.from(document.querySelectorAll('button, [role="button"], a.btn'));

                for (let i = buttons.length - 1; i >= 0; i--) {
                    const btn = buttons[i];

                    // 🛡️ 防禦 1：禁止觸摸側邊欄 (避開歷史紀錄)
                    if (btn.closest('nav') || btn.closest('aside') || btn.closest('sidenav')) {
                        continue;
                    }

                    const text = (btn.innerText || btn.textContent || "").trim();

                    // 🛡️ 防禦 2：長度限制 (按鈕文字通常很短，超過 15 字必定是標題)
                    if (text.length > 15 || text.length === 0) {
                        continue;
                    }

                    if (targetKeywords.some(kw => text === kw || text.includes(kw))) {
                        btn.click();
                        return text;
                    }
                }
                return null;
            });

            if (clickedButtonText) {
                console.log(`🎯 [PageInteractor] 幽靈突刺成功！已自動幫忙點擊：【${clickedButtonText}】`);
                await new Promise(r => setTimeout(r, 2000));
            } else {
                console.log("👻 [PageInteractor] 掃描完畢，沒有發現需要自動點擊的卡片按鈕。");
            }

        } catch (e) {
            console.warn(`⚠️ [PageInteractor] 幽靈掃描發生異常: ${e.message}`);
        }
    }

    async _healSelector(type, selectors) {
        try {
            const htmlDump = await this.page.content();
            const newSelector = await this.doctor.diagnose(htmlDump, type);
            if (newSelector) {
                selectors[type] = PageInteractor.cleanSelector(newSelector);
                this.doctor.saveSelectors(selectors);
                return true;
            }
        } catch (e) {
            console.warn(`⚠️ [Doctor] ${type} 修復失敗: ${e.message}`);
        }
        return false;
    }
}

module.exports = PageInteractor;

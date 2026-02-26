// ============================================================
// 🎯 PageInteractor - Gemini 頁面 DOM 互動引擎 (抗 UI 改版強化版 v9.0.5)
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
            // 0. [新增] 偵測是否為生圖需求，若是則確保進入 Nanobanana 模式
            // ⚠️ 修正：僅針對 [USER INPUT / SYSTEM MESSAGE] 之後的內容進行比對，避免被 Protocol 內容誤導
            const userContent = payload.includes('[USER INPUT / SYSTEM MESSAGE]')
                ? payload.split('[USER INPUT / SYSTEM MESSAGE]').pop().trim()
                : payload.trim();

            const isImageRequest = /畫|產生圖片|生成圖片|image|draw|generate/i.test(userContent);
            let finalPayload = payload;

            if (isImageRequest && !isSystem) {
                console.log("🎨 [PageInteractor] 偵測到生圖需求，將發送乾淨提示詞以確保觸發 Nanobanana...");
                await this._ensureNanobananaMode();
                // 在生圖模式下，只發送使用者原本的提示詞，避免 Protocol 內容干擾生圖工具
                finalPayload = userContent;
            }

            // 1. 捕獲基準文字
            const baseline = await this._captureBaseline(selectors.response);

            // 2. 輸入文字 (使用無敵定位法 + 斜線指令標籤召喚術)
            await this._typeInput(selectors.input, finalPayload);

            // 3. 等待輸入穩定
            await new Promise(r => setTimeout(r, TIMINGS.INPUT_DELAY));

            // 4. 發送訊息 (使用物理 Enter 爆破法)
            await this._clickSend(selectors.send);

            // 5. 若為系統訊息，延遲後直接返回
            if (isSystem) {
                await new Promise(r => setTimeout(r, TIMINGS.SYSTEM_DELAY));
                return { text: "", images: [] };
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
            const text = ResponseExtractor.cleanResponse(finalResponse.text, startTag, endTag);

            // 🌟 [新增] 圖片自動下載邏輯
            const imagePaths = await this._detectAndDownloadImages();
            if (imagePaths.length > 0) {
                console.log(`📸 [PageInteractor] 偵測到 ${imagePaths.length} 張圖片，已完成下載至暫存區。`);
            }

            return { text, images: imagePaths };

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

    /**
     * 📸 偵測並下載 Gemini 產生的圖片
     * @returns {Promise<string[]>} 下載後的檔案路徑陣列
     */
    async _detectAndDownloadImages() {
        try {
            const downloadPath = path.resolve(process.cwd(), 'temp_downloads');
            if (!fs.existsSync(downloadPath)) fs.mkdirSync(downloadPath);

            // 1. 設定 Puppeteer 下載行為
            const client = await this.page.target().createCDPSession();
            await client.send('Page.setDownloadBehavior', {
                behavior: 'allow',
                downloadPath: downloadPath
            });

            // 2. 獲取現有的暫存檔案列表 (用於排除)
            const initialFiles = fs.readdirSync(downloadPath);

            // 3. 在網頁端尋找圖片下載按鈕並點擊
            // Gemini 的圖片通常在一個網格中，下載按鈕可能有 title="Download" 或 "下載"
            const clickResult = await this.page.evaluate(async () => {
                const downloadButtons = Array.from(document.querySelectorAll('button, [role="button"]'))
                    .filter(btn => {
                        const ariaLabel = (btn.getAttribute('aria-label') || "").toLowerCase();
                        const title = (btn.getAttribute('title') || "").toLowerCase();
                        const text = (btn.innerText || "").toLowerCase();
                        return ariaLabel.includes('download') || ariaLabel.includes('下載') ||
                            title.includes('download') || title.includes('下載') ||
                            text.includes('download') || text.includes('下載');
                    });

                let clickedCount = 0;
                for (const btn of downloadButtons) {
                    // 為了避免點到舊的圖片按鈕，我們只看最後一個回應內的
                    const closestResponse = btn.closest('model-response');
                    if (closestResponse) {
                        // 確保它是最後一個 model-response 子元素
                        const allResponses = document.querySelectorAll('model-response');
                        if (closestResponse === allResponses[allResponses.length - 1]) {
                            btn.click();
                            clickedCount++;
                            // 稍微延遲一下，避免同時觸發太多下載導致衝突
                            await new Promise(r => setTimeout(r, 1000));
                        }
                    }
                }
                return clickedCount;
            });

            if (clickResult === 0) return [];

            // 4. 等待下載完成 (輪詢檢查檔案增加)
            console.log(`📡 [PageInteractor] 已點擊 ${clickResult} 個下載按鈕，等待檔案同步...`);

            let downloadedPaths = [];
            const startTime = Date.now();
            const timeout = 30000; // 30 秒下載超時

            while (Date.now() - startTime < timeout) {
                const currentFiles = fs.readdirSync(downloadPath);
                const newFiles = currentFiles.filter(f => !initialFiles.includes(f) && !f.endsWith('.crdownload') && !f.endsWith('.tmp'));

                if (newFiles.length >= clickResult) {
                    downloadedPaths = newFiles.map(f => path.join(downloadPath, f));
                    break;
                }
                await new Promise(r => setTimeout(r, 2000));
            }

            return downloadedPaths;
        } catch (e) {
            console.warn(`❌ [PageInteractor] 圖片下載過程發生錯誤: ${e.message}`);
            return [];
        }
    }

    /**
     * 🍌 確保啟用 Nanobanana (建立圖像) 模式
     */
    async _ensureNanobananaMode() {
        try {
            console.log("🍌 [PageInteractor] 檢查是否需啟用 Nanobanana 生圖模式...");

            // 1. 檢查是否已經在生圖模式
            const isAlreadyInMode = await this.page.evaluate(() => {
                const input = document.querySelector('.ProseMirror, rich-textarea, [contenteditable="true"]');
                const placeholder = input ? (input.getAttribute('data-placeholder') || input.innerText || "") : "";
                const bodyText = document.body.innerText || "";
                return placeholder.includes('圖片說明') || (bodyText.includes('建立圖像') && placeholder.includes('設定'));
            });

            if (isAlreadyInMode) {
                console.log("✅ [PageInteractor] 已在生圖模式，無需切換。");
                return;
            }

            // 2. 檢查登入狀態 (如果看到 Sign in 代表 Session 過期)
            const isLoggedOut = await this.page.evaluate(() => {
                return !!Array.from(document.querySelectorAll('a, button')).find(el => el.innerText.includes('Sign in') || el.innerText.includes('登入'));
            });
            if (isLoggedOut) {
                console.warn("⚠️ [PageInteractor] 偵測到瀏覽器未登入，這會導致生圖模式失效。請確保 golem_memory 包含有效登入資訊。");
            }

            // 3. 獲取頁面快照並傳回診斷資訊，嘗試點擊 "+" 按鈕
            const diag = await this.page.evaluate(async () => {
                const delay = (ms) => new Promise(r => setTimeout(r, ms));

                // A. 尋找左下角的 "+" 按鈕 (展開選單)
                const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
                const plusBtn = buttons.find(btn => {
                    const ariaLabel = (btn.getAttribute('aria-label') || "").toLowerCase();
                    const txt = (btn.innerText || "").trim();
                    return ariaLabel.includes('功能') || ariaLabel.includes('add') || txt === '+';
                });

                if (!plusBtn) {
                    return { success: false, step: 'FIND_PLUS_BUTTON', msg: '找不到 "+" 按鈕' };
                }

                plusBtn.click();
                await delay(1200);

                // B. 尋找「建立圖像」(Nanobanana)
                const allItems = Array.from(document.querySelectorAll('*'));
                const nanobananaItem = allItems.find(el => {
                    const text = (el.innerText || "").trim();
                    return (text.includes('建立圖像') || text.includes('Create Image') || text.includes('🍌')) &&
                        el.offsetHeight > 0 &&
                        el.children.length < 5; // 避免抓到整個 Body
                });

                if (!nanobananaItem) {
                    return { success: false, step: 'FIND_NANOBANANA', msg: '選單展開後找不到「建立圖像」項目' };
                }

                nanobananaItem.click();
                return { success: true, msg: '成功點擊「建立圖像」' };
            });

            if (diag.success) {
                console.log(`🎯 [PageInteractor] ${diag.msg}`);
                await new Promise(r => setTimeout(r, 1500));
            } else {
                console.warn(`⚠️ [PageInteractor] 切換失敗於 [${diag.step}]: ${diag.msg}`);
                // 失敗時存檔以便偵錯
                const debugPath = path.resolve(process.cwd(), 'temp_downloads', 'nanobanana_error.png');
                await this.page.screenshot({ path: debugPath });
                console.log(`📸 [PageInteractor] 已存儲診斷截圖至: ${debugPath}`);
            }

        } catch (e) {
            console.warn(`⚠️ [PageInteractor] 切換 Nanobanana 模式發生致命異常: ${e.message}`);
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

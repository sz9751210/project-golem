// ============================================================
// 🎯 PageInteractor - Gemini 頁面 DOM 互動引擎 (抗 UI 改版強化版 v9.0.5)
// ============================================================
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
     * @param {string} payload
     * @param {Object} selectors
     * @param {boolean|Object} options - 可以是單純的 isSystem 布林值，或是包含詳細設定的物件
     * @param {string} startTag
     * @param {string} endTag
     * @param {number} retryCount
     */
    async interact(payload, selectors, options = {}, startTag, endTag, retryCount = 0) {
        if (retryCount > LIMITS.MAX_INTERACT_RETRY) {
            throw new Error("🔥 DOM Doctor 修復失敗，請檢查網路或 HTML 結構大幅變更。");
        }

        const opts = typeof options === 'boolean' ? { isSystem: options } : options;
        const isSystem = opts.isSystem || false;
        const timeout = opts.timeout || null;
        const waitForTags = opts.waitForTags !== undefined ? opts.waitForTags : !isSystem;

        try {
            // 0. 確保頁面處於空閒狀態
            await this._waitForReady(selectors.send);

            // 1. 捕獲基準文字
            const baseline = await this._captureBaseline(selectors.response);

            // 2. 輸入文字
            await this._typeInput(selectors.input, payload);

            // 3. 等待輸入穩定
            await new Promise(r => setTimeout(r, TIMINGS.INPUT_DELAY));

            // 4. 發送訊息
            console.log(`🖱️ [PageInteractor] 正在點擊發送按鈕: ${selectors.send.substring(0, 30)}...`);
            await this._clickSend(selectors.send);

            // 5. 等待處理結束 (不論是否等待標籤，都必須等到生成的 Busy 狀態解除)
            if (!waitForTags) {
                console.log(`📡 [PageInteractor] 訊息已送出，等待 UI 空閒後返回...`);
                await new Promise(r => setTimeout(r, 1500));
                await this._waitForReady(selectors.send);
                await new Promise(r => setTimeout(r, opts.delayAfter || TIMINGS.SYSTEM_DELAY || 2000));
                return "";
            }

            // 6. 等待信封回應
            console.log(`⚡ [Brain] 等待信封完整性 (${startTag} ... ${endTag}) [Timeout: ${timeout || 'Default'}]...`);
            const finalResponse = await ResponseExtractor.waitForResponse(
                this.page, selectors.response, startTag, endTag, baseline, timeout
            );

            if (finalResponse.status === 'TIMEOUT') throw new Error("等待回應超時");

            // 💡 效能優化：判斷這回合有沒有使用 /@ 擴充功能指令
            const hasExtensionCommand = /\/@(Gmail|Google Calendar|Google Keep|Google Tasks|Google 文件|Google 雲端硬碟|Workspace|YouTube Music|YouTube|Google Maps|Google 航班|Google 飯店|Spotify|Google Home|SynthID)/i.test(payload);

            if (hasExtensionCommand) {
                await this._autoClickWorkspaceButtons();
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

        // 🎯 [核心優化] 尋找當前「可見且可用」的輸入框 (避免抓到舊分頁或隱藏的元素)
        let inputEl = await this.page.evaluateHandle((s) => {
            const elements = Array.from(document.querySelectorAll(s));
            // 優先找可見、沒被停用、且在大容器內的
            return elements.find(el => {
                const style = window.getComputedStyle(el);
                const isVisible = el.offsetHeight > 0 && style.visibility !== 'hidden' && style.display !== 'none';
                const isEnabled = !el.disabled && el.getAttribute('aria-disabled') !== 'true';
                return isVisible && isEnabled;
            }) || elements[0]; // 找不到就隨便抓一個
        }, targetSelector);

        if (!inputEl.asElement()) {
            console.log("🚑 找不到可見輸入框，嘗試使用通用特徵...");
            targetSelector = fallbackSelectors.join(', ');
            inputEl = await this.page.evaluateHandle((s) => {
                const elements = Array.from(document.querySelectorAll(s));
                return elements.find(el => el.offsetHeight > 0) || elements[0];
            }, targetSelector);
        }

        if (!inputEl.asElement()) {
            console.log("🚑🚨 連通用特徵都找不到輸入框，呼叫 DOM Doctor...");
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

        const payloadLength = textToPaste.length;
        console.log(`📝 [PageInteractor] 準備植入文字 (長度: ${payloadLength})...`);

        await this.page.evaluate((el, t) => {
            if (!el) return;
            el.focus();

            // ✨ [無敵植入法] 優先嘗試 execCommand (這對 React/ProseMirror 最有效)
            document.execCommand('selectAll', false, null);
            const success = document.execCommand('insertText', false, t);

            if (!success || (el.value !== t && el.innerText !== t)) {
                // Fallback: 直接設定值並手動觸發事件
                if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
                    el.value = t;
                } else {
                    el.innerText = t;
                }

                const events = ['input', 'change', 'keyup', 'keydown'];
                events.forEach(name => {
                    el.dispatchEvent(new Event(name, { bubbles: true, cancelable: true }));
                });
            }
        }, inputEl, textToPaste);

        // ✨ [Natural Trigger] 模擬真實按鍵喚醒 React 監聽器
        try {
            await inputEl.focus();
            await new Promise(r => setTimeout(r, 200)); // 增加延遲讓 React 反應
            await this.page.keyboard.type(' '); // 輸入一個空白
            await new Promise(r => setTimeout(r, 200));
            await this.page.keyboard.press('Backspace'); // 刪除空白
            console.log("✅ [PageInteractor] 透過物理按鍵 (Space+BS) 喚醒 React State 成功。");
        } catch (e) {
            console.warn("⚠️ [PageInteractor] 喚醒 React State 失敗 (非致命):", e.message);
        }
    }

    async _clickSend(sendSelector) {
        console.log("🚀 [PageInteractor] 發送訊號中 (Enter 爆破 + 實體按鈕補送)...");

        // 1. Enter 爆破 (嘗試對當前焦點發送 Enter)
        await this.page.keyboard.press('Enter');
        await new Promise(r => setTimeout(r, 400));

        // 2. 確定發送按鈕並等待其啟用 (有些 React UI 需要時間從 disabled 轉為 enabled)
        try {
            const btnSelector = sendSelector || 'button[aria-label*="發送"], button[aria-label*="Send"], button[aria-label*="傳送"], [data-testid="chat-input-send-button"]';

            // 嘗試等待按鍵可用 (即便原本是灰色的)
            await this.page.waitForFunction((s) => {
                const b = document.querySelector(s);
                return b && !b.disabled && b.getAttribute('aria-disabled') !== 'true';
            }, { timeout: 3000 }, btnSelector).catch(() => console.log("⏳ [PageInteractor] 發送按鈕尚未啟用，嘗試強制執行..."));

            // 3. 實體按鈕補強：優先使用 Puppeteer 原生 click (模擬真實滑鼠事件)
            const btn = await this.page.$(btnSelector);
            if (btn) {
                await btn.click();
            } else {
                // Fallback: 使用 evaluate click
                await this.page.evaluate((s) => {
                    const b = document.querySelector(s) ||
                        Array.from(document.querySelectorAll('button, [role="button"]'))
                            .find(el => el.innerHTML.includes('svg') && el.offsetHeight > 0);
                    if (b) {
                        b.focus();
                        b.click();
                        ['mousedown', 'mouseup'].forEach(evt => b.dispatchEvent(new MouseEvent(evt, { bubbles: true })));
                    }
                }, btnSelector);
            }
        } catch (e) {
            console.warn(`⚠️ [PageInteractor] 按鈕點擊失敗: ${e.message}`);
        }

        await new Promise(r => setTimeout(r, 800));
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
     * 🛡️ 頁面空閒檢查術：確保沒有正在生成的訊息或遮罩
     */
    async _waitForReady(sendSelector) {
        console.log("🔍 [PageInteractor] 正在檢查頁面空閒狀態...");
        const maxWait = 15000; // 最多等 15 秒
        const startTime = Date.now();

        while (Date.now() - startTime < maxWait) {
            const isBusy = await this.page.evaluate(() => {
                // 1. 尋找具備「停止/Stop」關鍵字的按鈕
                const stopButtons = Array.from(document.querySelectorAll('button, [role="button"]'))
                    .filter(b => {
                        const txt = (b.innerText || b.textContent || "").trim();
                        return ['停止', 'Stop', '中斷'].includes(txt);
                    });

                if (stopButtons.length > 0 && stopButtons.some(b => b.offsetHeight > 0)) {
                    return "Found Stop Button Text";
                }

                // 2. 尋找 DeepSeek 專屬的正在處理特徵 (例如方形圖示或特定 class)
                const isGenerating = document.querySelector('.generating, .is-generating, [aria-busy="true"]');
                if (isGenerating) return "Found Generating Class/Aria";

                // 3. 檢查發送按鈕內是否含有「正方形」圖示 (常見於停止按鈕)
                const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
                const squareBtn = buttons.find(b => {
                    const svg = b.querySelector('svg');
                    if (!svg) return false;
                    return svg.innerHTML.includes('rect') || svg.innerHTML.includes('M6 6h12v12H6'); // 方形路徑
                });
                if (squareBtn && squareBtn.offsetHeight > 0) return "Found Square Stop Icon";

                return false;
            });

            if (!isBusy) {
                console.log("✅ [PageInteractor] 頁面已空閒，準備發送。");
                return;
            }

            console.log(`⏳ [PageInteractor] 頁面忙碌中 (${isBusy})，等待 1 秒...`);

            await new Promise(r => setTimeout(r, 1000));
        }
        console.warn("⚠️ [PageInteractor] 頁面忙碌檢查超時，將嘗試直接發送。");
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

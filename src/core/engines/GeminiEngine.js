// ============================================================
// 🌟 GeminiEngine - Google Gemini Web 引擎
// ============================================================
const BaseEngine = require('./BaseEngine');
const { URLS } = require('../constants');
const PageInteractor = require('../PageInteractor');

class GeminiEngine extends BaseEngine {
    getAppUrl() {
        return URLS.GEMINI_APP;
    }

    getName() {
        return 'Gemini';
    }

    getDefaultSelectors() {
        return {
            input: 'div[contenteditable="true"], rich-textarea > div, p[data-placeholder]',
            send: 'button[aria-label*="Send"], button[aria-label*="傳送"], span[data-icon="send"]',
            response: '.model-response-text, .message-content, .markdown, div[data-test-id="message-content"]'
        };
    }

    async sendMessage(page, payload, selectors, doctor, isSystem, startTag, endTag) {
        const interactor = new PageInteractor(page, doctor);
        try {
            return await interactor.interact(
                payload, selectors, isSystem, startTag, endTag
            );
        } catch (e) {
            // 處理 selector 修復觸發的重試
            if (e.message && e.message.startsWith('SELECTOR_HEALED:')) {
                const [, type, newSelector] = e.message.split(':');
                selectors[type] = newSelector;
                doctor.saveSelectors(selectors);
                return interactor.interact(
                    payload, selectors, isSystem, startTag, endTag, 1
                );
            }
            throw e;
        }
    }

    async isLoggedIn(page) {
        // 檢查 URL 路徑是否為 /app (Gemini 登入後的路徑)
        const url = page.url();
        if (!url.includes('/app')) return false;

        // 檢查頁面中是否出現輸入框特徵
        const inputSelector = this.getDefaultSelectors().input;
        const exists = await page.evaluate((s) => {
            const el = document.querySelector(s);
            return !!(el && el.offsetHeight > 0);
        }, inputSelector);
        return exists;
    }

    /**
     * ✨ 動態視覺腳本：切換 Gemini 模型 (fast / thinking / pro)
     */
    async switchModel(page, targetMode) {
        try {
            const result = await page.evaluate(async (mode) => {
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

                if (!pickerBtn) return "⚠️ 找不到畫面底部的模型切換按鈕。UI 可能已變更，或您停留在登入畫面。";

                const isDisabled = pickerBtn.disabled ||
                    pickerBtn.getAttribute('aria-disabled') === 'true' ||
                    pickerBtn.classList.contains('disabled');

                if (isDisabled) {
                    return "⚠️ 模型切換按鈕目前呈現「灰色不可點擊」狀態！這通常是因為您尚未登入 Google 帳號，或該帳號目前沒有權限切換模型。";
                }

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
                    return `⚠️ 選單已展開，但找不到對應「${mode}」的選項 (已搜尋關鍵字: ${targetKeywords.join(', ')})。您可能目前無法使用該模型。`;
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
}

module.exports = GeminiEngine;

// ============================================================
// 🌊 DeepSeekEngine - DeepSeek Web 引擎
// ============================================================
const BaseEngine = require('./BaseEngine');
const { URLS } = require('../constants');
const PageInteractor = require('../PageInteractor');

class DeepSeekEngine extends BaseEngine {
    getAppUrl() {
        return URLS.DEEPSEEK_APP;
    }

    getName() {
        return 'DeepSeek';
    }

    getDefaultSelectors() {
        return {
            // DeepSeek 網頁版特徵 (依據實測觀察)
            input: 'textarea#chat-input, textarea[placeholder*="DeepSeek"], .prose-mirror, [contenteditable="true"]',
            send: '[data-testid="chat-input-send-button"], div[role="button"]:has(svg):not(:has(span)):not([aria-haspopup]):last-child, button[aria-label*="Send"], button[aria-label*="傳送"], button:has(svg path[d*="M12 13"]), .ds-send-button',
            response: '.ds-markdown, [data-test-id="message-content"], .ds-message--assistant, .markdown-body'
        };
    }

    async sendMessage(page, payload, selectors, doctor, isSystem, startTag, endTag) {
        const interactor = new PageInteractor(page, doctor);
        try {
            // 注意：DeepSeek 目前不具備 Google Workspace 擴充指令，
            // 系統會自動在 PageInteractor 中跳過幽靈按鈕掃描。
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
        // 1. 檢查目前 URL (排除 /login, /sign-in, /auth, /welcome 路徑)
        const url = page.url().toLowerCase();
        if (url.includes('/login') || url.includes('/sign-in') || url.includes('/auth') || url.includes('/welcome')) return false;

        // 2. 檢查頁面中是否出現輸入框特徵或 DeepSeek 專屬按鈕 (需可見)
        const exists = await page.evaluate(() => {
            // 尋找輸入框
            const input = document.querySelector('textarea#chat-input, textarea[placeholder*="DeepSeek"], .prose-mirror, div[contenteditable="true"]');
            const hasInput = !!(input && input.offsetHeight > 0);

            // 尋找 DeepThink 或 Search 按鈕 (DeepSeek 登入後首頁特有的)
            const buttons = Array.from(document.querySelectorAll('button, div[role="button"], span'));
            const hasSignature = buttons.some(b => {
                const txt = b.innerText || "";
                return txt.includes('DeepThink') || txt.includes('深度思考') || txt.includes('Search') || txt.includes('聯網搜索');
            });

            return hasInput || hasSignature;
        });
        return exists;
    }

    /**
     * ✨ 支援 DeepSeek 的 DeepThink (R1) 模式切換
     */
    async switchModel(page, targetMode) {
        if (!['deepthink', 'normal'].includes(targetMode.toLowerCase())) {
            return "⚠️ DeepSeek 目前僅支援 [deepthink] 或 [normal] 模式切換。";
        }

        try {
            const result = await page.evaluate(async (mode) => {
                const delay = (ms) => new Promise(r => setTimeout(r, ms));

                // 1. 尋找 DeepThink 的開關 (通常是一個按鈕或包含 DeepThink 字樣的元素)
                const buttons = Array.from(document.querySelectorAll('div[role="button"], button, span'));
                let thinkBtn = buttons.find(b => {
                    const txt = (b.innerText || "").toLowerCase();
                    return txt.includes('deepthink') || txt.includes('深度思考');
                });

                if (!thinkBtn) return "⚠️ 找不到 DeepThink 切換按鈕，UI 可能已變更。";

                // 2. 檢查目前狀態 (假設透過 class 或 aria-checked 判斷)
                const isActive = thinkBtn.classList.contains('active') ||
                    thinkBtn.getAttribute('aria-checked') === 'true' ||
                    thinkBtn.innerHTML.includes('checked');

                if (mode === 'deepthink' && !isActive) {
                    thinkBtn.click();
                    return "✅ 已為您開啟 DeepThink (R1) 深度思考模式。";
                } else if (mode === 'normal' && isActive) {
                    thinkBtn.click();
                    return "✅ 已為您切換回標準聊天模式。";
                }

                return `ℹ️ DeepSeek 目前已經處於 ${isActive ? 'DeepThink' : '標準'} 模式。`;
            }, targetMode.toLowerCase());

            return result;
        } catch (error) {
            return `❌ DeepSeek 模式切換失敗: ${error.message}`;
        }
    }
}

module.exports = DeepSeekEngine;

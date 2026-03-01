// ============================================================
// 🤖 GrokEngine - xAI Grok Web 引擎實作
// ============================================================
const BaseEngine = require('./BaseEngine');
const ResponseExtractor = require('../ResponseExtractor');
const { URLS, TIMINGS, LIMITS } = require('../constants');

class GrokEngine extends BaseEngine {
    getAppUrl() {
        return URLS.GROK_APP;
    }

    getName() {
        return 'Grok';
    }

    /**
     * Grok 網頁互動引擎
     * 使用 Grok 特有的 DOM 結構進行訊息收發
     */
    async sendMessage(page, doctor, payload, selectors, isSystem, startTag, endTag) {
        try {
            // 0. 等待頁面空閒
            await this._waitForReady(page);

            // 1. 捕獲基準文字
            const baseline = await this._captureBaseline(page);

            // 2. 輸入文字
            await this._typeInput(page, payload);

            // 3. 等待輸入穩定
            await new Promise(r => setTimeout(r, TIMINGS.INPUT_DELAY));

            // 4. 發送訊息
            await this._clickSend(page);

            // 5. 若為系統訊息，延遲後直接返回
            if (isSystem) {
                await new Promise(r => setTimeout(r, TIMINGS.SYSTEM_DELAY));
                return "";
            }

            // 6. 等待回應
            console.log(`⚡ [GrokEngine] 等待信封完整性 (${startTag} ... ${endTag})...`);
            const responseSelector = 'div.message-bubble, div[class*="response"], div[class*="message"] p, article div';
            const finalResponse = await ResponseExtractor.waitForResponse(
                page, responseSelector, startTag, endTag, baseline
            );

            if (finalResponse.status === 'TIMEOUT') throw new Error("等待 Grok 回應超時");

            console.log(`🏁 [GrokEngine] 捕獲: ${finalResponse.status} | 長度: ${finalResponse.text.length}`);
            return ResponseExtractor.cleanResponse(finalResponse.text, startTag, endTag);

        } catch (e) {
            console.warn(`⚠️ [GrokEngine] 互動失敗: ${e.message}`);

            // 嘗試 DOMDoctor 修復
            if (doctor) {
                try {
                    const htmlDump = await page.content();
                    const newSelector = await doctor.diagnose(htmlDump, 'response');
                    if (newSelector) {
                        console.log(`🩺 [GrokEngine] DOMDoctor 修復成功，重試中...`);
                        const retryResponse = await ResponseExtractor.waitForResponse(
                            page, newSelector, startTag, endTag, ''
                        );
                        if (retryResponse.status !== 'TIMEOUT') {
                            return ResponseExtractor.cleanResponse(retryResponse.text, startTag, endTag);
                        }
                    }
                } catch (healErr) {
                    console.warn(`⚠️ [GrokEngine] DOMDoctor 修復失敗: ${healErr.message}`);
                }
            }
            throw e;
        }
    }

    /**
     * Grok 模型切換 (目前 Grok 網頁不支援)
     */
    async switchModel(page, targetMode) {
        return `⚠️ Grok 引擎目前不支援透過網頁介面切換模型模式。請直接在 Grok 網頁上手動切換。`;
    }

    // ─── Private Methods ─────────────────────────────────────

    /**
     * 等待 Grok 頁面空閒
     */
    async _waitForReady(page) {
        console.log("🔍 [GrokEngine] 正在檢查頁面空閒狀態...");
        const maxWait = 15000;
        const startTime = Date.now();

        while (Date.now() - startTime < maxWait) {
            const isBusy = await page.evaluate(() => {
                // 檢查是否有「停止生成」按鈕
                const stopButtons = Array.from(document.querySelectorAll('button, [role="button"]'))
                    .filter(b => {
                        const txt = (b.innerText || b.textContent || "").trim().toLowerCase();
                        return ['stop', '停止', 'stop generating'].some(k => txt.includes(k));
                    });

                if (stopButtons.length > 0 && stopButtons.some(b => b.offsetHeight > 0)) {
                    return true;
                }

                // 檢查是否有正在串流的動畫
                const isStreaming = document.querySelector('.streaming, [data-streaming="true"], [aria-busy="true"]');
                if (isStreaming) return true;

                return false;
            });

            if (!isBusy) {
                console.log("✅ [GrokEngine] 頁面已空閒，準備發送。");
                return;
            }

            await new Promise(r => setTimeout(r, 1000));
        }
        console.warn("⚠️ [GrokEngine] 頁面忙碌檢查超時，將嘗試直接發送。");
    }

    /**
     * 捕獲 Grok 頁面當前最後一則回應的文字 (作為基準)
     */
    async _captureBaseline(page) {
        return page.evaluate(() => {
            // Grok 的回應通常在 article 或特定的 message 容器中
            const responses = document.querySelectorAll('div.message-bubble, div[class*="response"], article div');
            if (responses.length === 0) return "";
            const last = responses[responses.length - 1];
            return last.innerText || "";
        }).catch(() => "");
    }

    /**
     * 在 Grok 輸入框中填入文字
     */
    async _typeInput(page, text) {
        const fallbackSelectors = [
            'textarea[placeholder]',
            'div[contenteditable="true"]',
            '.ProseMirror',
            'textarea',
            'div[role="textbox"]',
        ];

        const targetSelector = fallbackSelectors.join(', ');
        const payloadLength = text.length;
        console.log(`📝 [GrokEngine] 準備植入文字 (長度: ${payloadLength})...`);

        const found = await page.evaluate((selectors, t) => {
            const el = document.querySelector(selectors);
            if (!el) return false;
            el.focus();

            if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
                // 使用 native setter 確保 React state 同步
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                    window.HTMLTextAreaElement.prototype, 'value'
                ).set;
                nativeInputValueSetter.call(el, t);
            } else {
                el.innerText = t;
            }

            // 觸發事件讓框架知道內容變更
            const events = ['input', 'change', 'keyup'];
            events.forEach(name => {
                el.dispatchEvent(new Event(name, { bubbles: true, cancelable: true }));
            });

            return true;
        }, targetSelector, text);

        if (!found) {
            throw new Error("🚑 [GrokEngine] 找不到 Grok 輸入框，可能尚未登入或頁面結構變更。");
        }
    }

    /**
     * 點擊 Grok 發送按鈕
     */
    async _clickSend(page) {
        console.log("🚀 [GrokEngine] 發送訊號中...");

        // 嘗試點擊送出按鈕
        const clicked = await page.evaluate(() => {
            // Grok 的送出按鈕通常有 aria-label 或特定的 SVG 圖標
            const sendBtns = Array.from(document.querySelectorAll('button'))
                .filter(btn => {
                    const label = (btn.getAttribute('aria-label') || '').toLowerCase();
                    const text = (btn.innerText || '').toLowerCase().trim();
                    // 檢查是否為送出按鈕
                    return label.includes('send') || label.includes('submit') ||
                        label.includes('發送') || text === 'send' || text === '發送' ||
                        (btn.querySelector('svg') && btn.offsetHeight > 0 && btn.offsetHeight < 60);
                });

            // 優先選擇有明確標籤的按鈕
            for (const btn of sendBtns) {
                if (btn.offsetHeight > 0 && !btn.disabled) {
                    btn.click();
                    return true;
                }
            }
            return false;
        });

        if (!clicked) {
            // 備援方案：使用 Enter 鍵
            console.log("🔄 [GrokEngine] 找不到送出按鈕，使用 Enter 爆破...");
            await page.keyboard.press('Enter');
        }

        await new Promise(r => setTimeout(r, 200));
    }
}

module.exports = GrokEngine;

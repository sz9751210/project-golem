// ============================================================
// 🔍 ResponseExtractor - 回應信封擷取與清理
// ============================================================
const { TIMINGS, LIMITS } = require('./constants');

class ResponseExtractor {
    /**
     * 在瀏覽器內等待 AI 回應信封完成
     * (此函式會傳入 page.evaluate 在瀏覽器上下文中執行)
     *
     * @param {import('puppeteer').Page} page - Puppeteer 頁面實例
     * @param {string} selector - 回應氣泡的 CSS Selector
     * @param {string} startTag - 信封開始標籤
     * @param {string} endTag - 信封結束標籤
     * @param {string} baseline - 發送前的基準文字 (用於排除舊回應)
     * @returns {Promise<{status: string, text: string}>}
     */
    static async waitForResponse(page, selector, startTag, endTag, baseline) {
        const stableComplete = LIMITS.STABLE_THRESHOLD_COMPLETE;
        const stableThinking = LIMITS.STABLE_THRESHOLD_THINKING;
        const pollInterval = TIMINGS.POLL_INTERVAL;
        const timeout = TIMINGS.TIMEOUT;

        return page.evaluate(
            async (sel, sTag, eTag, oldText, _stableComplete, _stableThinking, _pollInterval, _timeout) => {
                return new Promise((resolve) => {
                    const startTime = Date.now();
                    let stableCount = 0;
                    let lastCheckText = "";

                    const check = () => {
                        const bubbles = Array.from(document.querySelectorAll(sel));
                        if (bubbles.length === 0) {
                            if (Math.random() > 0.95) console.log(`[DOM_EXTRACTOR] 搜尋中... Selector: ${sel}`);
                            setTimeout(check, _pollInterval);
                            return;
                        }

                        let rawText = "";
                        const lookback = Math.min(bubbles.length, 5); // 稍微增加往前掃描的深度 (最近 5 個)
                        for (let i = bubbles.length - lookback; i < bubbles.length; i++) {
                            rawText += (bubbles[i].innerText || "") + "\n";
                        }

                        // 🎯 [核心優化] 模糊搜尋信封標籤 (防止 Markdown 渲染器注入隱形成分，並處理 AI 幻覺)
                        const normalize = (t) => (t || "").replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, '');
                        const normText = normalize(rawText);

                        // 定義可能的標籤變體 (具體 ID vs 字面 placeholder)
                        const possibleSTags = [normalize(sTag), "[[BEGIN:reqId]]"].map(normalize);
                        const possibleETags = [normalize(eTag), "[[END:reqId]]"].map(normalize);

                        let startIndexNorm = -1;
                        let sTagMatch = "";
                        for (const pst of possibleSTags) {
                            const idx = normText.indexOf(pst);
                            if (idx !== -1 && (startIndexNorm === -1 || idx < startIndexNorm)) {
                                startIndexNorm = idx;
                                sTagMatch = pst;
                            }
                        }

                        let endIndexNorm = -1;
                        let eTagMatch = "";
                        for (const pet of possibleETags) {
                            const idx = normText.lastIndexOf(pet); // 抓最後一個結束標籤
                            if (idx !== -1 && idx > startIndexNorm) {
                                endIndexNorm = idx;
                                eTagMatch = pet;
                            }
                        }

                        // 🔍 [Diagnostic Log]
                        if (startIndexNorm !== -1 || rawText.length > 0) {
                            console.log(`[DOM_EXTRACTOR] 狀態: BEGIN(${sTagMatch})=${startIndexNorm} | END(${eTagMatch})=${endIndexNorm} | 全文字長度: ${rawText.length}`);
                            if (startIndexNorm !== -1 && endIndexNorm === -1) {
                                console.log(`[DOM_EXTRACTOR] 已抓取到旗幟 (${sTagMatch})，正在等待落幕...`);
                            }
                        }

                        if (startIndexNorm !== -1 && endIndexNorm !== -1 && endIndexNorm > startIndexNorm) {
                            console.log(`[DOM_EXTRACTOR] ✅ 成功發現完整信封 (Fuzzy: ${sTagMatch})！內容長度: ${rawText.length}`);
                            resolve({ status: 'ENVELOPE_COMPLETE', text: rawText });
                            return;
                        }

                        if (rawText === lastCheckText) {
                            stableCount++;
                        } else {
                            stableCount = 0;
                            if (rawText.length > 0) console.log(`[DOM_EXTRACTOR] 文字變動中... 穩定計數歸零`);
                        }
                        lastCheckText = rawText;

                        if (startIndexNorm !== -1) {
                            // ✨ [條件 2：已經開始回答] 看到 BEGIN，但遲遲沒看到 END
                            if (stableCount > _stableComplete) {
                                resolve({ status: 'ENVELOPE_TRUNCATED', text: rawText });
                                return;
                            }
                        } else if (rawText.trim() !== oldText.trim() && !rawText.includes('SYSTEM: Please WRAP')) {
                            // ✨ [條件 3：Thinking Mode] 還沒看到 BEGIN
                            if (stableCount > _stableThinking) {
                                resolve({ status: 'FALLBACK_DIFF', text: rawText });
                                return;
                            }
                        }

                        // 總超時時間上限
                        if (Date.now() - startTime > _timeout) {
                            resolve({ status: 'TIMEOUT', text: '' });
                            return;
                        }
                        setTimeout(check, _pollInterval);
                    };
                    check();
                });
            },
            selector, startTag, endTag, baseline,
            stableComplete, stableThinking, pollInterval, timeout
        );
    }

    /**
     * 清理回應文字中的信封標籤和系統雜訊
     * @param {string} rawText - 原始回應文字
     * @param {string} startTag - 信封開始標籤
     * @param {string} endTag - 信封結束標籤
     * @returns {string} 清理後的文字
     */
    static cleanResponse(rawText, startTag, endTag) {
        return rawText
            .replace(startTag, '')
            .replace(endTag, '')
            .replace(/\[SYSTEM: Please WRAP.*?\]/, '')
            .trim();
    }
}

module.exports = ResponseExtractor;

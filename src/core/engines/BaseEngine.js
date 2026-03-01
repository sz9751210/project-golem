// ============================================================
// 🏗️ BaseEngine - AI 引擎抽象介面 (Strategy Pattern)
// ============================================================

/**
 * 所有 AI 引擎必須實作此介面。
 * 透過策略模式讓 GolemBrain 不需要知道底層使用的是哪一個 AI 平台。
 */
class BaseEngine {
    /**
     * 取得此引擎對應的 Web App URL
     * @returns {string}
     */
    getAppUrl() {
        throw new Error('BaseEngine.getAppUrl() must be implemented');
    }

    /**
     * 取得引擎顯示名稱
     * @returns {string}
     */
    getName() {
        throw new Error('BaseEngine.getName() must be implemented');
    }

    /**
     * 在頁面上執行訊息互動 (輸入 → 送出 → 等回應)
     * @param {import('puppeteer').Page} page - Puppeteer 頁面
     * @param {Object} doctor - DOMDoctor 實例
     * @param {string} payload - 要送出的文字
     * @param {Object} selectors - CSS 選擇器集合
     * @param {boolean} isSystem - 是否為系統訊息
     * @param {string} startTag - 信封起始標籤
     * @param {string} endTag - 信封結束標籤
     * @returns {Promise<string>} AI 回應文字
     */
    async sendMessage(page, doctor, payload, selectors, isSystem, startTag, endTag) {
        throw new Error('BaseEngine.sendMessage() must be implemented');
    }

    /**
     * 切換模型模式 (如 Gemini 的 fast/thinking/pro)
     * @param {import('puppeteer').Page} page - Puppeteer 頁面
     * @param {string} targetMode - 目標模式
     * @returns {Promise<string>} 操作結果訊息
     */
    async switchModel(page, targetMode) {
        return `⚠️ ${this.getName()} 引擎目前不支援網頁模型切換。`;
    }
}

module.exports = BaseEngine;

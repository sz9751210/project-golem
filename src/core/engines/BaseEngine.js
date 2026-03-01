// ============================================================
// 🧩 BaseEngine - AI 引擎抽象介面 (Strategy Pattern)
// ============================================================

/**
 * @abstract
 * 所有 AI 引擎必須繼承此類別並實作以下方法。
 * GolemBrain 透過此統一介面與不同的 AI 網站互動。
 */
class BaseEngine {
    /**
     * 取得該引擎的網站 URL
     * @abstract
     * @returns {string}
     */
    getAppUrl() {
        throw new Error('子類別必須實作 getAppUrl()');
    }

    /**
     * 取得引擎名稱 (用於 log 顯示)
     * @abstract
     * @returns {string}
     */
    getName() {
        throw new Error('子類別必須實作 getName()');
    }

    /**
     * 取得該引擎預設的 DOM Selectors
     * @abstract
     * @returns {{ input: string, send: string, response: string }}
     */
    getDefaultSelectors() {
        throw new Error('子類別必須實作 getDefaultSelectors()');
    }

    /**
     * 發送訊息並等待回應
     * @abstract
     * @param {import('puppeteer').Page} page - 頁面實例
     * @param {string} payload - 訊息內容
     * @param {Object} selectors - DOM 選擇器
     * @param {import('../services/DOMDoctor')} doctor - 醫生實例
     * @param {boolean} isSystem - 是否為系統訊息
     * @param {string} startTag - 開始標籤
     * @param {string} endTag - 結束標籤
     * @returns {Promise<string>} 回應內容
     */
    async sendMessage(page, payload, selectors, doctor, isSystem, startTag, endTag) {
        throw new Error('子類別必須實作 sendMessage()');
    }

    /**
     * 檢查目前是否已登入 (或已進入可對話狀態)
     * @abstract
     * @param {import('puppeteer').Page} page - 頁面實例
     * @returns {Promise<boolean>}
     */
    async isLoggedIn(page) {
        throw new Error('子類別必須實作 isLoggedIn()');
    }

    /**
     * 執行模型/模式切換 (例如 Gemini fast/thinking/pro, DeepSeek deepthink)
     * @abstract
     * @param {import('puppeteer').Page} page - Puppeteer 頁面實例
     * @param {string} targetMode - 目標模式
     * @returns {Promise<string>} 切換結果訊息
     */
    async switchModel(page, targetMode) {
        return `⚠️ ${this.getName()} 引擎尚未支援模型切換功能。`;
    }
}

module.exports = BaseEngine;

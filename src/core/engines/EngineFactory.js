// ============================================================
// 🏭 EngineFactory - AI 引擎工廠
// ============================================================
const GeminiEngine = require('./GeminiEngine');
const GrokEngine = require('./GrokEngine');

class EngineFactory {
    /**
     * 根據模型名稱建立對應的引擎實例
     * @param {string} [aiModel='gemini'] - 模型名稱 (gemini | grok)
     * @returns {import('./BaseEngine')} 引擎實例
     */
    static create(aiModel = 'gemini') {
        switch ((aiModel || 'gemini').toLowerCase()) {
            case 'grok':
                return new GrokEngine();
            case 'gemini':
            default:
                return new GeminiEngine();
        }
    }

    /**
     * 取得所有支援的引擎名稱清單
     * @returns {string[]}
     */
    static getSupportedModels() {
        return ['gemini', 'grok'];
    }
}

module.exports = EngineFactory;

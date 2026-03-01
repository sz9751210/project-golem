// ============================================================
// 🏭 EngineFactory - AI 引擎工廠
// ============================================================
const GeminiEngine = require('./GeminiEngine');
const DeepSeekEngine = require('./DeepSeekEngine');

class EngineFactory {
    /**
     * 根據模型名稱建立對應的引擎實例
     * @param {string} aiModel - 模型名稱 (gemini | deepseek)
     * @returns {import('./BaseEngine')}
     */
    static create(aiModel = 'gemini') {
        const model = (aiModel || 'gemini').toLowerCase();

        switch (model) {
            case 'deepseek':
                return new DeepSeekEngine();
            case 'gemini':
            default:
                return new GeminiEngine();
        }
    }

    /**
     * 取得目前支援的所有模型
     * @returns {string[]}
     */
    static getSupportedModels() {
        return ['gemini', 'deepseek'];
    }
}

module.exports = EngineFactory;

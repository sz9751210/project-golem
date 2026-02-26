const fs = require('fs');
const ResponseParser = require('../utils/ResponseParser');
const ScheduleHandler = require('./action_handlers/ScheduleHandler');
const MultiAgentHandler = require('./action_handlers/MultiAgentHandler');
const SkillHandler = require('./action_handlers/SkillHandler');
const CommandHandler = require('./action_handlers/CommandHandler');

// ============================================================
// 🧬 NeuroShunter (神經分流中樞 - 核心路由器)
// ============================================================
class NeuroShunter {
    static async dispatch(ctx, rawResponse, brain, controller) {
        const text = typeof rawResponse === 'string' ? rawResponse : (rawResponse.text || "");
        const images = (rawResponse && rawResponse.images) || [];

        const parsed = ResponseParser.parse(text);

        // 1. 處理長期記憶寫入
        if (parsed.memory) {
            console.log(`[GOLEM_MEMORY]\n${parsed.memory}`);
            await brain.memorize(parsed.memory, { type: 'fact', timestamp: Date.now() });
        }

        // 2. 處理直接回覆
        if (parsed.reply) {
            console.log(`🤖 [Golem] 說: ${parsed.reply}`);
            await ctx.reply(parsed.reply);
        }

        // 3. 處理結構化 Action 分配 (Strategy Pattern)
        if (parsed.actions.length > 0) {
            console.log(`[GOLEM_ACTION]\n${JSON.stringify(parsed.actions, null, 2)}`);
            const normalActions = [];

            for (const act of parsed.actions) {
                switch (act.action) {
                    case 'schedule':
                        await ScheduleHandler.execute(ctx, act, brain);
                        break;
                    case 'multi_agent':
                        await MultiAgentHandler.execute(ctx, act, controller, brain);
                        break;
                    default:
                        // 檢查是否為動態擴充技能
                        const isSkillHandled = await SkillHandler.execute(ctx, act, brain);
                        if (!isSkillHandled) {
                            // 若不是已知框架 Action 且非動態技能，則視為底層 Shell 指令
                            normalActions.push(act);
                        }
                        break;
                }
            }

            // 4. 處理剩餘的終端指令序列並自動啟動回饋循環 (Feedback Loop)
            if (normalActions.length > 0) {
                await CommandHandler.execute(ctx, normalActions, controller, brain, this.dispatch.bind(this));
            }
        }

        // 5. 處理圖片發送
        if (images.length > 0) {
            console.log(`🖼️ [NeuroShunter] 準備發送 ${images.length} 張圖片...`);
            for (const imgPath of images) {
                try {
                    await ctx.sendDocument(imgPath);
                } catch (e) {
                    console.error(`❌ [NeuroShunter] 圖片發送失敗 (${imgPath}):`, e.message);
                }
            }

            // 6. 清理暫存檔案
            this._cleanup(images);
        }
    }

    /**
     * 🗑️ 清理暫存檔案
     * @param {string[]} filePaths 
     */
    static _cleanup(filePaths) {
        if (!filePaths || filePaths.length === 0) return;
        setTimeout(() => {
            for (const filePath of filePaths) {
                try {
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                        console.log(`🗑️ [NeuroShunter] 已清理暫存檔: ${filePath}`);
                    }
                } catch (e) {
                    console.warn(`⚠️ [NeuroShunter] 清理檔案失敗: ${e.message}`);
                }
            }
        }, 5000); // 延遲 5 秒清理，確保傳送已完成
    }
}

module.exports = NeuroShunter;

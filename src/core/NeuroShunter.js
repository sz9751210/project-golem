const ResponseParser = require('../utils/ResponseParser');
const ToolScanner = require('../managers/ToolScanner');
const skillManager = require('../skills/lib/skill-manager');

// ============================================================
// 🧬 NeuroShunter (神經分流中樞 - 核心邏輯層)
// ============================================================
const MAX_DISPATCH_DEPTH = 3; // 最大遞迴深度，避免 AI 無限迴圈

class NeuroShunter {
    static async dispatch(ctx, rawResponse, brain, controller, depth = 0) {
        // 🛡️ 遞迴深度保護
        if (depth >= MAX_DISPATCH_DEPTH) {
            console.warn(`⚠️ [NeuroShunter] 行動鏈深度已達上限 (${MAX_DISPATCH_DEPTH})，中斷遞迴。`);
            await ctx.reply("⚠️ 行動鏈過長，已自動中斷。如需繼續，請再次下達指令。");
            return;
        }

        const parsed = ResponseParser.parse(rawResponse);

        if (parsed.memory) {
            console.log(`🧠 [Memory] 寫入: ${parsed.memory.substring(0, 20)}...`);
            await brain.memorize(parsed.memory, { type: 'fact', timestamp: Date.now() });
        }

        if (parsed.reply) {
            await ctx.reply(parsed.reply);
        }

        if (parsed.actions.length > 0) {
            const normalActions = [];
            for (const act of parsed.actions) {
                if (act.action === 'schedule') {
                    if (brain.memoryDriver.addSchedule) {
                        const safeTime = new Date(act.time).toISOString();
                        console.log(`📅 [Chronos] 新增排程: ${act.task} @ ${safeTime}`);
                        await brain.memoryDriver.addSchedule(act.task, safeTime);
                        await ctx.reply(`⏰ 已設定排程：${act.task} (於 ${safeTime} 執行)`);
                    } else {
                        await ctx.reply("⚠️ 當前記憶模式不支援排程功能。");
                    }
                } else if (act.action === 'multi_agent') {
                    // ✨ [v9.0] 處理多 Agent 請求
                    await controller._handleMultiAgent(ctx, act, brain);
                } else {
                    // ✨ [v9.0] 檢查是否為動態技能 (Skill Engine)
                    const skillName = act.action;
                    const dynamicSkill = skillManager.getSkill(skillName);

                    if (dynamicSkill) {
                        await ctx.reply(`🔌 執行技能: **${dynamicSkill.name}**...`);
                        try {
                            const result = await dynamicSkill.run({
                                page: brain.page,
                                browser: brain.browser,
                                log: console,
                                io: { ask: (q) => ctx.reply(q) },
                                args: act // 傳遞參數給技能
                            });
                            if (result) await ctx.reply(`✅ 技能回報: ${result}`);
                        } catch (e) {
                            await ctx.reply(`❌ 技能執行錯誤: ${e.message}`);
                        }
                    } else {
                        normalActions.push(act);
                    }
                }
            }

            if (normalActions.length > 0) {
                const observation = await controller.runSequence(ctx, normalActions);
                if (observation) {
                    if (ctx.sendTyping) await ctx.sendTyping();
                    const feedbackPrompt = `[System Observation]\n${observation}\n\nPlease reply to user naturally using [GOLEM_REPLY].`;
                    const finalRes = await brain.sendMessage(feedbackPrompt);
                    await this.dispatch(ctx, finalRes, brain, controller, depth + 1);
                }
            }
        }
    }
}

module.exports = NeuroShunter;

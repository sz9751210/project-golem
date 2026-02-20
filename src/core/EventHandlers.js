const appState = require('./AppState');
const InteractiveMultiAgent = require('./InteractiveMultiAgent');
const NodeRouter = require('./NodeRouter');
const OpticNerve = require('../services/OpticNerve');
const SystemUpgrader = require('../managers/SystemUpgrader');
const DeployManager = require('../managers/DeployManager');
const NeuroShunter = require('./NeuroShunter');
const UniversalContext = require('./UniversalContext');

// ============================================================
// 📨 EventHandlers (事件處理 - 從 index.js 抽取)
// ============================================================

/**
 * 統一訊息處理
 * @param {object} ctx - UniversalContext
 * @param {object} deps - { brain, controller, autonomy, convoManager, BOOT_TIME }
 */
async function handleUnifiedMessage(ctx, deps) {
    const { brain, controller, autonomy, convoManager, BOOT_TIME } = deps;

    // Flood Guard - 忽略離線期間訊息
    const msgTime = ctx.messageTime;
    if (msgTime && msgTime < BOOT_TIME) return;

    // 優先檢查：是否在 MultiAgent 等待用戶輸入
    if (appState.multiAgentListeners.has(ctx.chatId)) {
        const callback = appState.multiAgentListeners.get(ctx.chatId);
        callback(ctx.text);
        return;
    }

    // 檢查：是否要恢復會議
    if (ctx.text && ['恢復會議', 'resume', '繼續會議'].includes(ctx.text.toLowerCase())) {
        if (InteractiveMultiAgent.canResume(ctx.chatId)) {
            await InteractiveMultiAgent.resumeConversation(ctx, brain);
            return;
        }
    }

    if (!ctx.text && !ctx.getAttachment) return;
    if (!ctx.isAdmin) return;
    if (await NodeRouter.handle(ctx, brain)) return;

    // 部署指令攔截
    const deployCmd = DeployManager.matchCommand(ctx.text);
    if (deployCmd === 'deploy') return DeployManager.executeDeploy(ctx, brain);
    if (deployCmd === 'drop') return DeployManager.executeDrop(ctx, brain);

    const lowerText = ctx.text ? ctx.text.toLowerCase() : '';
    if (lowerText.startsWith('/patch') || lowerText.includes('優化代碼')) {
        await autonomy.performSelfReflection(ctx);
        return;
    }

    await ctx.sendTyping();
    try {
        let finalInput = ctx.text;
        const attachment = await ctx.getAttachment();

        if (attachment) {
            await ctx.reply("👁️ 正在透過 OpticNerve 分析檔案...");
            const apiKey = await brain.doctor.keyChain.getKey();
            if (apiKey) {
                const analysis = await OpticNerve.analyze(attachment.url, attachment.mimeType, apiKey);
                finalInput = `【系統通知：視覺訊號】\n檔案類型：${attachment.mimeType}\n分析報告：\n${analysis}\n使用者訊息：${ctx.text || ""}\n請根據分析報告回應。`;
            } else {
                await ctx.reply("⚠️ 視覺系統暫時過熱 (API Rate Limit)，無法分析圖片，將僅處理文字訊息。");
            }
        }
        if (!finalInput && !attachment) return;
        await convoManager.enqueue(ctx, finalInput);
    } catch (e) { console.error(e); await ctx.reply(`❌ 錯誤: ${e.message}`); }
}

/**
 * 統一 Callback 處理
 * @param {object} ctx - UniversalContext
 * @param {string} actionData - Callback data
 * @param {object} deps - { brain, controller, pendingTasks }
 */
async function handleUnifiedCallback(ctx, actionData, deps) {
    const { brain, controller, pendingTasks } = deps;

    if (ctx.platform === 'discord' && ctx.isInteraction) {
        try {
            await ctx.event.deferReply({ flags: 64 });
        } catch (e) {
            console.error('Callback Discord deferReply Error:', e.message);
        }
    }

    if (!ctx.isAdmin) return;
    if (actionData === 'PATCH_DEPLOY') return DeployManager.executeDeploy(ctx, brain);
    if (actionData === 'PATCH_DROP') return DeployManager.executeDrop(ctx, brain);
    if (actionData === 'SYSTEM_FORCE_UPDATE') return SystemUpgrader.performUpdate(ctx);
    if (actionData === 'SYSTEM_UPDATE_CANCEL') return await ctx.reply("已取消更新操作。");

    if (actionData.includes('_')) {
        const [action, taskId] = actionData.split('_');
        const task = pendingTasks.get(taskId);
        if (!task) return await ctx.reply('⚠️ 任務已失效');
        if (action === 'DENY') {
            pendingTasks.delete(taskId);
            await ctx.reply('🛡️ 操作駁回');
        } else if (action === 'APPROVE') {
            const { steps, nextIndex } = task;
            pendingTasks.delete(taskId);
            await ctx.reply("✅ 授權通過，執行中...");
            const approvedStep = steps[nextIndex];
            const cmd = approvedStep.cmd || approvedStep.parameter || approvedStep.command || "";
            let execResult = "";
            try {
                const output = await controller.executor.run(cmd);
                execResult = `[Step ${nextIndex + 1} Success] cmd: ${cmd}\nResult:\n${(output || "").trim()}`;
            } catch (e) {
                execResult = `[Step ${nextIndex + 1} Failed] cmd: ${cmd}\nError:\n${e.message}`;
            }
            const remainingResult = await controller.runSequence(ctx, steps, nextIndex + 1);
            const observation = [execResult, remainingResult].filter(Boolean).join('\n\n----------------\n\n');
            if (observation) {
                const feedbackPrompt = `[System Observation]\nUser approved actions.\nResult:\n${observation}\nReport to user using [GOLEM_REPLY].`;
                const finalResponse = await brain.sendMessage(feedbackPrompt);
                await NeuroShunter.dispatch(ctx, finalResponse, brain, controller);
            }
        }
    }
}

/**
 * 註冊 Telegram / Discord 事件監聽器
 * @param {object|null} tgBot
 * @param {object|null} dcClient
 * @param {object} deps - 依賴注入物件
 */
function registerListeners(tgBot, dcClient, deps) {
    if (tgBot) {
        tgBot.on('message', (msg) =>
            handleUnifiedMessage(new UniversalContext('telegram', msg, tgBot), deps)
        );

        tgBot.on('callback_query', async (query) => {
            tgBot.answerCallbackQuery(query.id).catch(e => {
                console.warn(`⚠️ [TG] Callback Answer Warning: ${e.message}`);
            });
            await handleUnifiedCallback(
                new UniversalContext('telegram', query, tgBot),
                query.data,
                deps
            );
        });
    }

    if (dcClient) {
        dcClient.on('messageCreate', (msg) => {
            if (!msg.author.bot) handleUnifiedMessage(new UniversalContext('discord', msg, dcClient), deps);
        });
        dcClient.on('interactionCreate', (interaction) => {
            if (interaction.isButton()) handleUnifiedCallback(new UniversalContext('discord', interaction, dcClient), interaction.customId, deps);
        });
    }
}

module.exports = { handleUnifiedMessage, handleUnifiedCallback, registerListeners };

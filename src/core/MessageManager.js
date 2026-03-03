const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// ============================================================
// 📨 Message Manager (雙模版訊息切片器)
// ============================================================
class MessageManager {
    static async send(ctx, text, options = {}) {
        if (!text) return;

        // 🌉 [Cross-Entity Bridge] 攔截對同伺服器其它 Golem 的標記
        if (ctx.platform === 'telegram') {
            try {
                // 為了避免循環引用，在此處動態 require
                const indexApp = require('../../index.js');
                if (indexApp && indexApp.telegramBots && indexApp.activeGolems) {
                    const myId = ctx.instance.golemConfig ? ctx.instance.golemConfig.id : null;
                    const botsMap = indexApp.telegramBots;

                    for (const [targetId, targetBot] of botsMap.entries()) {
                        if (targetId === myId) continue; // 忽略自己

                        const targetUsername = targetBot.username;
                        if (!targetUsername) continue;

                        const botTag = `@${targetUsername.toLowerCase()}`;
                        if (text.toLowerCase().includes(botTag)) {
                            // 攔截到內部標記，啟動內部神經橋接
                            const targetGolem = indexApp.activeGolems.get(targetId);
                            if (targetGolem && targetGolem.convoManager) {
                                console.log(`🌉 [Cross-Entity Bridge] 偵測到 ${myId} 呼叫 ${targetId}，啟動內部派發直通車。`);

                                // 建立一個偽造的虛擬上下文 (Mock Context) 讓接收方以為這是從群組收到的人類發言
                                const senderTag = ctx.instance.username ? `@${ctx.instance.username}` : "另一個 AI";
                                const injectedText = `【來自同僚 ${senderTag} 的跨實體對訊】\n${text}\n\n[SYSTEM INSTRUCTION: 這是來自同僚 ${senderTag} 的內部直通車訊息。為確保連續對話順暢，請務必在你的回覆最開頭標記他 (${senderTag})，並直接回答他的問題，請忽略「不要標記發問者」的限制。]`;
                                const mockCtx = {
                                    platform: 'telegram',
                                    chatId: ctx.chatId,
                                    text: injectedText,
                                    senderName: ctx.instance.username || "AI-Agent",
                                    instance: targetBot,
                                    shouldMentionSender: false, // 內部直接對話無需標記回去
                                    isMentioned: () => true, // 強制認為被標記 (因為這是專屬直通車)
                                    sendTyping: async () => { /* 靜默處理 */ },
                                    reply: async (replyText) => {
                                        // 接收方產生的文字，將正常透過真實的 MessageManager 往外送出
                                        // 注意：這裡必須使用原本自己的 context
                                        const selfCtx = require('./UniversalContext'); // 動態引入防止依賴圈
                                        const realCtx = new selfCtx('telegram', {
                                            message: { chat: { id: ctx.chatId } }
                                        }, targetBot);
                                        return await MessageManager.send(realCtx, replyText);
                                    }
                                };

                                // 非同步丟進目標的大腦隊列，不阻擋目前的發送流程
                                setImmediate(() => {
                                    targetGolem.convoManager.enqueue(mockCtx, injectedText).catch(e => {
                                        console.error(`[Bridge Error] 跨實體派發失敗:`, e.message);
                                    });
                                });
                            }
                        }
                    }
                }
            } catch (bridgeErr) {
                console.warn(`[Cross-Entity Bridge Error] 無法掃描內部對話: ${bridgeErr.message}`);
            }
        }

        const MAX_LENGTH = ctx.platform === 'telegram' ? 4000 : 1900;
        const chunks = [];
        let remaining = text;
        while (remaining.length > 0) {
            if (remaining.length <= MAX_LENGTH) { chunks.push(remaining); break; }
            let splitIndex = remaining.lastIndexOf('\n', MAX_LENGTH);
            if (splitIndex === -1) splitIndex = MAX_LENGTH;
            chunks.push(remaining.substring(0, splitIndex));
            remaining = remaining.substring(splitIndex).trim();
        }

        for (const chunk of chunks) {
            try {
                if (ctx.platform === 'telegram') {
                    await ctx.instance.sendMessage(ctx.chatId, chunk, options);
                } else {
                    const channel = await ctx.instance.channels.fetch(ctx.chatId);
                    const dcOptions = { content: chunk };
                    if (options.reply_markup && options.reply_markup.inline_keyboard) {
                        const row = new ActionRowBuilder();
                        options.reply_markup.inline_keyboard[0].forEach(btn => {
                            row.addComponents(new ButtonBuilder().setCustomId(btn.callback_data).setLabel(btn.text).setStyle(ButtonStyle.Primary));
                        });
                        dcOptions.components = [row];
                    }
                    await channel.send(dcOptions);
                }
            } catch (e) { console.error(`[MessageManager] 發送失敗:`, e.message); }
        }
    }
}

module.exports = MessageManager;

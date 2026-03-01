// ============================================================
// ⚡ ResponseParser (JSON 解析器 - 寬鬆版 + 集中化 + 終極矯正 + 穿透思考模式)
// ============================================================
class ResponseParser {
    static parse(raw) {
        const parsed = { memory: null, actions: [], reply: "" };

        if (!raw) return parsed;
        console.log(`🔍 [Parser] 正在解析原始回應 (長度: ${raw.length}): "${raw.substring(0, 100).replace(/\n/g, ' ')}..."`);

        // ✨ [升級：穿透 Thinking Mode] 
        // 許多時候 AI 的回覆會混雜 "Assessing My Capabilities" 等系統提示音。
        // 我們改用更具彈性的獨立擷取方式，無視前面的廢話。

        // 1. 獨立擷取 MEMORY
        const memoryMatch = raw.match(/(?:\*{0,3}\[GOLEM_MEMORY\]\*{0,3})([\s\S]*?)(?:(?:\*{0,3}\[GOLEM_ACTION\]\*{0,3})|(?:\*{0,3}\[GOLEM_REPLY\]\*{0,3})|$)/i);
        if (memoryMatch && memoryMatch[1]) {
            const content = memoryMatch[1].trim();
            if (content && content !== 'null' && content !== '(無)') {
                parsed.memory = content;
            }
        }

        // 2. 獨立擷取 ACTION，並執行終極矯正
        const actionMatch = raw.match(/(?:\*{0,3}\[GOLEM_ACTION\]\*{0,3})([\s\S]*?)(?:(?:\*{0,3}\[GOLEM_REPLY\]\*{0,3})|$)/i);
        if (actionMatch && actionMatch[1]) {
            // 暴力脫去所有 Markdown 外衣與 "json" 前綴
            let jsonCandidate = actionMatch[1]
                .replace(/```[a-zA-Z]*\s*/gi, '')
                .replace(/```/g, '')
                .replace(/^\s*json\s*/i, '') // 🎯 [DeepSeek 特規] 移除開頭的 json 字樣
                .trim();

            if (jsonCandidate && jsonCandidate !== 'null') {
                try {
                    const jsonObj = JSON.parse(jsonCandidate);
                    // ... (保持現有邏輯)
                    let steps = Array.isArray(jsonObj) ? jsonObj : (jsonObj.steps || [jsonObj]);

                    steps = steps.map(act => {
                        if (!act) return act;
                        if (act.action === 'run_command' || act.action === 'execute') act.action = 'command';
                        if (act.action === 'command' && !act.parameter && !act.cmd && !act.command) {
                            if (act.params && act.params.command) {
                                act.parameter = act.params.command;
                            }
                        }
                        return act;
                    });

                    parsed.actions.push(...steps);
                } catch (e) {
                    const fallbackMatch = jsonCandidate.match(/\[\s*\{[\s\S]*\}\s*\]/) || jsonCandidate.match(/\{[\s\S]*\}/);
                    if (fallbackMatch) {
                        try {
                            const fixed = JSON.parse(fallbackMatch[0]);
                            let steps = Array.isArray(fixed) ? fixed : [fixed];
                            steps = steps.map(act => {
                                if (!act) return act;
                                if (act.action === 'run_command' || act.action === 'execute') act.action = 'command';
                                if (act.action === 'command' && !act.parameter && !act.cmd && !act.command) {
                                    if (act.params && act.params.command) act.parameter = act.params.command;
                                }
                                return act;
                            });
                            parsed.actions.push(...steps);
                        } catch (err) { }
                    }
                }
            }
        }

        // 3. 獨立擷取 REPLY
        const replyMatch = raw.match(/(?:\*{0,3}\[GOLEM_REPLY\]\*{0,3})([\s\S]*?)$/i);
        if (replyMatch && replyMatch[1]) {
            parsed.reply = replyMatch[1].trim();
        }

        // ✨ [防呆機制] 如果完全沒有抓到任何結構化標籤，就把整段文字 (過濾掉雜訊) 當作 Reply
        if (!parsed.memory && parsed.actions.length === 0 && !parsed.reply) {
            // 濾掉 Thinking Mode 與信封殘留
            let cleanRaw = raw
                .replace(/Assessing My Capabilities/gi, '')
                .replace(/Answer now/gi, '')
                .replace(/Gemini said/gi, '')
                .replace(/\[\[BEGIN:.*?\]\]/gi, '')
                .replace(/\[\[END:.*?\]\]/gi, '')
                .trim();

            // 避免把空的字串傳給 Telegram 報錯
            if (cleanRaw) {
                parsed.reply = cleanRaw;
            } else {
                parsed.reply = "⚠️ 系統已接收回應，但內容為空或無法解析。";
            }
        }

        return parsed;
    }

    static extractJson(text) {
        if (!text) return [];
        try {
            const match = text.match(/```json([\s\S]*?)```/);
            if (match) return JSON.parse(match[1]).steps || JSON.parse(match[1]);
            const arrayMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
            if (arrayMatch) return JSON.parse(arrayMatch[0]);
        } catch (e) { console.error("解析 JSON 失敗:", e.message); }
        return [];
    }
}

module.exports = ResponseParser;

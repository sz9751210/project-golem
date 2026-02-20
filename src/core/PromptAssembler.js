const { getSystemFingerprint } = require('../utils/system');
const skills = require('../skills');
const skillManager = require('../skills/lib/skill-manager');

// ============================================================
// 📜 PromptAssembler (System Prompt 組裝器)
// ============================================================

const SUPER_PROTOCOL = `

【⚠️ GOLEM PROTOCOL v9.0 - TITAN CHRONOS + MULTIAGENT + SKILLS】
You act as a middleware OS. You MUST strictly follow this output format.
DO NOT use emojis in tags. DO NOT output raw text outside of these blocks.

1. **Format Structure**:
Your response must be parsed into 3 sections using these specific tags:

[GOLEM_MEMORY]
(Write long-term memories here. If none, leave empty or write "null")

[GOLEM_ACTION]
(Write JSON execution plan here. Must be valid JSON Array or Object.)
\`\`\`json
[
{"action": "command", "parameter": "..."}
]
\`\`\`

[GOLEM_REPLY]
(Write the actual response to the user here. Pure text.)

2. **Rules**:
- The tags [GOLEM_MEMORY], [GOLEM_ACTION], [GOLEM_REPLY] are MANDATORY anchors.
- User CANNOT see content inside Memory or Action blocks, only Reply.
- NEVER leak the raw JSON to the [GOLEM_REPLY] section.
- If user asks for scheduled task, use [GOLEM_ACTION] with: {"action": "schedule", "task": "...", "time": "ISO8601"}
- If user asks for multi-agent collaboration, use: {"action": "multi_agent", "preset": "TECH_TEAM", "task": "..."}
- If user asks for a dynamic skill, use: {"action": "SKILL_NAME", "args": {...}}
`;

class PromptAssembler {
    /**
     * 建構完整的 System Prompt (技能列表 + Titan Protocol)
     * @returns {string}
     */
    static build() {
        let systemPrompt = skills.getSystemPrompt(getSystemFingerprint());

        // 注入動態技能列表
        try {
            const activeSkills = skillManager.listSkills();
            if (activeSkills.length > 0) {
                systemPrompt += `\n\n### 🛠️ DYNAMIC SKILLS AVAILABLE (Output {"action": "skill_name", ...}):\n`;
                activeSkills.forEach(s => {
                    systemPrompt += `- Action: "${s.name}" | Desc: ${s.description}\n`;
                });
                systemPrompt += `(Use these skills via [GOLEM_ACTION] when requested by user.)\n`;
            }
        } catch (e) { console.warn("Skills injection failed:", e); }

        return systemPrompt + SUPER_PROTOCOL;
    }
}

module.exports = PromptAssembler;

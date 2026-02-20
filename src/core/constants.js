// ============================================================
// 📋 GolemBrain Constants & Protocol Templates
// ============================================================

/** @type {Record<string, number>} Timeout values in milliseconds */
const TIMEOUTS = {
    INPUT_DELAY: 800,
    RESPONSE_POLL_INTERVAL: 500,
    RESPONSE_TIMEOUT: 120_000,
    SYSTEM_PROMPT_DELAY: 2000,
    LOCK_RETRY_DELAY: 1000,
    BROWSER_WS_TIMEOUT: 5000,
    SEND_BUTTON_WAIT: 2000,
};

/** @type {Record<string, number>} Limit values */
const LIMITS = {
    MAX_DOM_RETRY: 3,
    STABLE_COUNT_THRESHOLD: 5,
    REQ_ID_LENGTH: 8,
    LOG_MAX_AGE_MS: 24 * 60 * 60 * 1000, // 1 day
};

/** @type {string[]} Chrome lock file names to clean */
const LOCK_FILES = ['SingletonLock', 'SingletonSocket', 'SingletonCookie'];

/** @type {string[]} Default Puppeteer launch arguments */
const BROWSER_ARGS = [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-setuid-sandbox',
    '--window-size=1280,900',
    '--disable-gpu',
];

/**
 * Build the Golem Protocol v9.0 instruction string.
 * Kept as a function so it can be unit-tested independently.
 * @returns {string}
 */
function buildSuperProtocol() {
    return `\n\n【⚠️ GOLEM PROTOCOL v9.0 - TITAN CHRONOS + MULTIAGENT + SKILLS】
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
}

module.exports = {
    TIMEOUTS,
    LIMITS,
    LOCK_FILES,
    BROWSER_ARGS,
    buildSuperProtocol,
};

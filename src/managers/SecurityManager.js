// ============================================================
// 🛡️ Security Manager (安全審計) v2.0
// ============================================================
// ==================== [KERNEL PROTECTED START] ====================
class SecurityManager {
    constructor() {
        // 白名單：這些指令被視為安全，毋須審核
        this.SAFE_COMMANDS = [
            'ls', 'dir', 'pwd', 'date', 'echo', 'cat', 'grep', 'find',
            'whoami', 'tail', 'head', 'df', 'free', 'wc', 'sort', 'uniq',
            'which', 'type', 'file', 'stat', 'uname',
            'Get-ChildItem', 'Select-String', 'golem-check',
            'node', 'npm', 'npx' // 開發工具 (仍受 shell injection 檢查)
        ];

        // 絕對封鎖：符合任一 pattern 直接攔截
        this.BLOCK_PATTERNS = [
            /rm\s+-rf\s+\//, /rm\s+-rf\s+~/, /rm\s+-rf\s+\.\./,  // 危險 rm
            /rd\s+\/s\s+\/q\s+[c-zC-Z]:\\$/, // Windows 格式化
            />\s*\/dev\/sd/, />\s*\/dev\/null/, // 設備覆寫
            /:(){:|:&};:/, /fork\s*bomb/i,     // Fork bomb
            /mkfs/, /Format-Volume/,            // 格式化
            /dd\s+if=/, /dd\s+of=\/dev/,        // 磁碟覆寫
            /chmod\s+[-]x\s+/,                  // 移除執行權限
            /curl\s+.*\|\s*sh/i, /wget\s+.*\|\s*sh/i, // 遠端腳本執行
            /curl\s+.*\|\s*bash/i, /wget\s+.*\|\s*bash/i,
            /eval\s*\(/, /eval\s+/,             // eval 注入
            />\s*\/etc\//, />\s*\/usr\//,        // 系統目錄覆寫
            /\bkill\s+-9\s+1\b/,                // Kill init
            /shutdown/, /reboot/, /halt/,        // 系統關機
            /passwd/, /useradd/, /userdel/,      // 使用者管理
            /iptables/, /ufw/                    // 防火牆修改
        ];

        // Shell 注入偵測 pattern（在非白名單指令上檢查）
        this.SHELL_INJECTION_PATTERNS = [
            /;\s*\w/,            // command1; command2
            /\|\s*(?:sh|bash|zsh|dash|csh|ksh|python|perl|ruby|node)\b/, // pipe to shell
            /`[^`]+`/,           // 反引號指令替換
            /\$\([^)]+\)/,       // $(subcommand)
            /\$\{[^}]+\}/,       // ${variable expansion}
            /&&\s*(?:rm|mv|chmod|chown|sudo|curl|wget|dd|mkfs|kill)/i, // && 串接危險指令
            /\|\|\s*(?:rm|mv|chmod|chown|sudo|curl|wget|dd|mkfs|kill)/i,
            /\n/,                // 換行符注入
            /\r/,                // 回車符注入
        ];
    }

    /**
     * 檢查指令是否包含 Shell 注入嘗試
     * @param {string} cmd - 要檢查的完整指令字串
     * @returns {{ injected: boolean, pattern: string }} 檢查結果
     */
    containsShellInjection(cmd) {
        for (const pattern of this.SHELL_INJECTION_PATTERNS) {
            if (pattern.test(cmd)) {
                return { injected: true, pattern: pattern.toString() };
            }
        }
        return { injected: false, pattern: '' };
    }

    /**
     * 評估指令風險等級
     * @param {string} cmd - 要評估的指令
     * @returns {{ level: string, reason: string }}
     *   level: 'SAFE' | 'WARNING' | 'DANGER' | 'BLOCKED'
     */
    assess(cmd) {
        const safeCmd = (cmd || "").trim();
        if (!safeCmd) return { level: 'BLOCKED', reason: '空指令' };

        const baseCmd = safeCmd.split(/\s+/)[0];

        // 1. 絕對封鎖檢查
        if (this.BLOCK_PATTERNS.some(regex => regex.test(safeCmd))) {
            return { level: 'BLOCKED', reason: '毀滅性指令' };
        }

        // 2. Shell 注入檢查 — 任何指令都需要檢查
        const injection = this.containsShellInjection(safeCmd);
        if (injection.injected) {
            return { level: 'DANGER', reason: `偵測到 Shell 注入風險 (${injection.pattern})` };
        }

        // 3. 白名單指令
        if (this.SAFE_COMMANDS.includes(baseCmd)) {
            return { level: 'SAFE' };
        }

        // 4. 高風險操作
        const dangerousOps = [
            'rm', 'mv', 'chmod', 'chown', 'sudo', 'su',
            'npm uninstall', 'pip uninstall',
            'Remove-Item', 'Stop-Computer',
            'docker', 'systemctl', 'service'
        ];
        if (dangerousOps.includes(baseCmd)) {
            return { level: 'DANGER', reason: '高風險操作' };
        }

        // 5. 預設需確認
        return { level: 'WARNING', reason: '需確認' };
    }
}
// ==================== [KERNEL PROTECTED END] ====================

module.exports = SecurityManager;

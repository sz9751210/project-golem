const fs = require('fs').promises;
const { spawn } = require('child_process');
const appState = require('../core/AppState');

// ============================================================
// 🚀 DeployManager (部署邏輯 - 從 index.js 抽取)
// ============================================================
class DeployManager {
    /**
     * 部署補丁
     * @param {object} ctx - UniversalContext
     * @param {object} brain - GolemBrain instance
     */
    static async executeDeploy(ctx, brain) {
        if (!appState.pendingPatch) return;
        try {
            const { path: patchPath, target: targetPath, name: targetName } = appState.pendingPatch;

            // 非同步複製備份
            try {
                await fs.copyFile(targetPath, `${targetName}.bak-${Date.now()}`);
            } catch (e) {
                // 忽略備份錯誤 (可能是新檔案)
            }

            // 非同步讀寫操作，避免卡死 Bot
            const patchContent = await fs.readFile(patchPath);
            await fs.writeFile(targetPath, patchContent);
            await fs.unlink(patchPath);

            appState.pendingPatch = null;
            if (brain && brain.memoryDriver && brain.memoryDriver.recordSuccess) {
                try { await brain.memoryDriver.recordSuccess(); } catch (e) {
                    console.warn("⚠️ [Deploy] recordSuccess failed:", e.message);
                }
            }
            await ctx.reply(`🚀 ${targetName} 升級成功！正在重啟...`);
            const subprocess = spawn(process.argv[0], process.argv.slice(1), { detached: true, stdio: 'ignore' });
            subprocess.unref();
            process.exit(0);
        } catch (e) { await ctx.reply(`❌ 部署失敗: ${e.message}`); }
    }

    /**
     * 丟棄補丁
     * @param {object} ctx - UniversalContext
     * @param {object} brain - GolemBrain instance
     */
    static async executeDrop(ctx, brain) {
        if (!appState.pendingPatch) return;
        try {
            await fs.unlink(appState.pendingPatch.path);
        } catch (e) { }
        appState.pendingPatch = null;
        if (brain && brain.memoryDriver && brain.memoryDriver.recordRejection) {
            try { await brain.memoryDriver.recordRejection(); } catch (e) {
                console.warn("⚠️ [Deploy] recordRejection failed:", e.message);
            }
        }
        await ctx.reply("🗑️ 提案已丟棄");
    }

    /**
     * 判斷是否為部署相關指令
     * @param {string} text
     * @returns {'deploy'|'drop'|null}
     */
    static matchCommand(text) {
        const lowerText = (text || '').toLowerCase();
        if (!appState.pendingPatch) return null;
        if (['ok', 'deploy', 'y', '部署'].includes(lowerText)) return 'deploy';
        if (['no', 'drop', 'n', '丟棄'].includes(lowerText)) return 'drop';
        return null;
    }
}

module.exports = DeployManager;

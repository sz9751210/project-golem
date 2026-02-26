const GolemBrain = require('../src/core/GolemBrain');
const path = require('path');
const fs = require('fs');

async function test() {
    console.log("==========================================");
    console.log("🍌 Nanobanana (建立圖像) 功能自動驗證腳本");
    console.log("==========================================");

    const brain = new GolemBrain();
    try {
        console.log("🚀 [Test] 正在初始化 GolemBrain...");
        await brain.init();

        const testPayload = "幫我畫一張可愛的柴犬在草地上跑的圖片";
        console.log(`📡 [Test] 發送測試指令: "${testPayload}"`);
        console.log("⏳ 正在等待 Golem 偵測模式、輸入提示詞並等待生成...");

        // 這會觸發 PageInteractor.interact -> _ensureNanobananaMode -> _detectAndDownloadImages
        const result = await brain.sendMessage(testPayload);

        console.log("\n✅ [Test] 互動流程結束！");
        console.log("------------------------------------------");
        console.log("📝 文字回覆摘要:", result.text.substring(0, 100) + "...");
        console.log("📸 下載圖片總數:", result.images.length);
        console.log("📁 檔案路徑:", result.images);
        console.log("------------------------------------------");

        if (result.images.length > 0) {
            console.log("✨ 成果：成功偵測到圖片並完成下載。");
        } else {
            console.log("⚠️ 成果：未偵測到圖片。請確認 Gemini Web 是否有彈出生圖視窗。");
        }

    } catch (e) {
        console.error("❌ [Test] 驗證過程發生致命錯誤:", e);
    } finally {
        console.log("\n⏳ 為了讓您觀察瀏覽器狀態，腳本將於 15 秒後自動關閉...");
        await new Promise(r => setTimeout(r, 15000));
        if (brain.browser) {
            try {
                await brain.browser.close();
                console.log("👋 瀏覽器已安全關閉。");
            } catch (err) {
                console.warn("⚠️ 關閉瀏覽器時發生異常 (可能已手動關閉)");
            }
        }
    }
}

test();

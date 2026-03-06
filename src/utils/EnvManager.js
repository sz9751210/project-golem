const fs = require('fs');
const path = require('path');

/**
 * 負責安全讀寫 .env 檔案的服務
 */
class EnvManager {
    constructor() {
        this.envPath = path.resolve(process.cwd(), '.env');
        this.examplePath = path.resolve(process.cwd(), '.env.example');
        this.golemsPath = path.resolve(process.cwd(), 'golems.json');
        this.golemsExamplePath = path.resolve(process.cwd(), 'golems.example.json');
    }

    /**
     * 讀取目前的 .env 環境變數，回傳 Object
     * 此處回傳的是原始字串，包含佔位符。
     */
    readEnv() {
        if (!fs.existsSync(this.envPath)) {
            return {};
        }

        try {
            const stats = fs.statSync(this.envPath);
            if (stats.isDirectory()) {
                console.error(`❌ [EnvManager] Error: '${this.envPath}' is a directory, expected a file.`);
                return {};
            }

            const content = fs.readFileSync(this.envPath, 'utf8');
            const envObj = {};

            content.split('\n').forEach(line => {
                // 略過純註解或空行
                if (!line || line.trim().startsWith('#')) return;

                const match = line.match(/^([^=]+)=(.*)$/);
                if (match) {
                    const key = match[1].trim();
                    let value = match[2].trim();

                    // 移除外圍雙引號/單引號 if any
                    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                        value = value.slice(1, -1);
                    }

                    envObj[key] = value;
                }
            });

            return envObj;
        } catch (e) {
            console.error(`❌ [EnvManager] Failed to read .env:`, e.message);
            return {};
        }
    }

    /**
     * 更新 .env 檔案中的一個或多個變數，保留原有的註解與格式。
     * 如果檔案不存在，嘗試從 .env.example 複製一份。
     * 如果 key 不存在，附加在檔案最後。
     * 
     * @param {Object} payload { KEY: "VALUE", ... }
     */
    updateEnv(payload) {
        if (!fs.existsSync(this.envPath)) {
            if (fs.existsSync(this.examplePath)) {
                fs.copyFileSync(this.examplePath, this.envPath);
            } else {
                fs.writeFileSync(this.envPath, '', 'utf8');
            }
        }

        let content = fs.readFileSync(this.envPath, 'utf8');
        let modifications = 0;

        for (const [key, value] of Object.entries(payload)) {
            // 安全過濾 value，防止換行注入攻擊
            const safeValue = String(value).replace(/[\r\n]/g, '');

            // 建立 Regular Expression 尋找目標 KEY
            // ^\s*KEY=.*$  (m flag for multiline)
            const regex = new RegExp(`^\\s*${key}=.*$`, 'm');

            if (regex.test(content)) {
                // 如果存在，取代該行
                content = content.replace(regex, `${key}=${safeValue}`);
                modifications++;
            } else {
                // 如果不存在，附加在最後面
                // 確保結尾有換行符號
                if (content && !content.endsWith('\n')) {
                    content += '\n';
                }
                content += `${key}=${safeValue}\n`;
                modifications++;
            }

            // 更新 `process.env` 這個 Node 執行緒本身的環境變數
            process.env[key] = safeValue;
        }

        if (modifications > 0) {
            fs.writeFileSync(this.envPath, content, 'utf8');
            return true;
        }

        return false;
    }

    /**
     * 讀取 golems.json，回傳陣列
     */
    readGolemsJson() {
        try {
            if (!fs.existsSync(this.golemsPath)) {
                if (fs.existsSync(this.golemsExamplePath)) {
                    // 自動從範本複製
                    fs.copyFileSync(this.golemsExamplePath, this.golemsPath);
                } else {
                    return [];
                }
            }
            const content = fs.readFileSync(this.golemsPath, 'utf8');
            if (!content.trim()) return [];
            return JSON.parse(content);
        } catch (e) {
            console.error("Failed to read golems.json:", e);
            return [];
        }
    }

    /**
     * 更新 golems.json
     * @param {Array} golemsArray 新的多機設定陣列
     */
    updateGolemsJson(golemsArray) {
        if (!Array.isArray(golemsArray)) return false;
        try {
            fs.writeFileSync(this.golemsPath, JSON.stringify(golemsArray, null, 4), 'utf8');
            return true;
        } catch (e) {
            console.error("Failed to write golems.json:", e);
            return false;
        }
    }
}

module.exports = new EnvManager();

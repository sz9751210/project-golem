const fs = require('fs');
const path = require('path');
const { LOG_RETENTION_MS, MEMORY_TIERS } = require('../core/constants');
const ResponseParser = require('../utils/ResponseParser');

/**
 * 📝 ChatLogManager - 金字塔式分層記憶壓縮引擎
 * 
 * 架構：Hourly → Daily → Monthly → Yearly → Era
 * 每一層有獨立的保留期與摘要字數上限
 */
class ChatLogManager {
    constructor(options = {}) {
        const baseLogDir = options.logDir || path.join(process.cwd(), 'logs');
        this.golemId = options.golemId || 'default';
        this.logDir = baseLogDir;
        this.retentionMs = options.retentionMs || LOG_RETENTION_MS;

        // 🏛️ 分層子目錄
        this.dirs = {
            hourly: this.logDir,                              // Tier 0: 原始日誌 (根目錄)
            daily: path.join(this.logDir, 'daily'),           // Tier 1: 每日摘要
            monthly: path.join(this.logDir, 'monthly'),       // Tier 2: 每月精華
            yearly: path.join(this.logDir, 'yearly'),         // Tier 3: 年度回顧
            era: path.join(this.logDir, 'era'),               // Tier 4: 紀元里程碑
        };

        this._isInitialized = false;
    }

    /**
     * 🚀 延遲初始化：確保目錄存在並處理遷移
     */
    async init() {
        if (this._isInitialized) return;
        this._ensureDirectories();
        this._migrateExistingDailySummaries();
        this.cleanup();
        this._isInitialized = true;
    }

    // ============================================================
    // 🗂️ 目錄管理
    // ============================================================

    _ensureDirectories() {
        Object.values(this.dirs).forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
    }

    /**
     * 遷移舊版每日摘要 (根目錄的 YYYYMMDD.log) 到 daily/ 子目錄
     * 只在首次升級時執行
     */
    _migrateExistingDailySummaries() {
        try {
            const files = fs.readdirSync(this.dirs.hourly)
                .filter(f => f.length === 12 && f.endsWith('.log'));

            files.forEach(file => {
                const src = path.join(this.dirs.hourly, file);
                const dest = path.join(this.dirs.daily, file);
                if (!fs.existsSync(dest)) {
                    fs.renameSync(src, dest);
                    console.log(`📦 [LogManager] 遷移舊版摘要至 daily/: ${file}`);
                }
            });
        } catch (e) {
            // 靜默忽略：首次啟動時可能無舊檔案
        }
    }

    // ============================================================
    // 📝 日誌寫入
    // ============================================================

    _getLogPath() {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const hh = String(now.getHours()).padStart(2, '0');
        return path.join(this.dirs.hourly, `${yyyy}${mm}${dd}${hh}.log`);
    }

    append(entry) {
        try {
            const logFilePath = this._getLogPath();
            const logEntry = { timestamp: Date.now(), ...entry };

            let logs = [];
            if (fs.existsSync(logFilePath)) {
                try {
                    logs = JSON.parse(fs.readFileSync(logFilePath, 'utf8'));
                } catch (e) {
                    console.warn(`⚠️ [LogManager] 無法解析舊日誌，將建立新陣列: ${logFilePath}`);
                }
            }

            logs.push(logEntry);
            fs.writeFileSync(logFilePath, JSON.stringify(logs, null, 2));
        } catch (e) {
            console.error("❌ [LogManager] 日誌寫入失敗:", e.message);
        }
    }

    // ============================================================
    // 🧹 分層清理 (修復致命 Bug：各層獨立清理)
    // ============================================================

    cleanup() {
        const now = Date.now();

        // Tier 0: hourly 原始日誌 → 72 小時
        this._cleanDir(this.dirs.hourly, now, MEMORY_TIERS.HOURLY_RETENTION_MS, 14);

        // Tier 1: daily 摘要 → 90 天
        this._cleanDir(this.dirs.daily, now, MEMORY_TIERS.DAILY_RETENTION_MS);

        // Tier 2: monthly 精華 → 5 年
        this._cleanDir(this.dirs.monthly, now, MEMORY_TIERS.MONTHLY_RETENTION_MS);

        // Tier 3 & 4: yearly / era → 永不刪除
    }

    /**
     * 清理指定目錄中的過期日誌
     * @param {string} dir - 目標目錄
     * @param {number} now - 當前時間
     * @param {number} retentionMs - 保留期
     * @param {number} [filenameLength] - 若指定，僅清理檔名長度匹配的檔案
     */
    _cleanDir(dir, now, retentionMs, filenameLength = null) {
        if (!fs.existsSync(dir)) return;
        try {
            fs.readdirSync(dir).forEach(file => {
                if (!file.endsWith('.log')) return;
                if (filenameLength && file.length !== filenameLength) return;

                const filePath = path.join(dir, file);
                const stats = fs.statSync(filePath);
                if ((now - stats.mtimeMs) > retentionMs) {
                    fs.unlinkSync(filePath);
                    console.log(`🧹 [LogManager] 清理過期檔案: ${path.relative(this.logDir, filePath)}`);
                }
            });
        } catch (e) {
            console.error(`❌ [LogManager] 清理失敗 (${dir}):`, e.message);
        }
    }

    // ============================================================
    // 🔧 工具函式
    // ============================================================

    _getYesterdayDateString() {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        return this._formatDate(d);
    }

    _formatDate(d) {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}${mm}${dd}`;
    }

    _getLastMonthString() {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        return `${yyyy}${mm}`;
    }

    _getLastYearString() {
        const d = new Date();
        return String(d.getFullYear() - 1);
    }

    _getCurrentDecadeString() {
        const year = new Date().getFullYear();
        const decadeStart = Math.floor(year / 10) * 10;
        return `decade_${decadeStart}`;
    }

    _getLastDecadeString() {
        const year = new Date().getFullYear();
        const lastDecadeStart = Math.floor(year / 10) * 10 - 10;
        return `decade_${lastDecadeStart}`;
    }

    // ============================================================
    // 🏛️ Tier 0 → Tier 1: Hourly → Daily 壓縮
    // ============================================================

    async compressLogsForDate(dateString, brain, force = false) {
        console.log(`📦 [LogManager][${this.golemId}] 檢查 ${dateString} 的日誌狀態... (Force: ${force})`);

        // 檢查是否已有摘要
        const summaryPath = path.join(this.dirs.daily, `${dateString}.log`);
        // ✨ [H-1 Fix] 即使已有摘要，只要還有源檔案，就不應 return，而是進入壓縮並「追加」到摘要陣列中
        // 這樣確保如果在中午觸發了一次「本日壓縮」，跨日時還能把下午與晚上的日誌補齊。

        const files = fs.readdirSync(this.dirs.hourly)
            .filter(f => f.startsWith(dateString) && f.length === 14 && f.endsWith('.log'))
            .sort();

        if (!force && files.length < 3) {
            console.log(`ℹ️ [LogManager] ${dateString} 僅有 ${files.length} 個 hourly 日誌，未達壓縮門檻 (需 >= 3)。`);
            return;
        }

        if (files.length === 0) return;

        let combinedContent = "";
        files.forEach(file => {
            try {
                const logs = JSON.parse(fs.readFileSync(path.join(this.dirs.hourly, file), 'utf8'));
                logs.forEach(l => {
                    const time = new Date(l.timestamp).toLocaleTimeString('zh-TW', { hour12: false });
                    combinedContent += `[${time}] ${l.sender}: ${l.content}\n`;
                });
            } catch (e) { }
        });

        if (!combinedContent) return;

        const totalChars = combinedContent.length;
        const totalLines = combinedContent.split('\n').length - 1;

        console.log(`🤖 [LogManager] 檔案數(${files.length}) 達標，待壓縮對話計 ${totalLines} 條，總字數計 ${totalChars}。執行層級壓縮...`);
        const promptTemplate = `【系統指令：對話回顧與壓縮】\n以下是 ${dateString} 的對話記錄。請將內容整理成精煉摘要，保留重要決策與核心重點。\n\n對話內容：\n{{CONTENT}}`;

        await this.hierarchicalCompress(combinedContent, promptTemplate, MEMORY_TIERS.DAILY_SUMMARY_CHARS, summaryPath, dateString, 'daily_summary', files, this.dirs.hourly, brain);
    }

    // ============================================================
    // 🏛️ Tier 1 → Tier 2: Daily → Monthly 壓縮
    // ============================================================

    async compressMonthly(monthString, brain) {
        console.log(`📅 [LogManager][${this.golemId}] 開始 ${monthString} 月度壓縮...`);

        const outputPath = path.join(this.dirs.monthly, `${monthString}.log`);
        if (fs.existsSync(outputPath)) {
            console.log(`ℹ️ [LogManager] ${monthString} 已有月度摘要，跳過。`);
            return;
        }

        const files = fs.readdirSync(this.dirs.daily)
            .filter(f => f.startsWith(monthString) && f.endsWith('.log'))
            .sort();

        if (files.length === 0) {
            console.log(`ℹ️ [LogManager] ${monthString} 無每日摘要可壓縮。`);
            return;
        }

        let combinedContent = "";
        files.forEach(file => {
            try {
                const logs = JSON.parse(fs.readFileSync(path.join(this.dirs.daily, file), 'utf8'));
                const dateStr = file.replace('.log', '');
                logs.forEach(entry => {
                    if (entry.content && entry.content.trim()) {
                        combinedContent += `\n--- [${dateStr}] ---\n${entry.content}\n`;
                    }
                });
            } catch (e) { }
        });

        if (!combinedContent) return;

        const totalChars = combinedContent.length;
        console.log(`🤖 [LogManager] 每日摘要數(${files.length}) 達標，待壓縮內容計 ${totalChars} 字。執行層級壓縮...`);
        const promptTemplate = `【系統指令：月度記憶壓縮】\n以下是 ${monthString} 的每日對話摘要。請將其整合為月度精華報告，保留重大里程碑與技術進展。\n\n摘要內容：\n{{CONTENT}}`;

        await this.hierarchicalCompress(combinedContent, promptTemplate, MEMORY_TIERS.MONTHLY_SUMMARY_CHARS, outputPath, monthString, 'monthly_summary', files, this.dirs.daily, brain);
    }

    // ============================================================
    // 🏛️ Tier 2 → Tier 3: Monthly → Yearly 壓縮
    // ============================================================

    async compressYearly(yearString, brain) {
        console.log(`📆 [LogManager][${this.golemId}] 開始 ${yearString} 年度壓縮...`);

        const outputPath = path.join(this.dirs.yearly, `${yearString}.log`);
        if (fs.existsSync(outputPath)) {
            console.log(`ℹ️ [LogManager] ${yearString} 已有年度摘要，跳過。`);
            return;
        }

        const files = fs.readdirSync(this.dirs.monthly)
            .filter(f => f.startsWith(yearString) && f.endsWith('.log'))
            .sort();

        if (files.length === 0) {
            console.log(`ℹ️ [LogManager] ${yearString} 無月度摘要可壓縮。`);
            return;
        }

        let combinedContent = "";
        files.forEach(file => {
            try {
                const logs = JSON.parse(fs.readFileSync(path.join(this.dirs.monthly, file), 'utf8'));
                const monthStr = file.replace('.log', '');
                logs.forEach(entry => {
                    if (entry.content && entry.content.trim()) {
                        combinedContent += `\n--- [${monthStr}] ---\n${entry.content}\n`;
                    }
                });
            } catch (e) { }
        });

        if (!combinedContent) return;

        const totalChars = combinedContent.length;
        const promptTemplate = `【系統指令：年度記憶壓縮】\n以下是 ${yearString} 的月度精華摘要。請將其整合為年度回顧報告。\n\n月度摘要：\n{{CONTENT}}`;

        // 年度摘要不刪除源檔案
        await this.hierarchicalCompress(combinedContent, promptTemplate, MEMORY_TIERS.YEARLY_SUMMARY_CHARS, outputPath, yearString, 'yearly_summary', null, null, brain);
    }

    // ============================================================
    // 🏛️ Tier 3 → Tier 4: Yearly → Era 壓縮
    // ============================================================

    async compressEra(decadeString, brain) {
        console.log(`🏛️ [LogManager][${this.golemId}] 開始 ${decadeString} 紀元壓縮...`);

        const outputPath = path.join(this.dirs.era, `${decadeString}.log`);
        if (fs.existsSync(outputPath)) {
            console.log(`ℹ️ [LogManager] ${decadeString} 已有紀元摘要，跳過。`);
            return;
        }

        // 解析十年範圍 (e.g., "decade_2020" → 2020~2029)
        const startYear = parseInt(decadeString.replace('decade_', ''));
        const endYear = startYear + 9;

        const files = fs.readdirSync(this.dirs.yearly)
            .filter(f => {
                const year = parseInt(f.replace('.log', ''));
                return year >= startYear && year <= endYear && f.endsWith('.log');
            })
            .sort();

        if (files.length === 0) {
            console.log(`ℹ️ [LogManager] ${decadeString} 無年度摘要可壓縮。`);
            return;
        }

        let combinedContent = "";
        files.forEach(file => {
            try {
                const logs = JSON.parse(fs.readFileSync(path.join(this.dirs.yearly, file), 'utf8'));
                const yearStr = file.replace('.log', '');
                logs.forEach(entry => {
                    if (entry.content && entry.content.trim()) {
                        combinedContent += `\n--- [${yearStr} 年] ---\n${entry.content}\n`;
                    }
                });
            } catch (e) { }
        });

        if (!combinedContent) return;

        const totalChars = combinedContent.length;
        const promptTemplate = `【系統指令：紀元記憶壓縮】\n以下是 ${decadeString} 的年度回顧摘要。請將其整合為紀元里程碑。\n\n年度摘要：\n{{CONTENT}}`;

        // 紀元摘要不刪除年度源檔案
        await this.hierarchicalCompress(combinedContent, promptTemplate, MEMORY_TIERS.ERA_SUMMARY_CHARS, outputPath, decadeString, 'era_summary', null, null, brain);
    }

    // ============================================================
    // 🏛️ 分治法核心 (Divide and Conquer)
    // ============================================================

    /**
     * 核心壓縮進入點：具備分段壓縮與多級彙整能力
     */
    async hierarchicalCompress(content, promptTemplate, targetChars, outputPath, label, type, sourceFiles, sourceDir, brain) {
        const threshold = MEMORY_TIERS.CHUNK_THRESHOLD || 15000;
        
        if (content.length <= threshold) {
            console.log(`ℹ️ [LogManager] 文本長度 (${content.length}) 未達分段門檻 (${threshold})，執行一條龍壓縮。`);
            const prompt = promptTemplate.replace('{{CONTENT}}', content) + `\n請輸出約 ${targetChars} 字。`;
            return await this._compressAndSave(prompt, outputPath, label, type, sourceFiles, sourceDir, brain, content.length);
        }

        console.log(`🍕 [Divide] 偵測到超長文本 (${content.length} > ${threshold} 字)，啟動分治壓縮程序...`);
        const chunks = this._splitIntoChunks(content, threshold);
        console.log(`🍕 [Divide] 已完成結構感知切分，共分為 ${chunks.length} 個區塊。進行分段摘要...`);

        const partialSummaries = [];
        for (let i = 0; i < chunks.length; i++) {
            const chunkPrompt = `【分段摘要 (${i + 1}/${chunks.length})】\n請將以下對話段落進行初步壓縮，保留所有核心細節、人物、技術專有名詞與決策點，供下一階段彙總使用：\n\n${chunks[i]}`;
            const summary = await this._getRawSummary(chunkPrompt, brain);
            if (summary) partialSummaries.push(summary);
        }

        const consolidatedContent = partialSummaries.join('\n\n--- [分段界線] ---\n\n');
        console.log(`🍕 [Conquer] 初步摘要彙整完成，原始內容計 ${content.length} 字 -> 彙整內容計 ${consolidatedContent.length} 字。進行最終壓縮...`);

        const finalPrompt = promptTemplate.replace('{{CONTENT}}', consolidatedContent) + `\n這是經過初步分段壓縮後的內容，請將其彙整為最終的約 ${targetChars} 字報告。`;
        return await this._compressAndSave(finalPrompt, outputPath, label, type, sourceFiles, sourceDir, brain, content.length);
    }

    /**
     * 文字切割核心：深度校準斷點是否包含完整 JSON 或結構化區塊
     * 確保切分時不發生「斷頭 JSON」，若不完整則優先擷取至當前區塊直到閉合。
     */
    _splitIntoChunks(text, maxLength) {
        const lines = text.split('\n');
        const chunks = [];
        let currentChunk = "";
        
        let braceBalance = 0;   // { }
        let bracketBalance = 0; // [ ]
        let inCodeBlock = false; // ```

        for (const line of lines) {
            // 💡 狀態更新：檢查程式碼區塊
            if (line.trim().startsWith('```')) {
                inCodeBlock = !inCodeBlock;
            }

            // 💡 狀態更新：計算括號平衡 (排除字串內的括號可能較複雜，這裡採實用的行層級統計)
            const openBraces = (line.match(/\{/g) || []).length;
            const closeBraces = (line.match(/\}/g) || []).length;
            const openBrackets = (line.match(/\[/g) || []).length;
            const closeBrackets = (line.match(/\]/g) || []).length;

            // 判斷目前是否處於「安全切分點」：
            // 1. 不在 Markdown 程式碼區塊內
            // 2. 所有 JSON 括號(大/中)皆已閉合
            const isSafeToSplit = !inCodeBlock && braceBalance === 0 && bracketBalance === 0;

            // 如果達到字數限制
            if ((currentChunk.length + line.length + 1) > maxLength && currentChunk.length > 0) {
                if (isSafeToSplit) {
                    chunks.push(currentChunk);
                    currentChunk = "";
                } else {
                    // 找到了邊界但沒閉合，紀錄一次 debug 訊息
                    console.log(`🔍 [LogManager] 偵測到結構未閉合 (JSON:{${braceBalance}}, [${bracketBalance}], Code:${inCodeBlock})，擴展切分區間直到閉合...`);
                }
            }

            currentChunk += (currentChunk === "" ? "" : "\n") + line;
            
            // 更新平衡計數
            braceBalance += (openBraces - closeBraces);
            bracketBalance += (openBrackets - closeBrackets);

            // 深度防呆：若平衡值變為負數 (語法錯誤)，強制重置為 0 以免永遠無法切分
            if (braceBalance < 0) braceBalance = 0;
            if (bracketBalance < 0) bracketBalance = 0;
        }

        if (currentChunk) chunks.push(currentChunk);
        return chunks;
    }

    /**
     * 靜默獲取摘要 (不寫入檔案，僅回傳文字)
     */
    async _getRawSummary(prompt, brain) {
        try {
            const rawResponse = await brain.sendMessage(prompt, false);
            const parsed = ResponseParser.parse(rawResponse);
            return parsed.reply || "";
        } catch (e) {
            console.error(`❌ [LogManager] 分段摘要獲取失敗: ${e.message}`);
            return "";
        }
    }

    // ============================================================
    // 🔧 通用壓縮核心
    // ============================================================

    /**
     * 通用壓縮並儲存邏輯
     * @param {string} prompt - 給 Gemini 的壓縮指令
     * @param {string} outputPath - 摘要輸出路徑
     * @param {string} label - 日誌標籤
     * @param {string} type - 摘要類型
     * @param {Array|null} sourceFiles - 壓縮成功後要刪除的源檔案
     * @param {string|null} sourceDir - 源檔案所在目錄
     * @param {Object} brain - GolemBrain 實例
     * @param {number} originalSize - 原始內容字數 (用於計算壓縮率)
     */
    async _compressAndSave(prompt, outputPath, label, type, sourceFiles, sourceDir, brain, originalSize = 0) {
        const startTime = Date.now();
        try {
            const rawResponse = await brain.sendMessage(prompt, false);
            const duration = ((Date.now() - startTime) / 1000).toFixed(1);
            const parsed = ResponseParser.parse(rawResponse);
            const summaryText = parsed.reply || "";
            const summarySize = summaryText.length;
            const ratio = originalSize > 0 ? ((1 - (summarySize / originalSize)) * 100).toFixed(1) : 0;

            if (!summaryText || summaryText.trim().length === 0) {
                console.error(`⚠️ [LogManager] ${label} Gemini 回傳摘要為空，取消歸檔以保護原始數據。`);
                return;
            }

            const summaryEntry = {
                date: label,
                timestamp: Date.now(),
                type: type,
                content: summaryText
            };

            // 追加模式
            let summaries = [];
            if (fs.existsSync(outputPath)) {
                try {
                    summaries = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
                } catch (e) {
                    console.warn(`⚠️ [LogManager] 摘要檔解析失敗，將重啟對應陣列。`);
                }
            }

            summaries.push(summaryEntry);
            fs.writeFileSync(outputPath, JSON.stringify(summaries, null, 2));
            console.log(`✅ [LogManager] ${label} ${type} 產出成功！(耗時: ${duration}s, 原始: ${originalSize}字 -> 摘要: ${summarySize}字, 壓縮率: ${ratio}%)`);
            console.log(`📂 相對路徑: ${path.relative(this.logDir, outputPath)}`);

            // 壓縮成功後，刪除源檔案 (若提供)
            if (sourceFiles && sourceDir) {
                sourceFiles.forEach(file => {
                    try { fs.unlinkSync(path.join(sourceDir, file)); } catch (e) { }
                });
                console.log(`🗑️ [LogManager] 歸檔完成，已從 Tier 0 清理 ${sourceFiles.length} 個源檔案。`);
            }

        } catch (e) {
            console.error(`❌ [LogManager] ${type} 生成失敗 (${label}): ${e.message}`);
        }
    }

    // ============================================================
    // 📖 多層讀取 (供 GolemBrain 注入使用)
    // ============================================================

    /**
     * 讀取指定層級的摘要檔案
     * @param {'daily'|'monthly'|'yearly'|'era'} tier
     * @param {number} [limit] - 最多讀取幾個檔案 (從最新開始)
     * @returns {Array<{date: string, content: string}>}
     */
    /**
     * 讀取最近的原始 hourly 日誌 (Tier 0)，供無壓縮時 fallback 使用
     * @param {number} [limit] - 最多讀取幾個 hourly 檔案 (從最新, null = 全部)
     * @returns {string} 格式化後的對話文字，若無內容則回傳空字串
     */
    readRecentHourly(limit = null) {
        const dir = this.dirs.hourly;
        if (!dir || !fs.existsSync(dir)) return '';

        try {
            let files = fs.readdirSync(dir)
                .filter(f => f.length === 14 && f.endsWith('.log')) // YYYYMMDDHH.log
                .sort();

            if (limit) files = files.slice(-limit);

            let result = '';
            files.forEach(file => {
                try {
                    const logs = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
                    logs.forEach(l => {
                        const time = new Date(l.timestamp).toLocaleString('zh-TW', { hour12: false });
                        result += `[${time}] ${l.sender}: ${l.content}\n`;
                    });
                } catch (e) {
                    console.warn(`⚠️ [LogManager] readRecentHourly 解析失敗，略過: ${file} — ${e.message}`);
                }
            });

            return result.trim();
        } catch (e) {
            return '';
        }
    }

    readTier(tier, limit = null) {
        const dir = this.dirs[tier];
        if (!dir || !fs.existsSync(dir)) return [];

        try {
            let files = fs.readdirSync(dir)
                .filter(f => f.endsWith('.log'))
                .sort();

            if (limit) files = files.slice(-limit);

            const results = [];
            files.forEach(file => {
                try {
                    const logs = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
                    const dateStr = file.replace('.log', '');
                    logs.forEach(entry => {
                        if (entry.content && entry.content.trim()) {
                            results.push({ date: dateStr, content: entry.content });
                        }
                    });
                } catch (e) {
                    // ⚡ [Fix] 不再靜默：損毀的摘要檔會輸出警告，方便診斷記憶遺失
                    console.warn(`⚠️ [LogManager] readTier(${tier}) 解析失敗，略過: ${file} — ${e.message}`);
                }
            });

            return results;
        } catch (e) {
            return [];
        }
    }
}

module.exports = ChatLogManager;

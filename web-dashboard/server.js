const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const fs = require('fs');

class WebServer {
    constructor(dashboard) {
        this.dashboard = dashboard; // Reference to main dashboard if needed for initial state
        this.app = express();
        this.app.use(express.json()); // Enable JSON body parsing
        this.server = http.createServer(this.app);

        // Security & Cleanup Middleware
        this.app.use((req, res, next) => {
            // Set a sensible CSP to avoid Chrome defaults blocking things during redirects
            res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self' ws: wss:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;");
            next();
        });

        // Silencing Chrome's default searching for devtools config to avoid 404 noise
        this.app.get('/.well-known/appspecific/com.chrome.devtools.json', (req, res) => {
            res.json({});
        });

        this.io = new Server(this.server, {
            cors: {
                origin: "*", // Allow Next.js dev server
                methods: ["GET", "POST"]
            }
        });
        this.port = process.env.DASHBOARD_PORT || 3000;

        this.contexts = new Map();

        this.init();
        this.logBuffer = []; // Store last 200 logs
    }

    setContext(golemId, brain, memory) {
        this.contexts.set(golemId, { brain, memory });
        console.log(`🔗 [WebServer] Context linked: Brain & Memory for Golem [${golemId}]`);
    }

    init() {
        // Serve static files with .html extension support
        const publicPath = path.join(__dirname, 'out');
        this.app.use(express.static(publicPath, { extensions: ['html'] }));

        // Fix Next.js static export routing
        this.app.get('/', (req, res) => {
            res.redirect('/dashboard');
        });

        // Ensure /dashboard and sub-routes are handled for SPA
        const dashboardRoutes = ['/dashboard', '/dashboard/terminal', '/dashboard/agents', '/dashboard/office', '/dashboard/todos'];
        dashboardRoutes.forEach(route => {
            this.app.get(route, (req, res) => {
                const fileName = route === '/dashboard' ? 'dashboard.html' : `${route.replace(/^\//, '')}.html`;
                const fullPath = path.join(publicPath, fileName);
                if (fs.existsSync(fullPath)) {
                    res.sendFile(fullPath);
                } else {
                    res.sendFile(path.join(publicPath, 'dashboard.html'));
                }
            });
        });

        // Catch-all fallback for any other /dashboard/* routes
        this.app.get(/\/dashboard\/.*/, (req, res) => {
            res.sendFile(path.join(publicPath, 'dashboard.html'));
        });


        // --- API Routes ---

        // Config API (Settings Page)
        this.app.get('/api/config', (req, res) => {
            try {
                const EnvManager = require('../src/utils/EnvManager');
                const envData = EnvManager.readEnv();
                const golemsData = EnvManager.readGolemsJson();

                // We return all properties so the frontend can display them.
                return res.json({ env: envData, golems: golemsData });
            } catch (e) {
                console.error("Failed to read config:", e);
                return res.status(500).json({ error: e.message });
            }
        });

        this.app.post('/api/config', (req, res) => {
            try {
                const { env: envPayload, golems: golemsPayload } = req.body;

                if (!envPayload || typeof envPayload !== 'object') {
                    return res.status(400).json({ error: "Invalid env payload" });
                }

                const EnvManager = require('../src/utils/EnvManager');
                const ConfigManager = require('../src/config/index');

                // 1. 寫入 .env 檔案 與 golems.json
                const envUpdated = EnvManager.updateEnv(envPayload);
                let golemsUpdated = false;

                if (golemsPayload && Array.isArray(golemsPayload)) {
                    golemsUpdated = EnvManager.updateGolemsJson(golemsPayload);
                }

                if (envUpdated || golemsUpdated) {
                    console.log(`📝 [System] Saved new config. env updated: ${envUpdated}, golems updated: ${golemsUpdated}`);

                    // 2. 觸發熱重載
                    ConfigManager.reloadConfig();

                    // 3. 通知特定服務重載其對應的配置
                    if (envPayload.GEMINI_API_KEYS !== undefined) {
                        try {
                            const { CONFIG } = require('../src/config/index');
                            // 尋找運行中的 Golems 並通知 KeyChain
                            // 由於架構上 Golem 的 keyChain 是實體化的，我們需要從 context 拿
                            for (const [id, context] of this.contexts.entries()) {
                                if (context.brain && context.brain.keyChain) {
                                    context.brain.keyChain.updateKeys(CONFIG.API_KEYS);
                                    console.log(`🔄 [System] Successfully injected new API Keys into Golem [${id}]`);
                                }
                            }
                        } catch (e) {
                            console.error("Failed to notify Golem KeyChains:", e.message);
                        }
                    }

                    // 熱重載每個實體的 Admin ID (從 GOLEMS_CONFIG 讀取最新的設定)
                    if (golemsUpdated) {
                        try {
                            const { GOLEMS_CONFIG } = require('../src/config/index');
                            for (const [id, context] of this.contexts.entries()) {
                                if (context.brain) {
                                    const configForBrain = GOLEMS_CONFIG.find(g => g.id === id);
                                    if (configForBrain && configForBrain.adminId !== undefined) {
                                        // Update the golem's specific config
                                        if (!context.brain.config) context.brain.config = {};
                                        context.brain.config.adminId = configForBrain.adminId;
                                        context.brain.config.chatId = configForBrain.chatId;
                                        context.brain.config.tgAuthMode = configForBrain.tgAuthMode;
                                        console.log(`🔄 [System] Successfully updated permissions for Golem [${id}]`);
                                    }
                                }
                            }
                        } catch (e) {
                            console.error("Failed to hot reload multi golem configs:", e.message)
                        }
                    }

                    return res.json({ success: true, message: "Settings saved successfully" });
                }

                return res.json({ success: false, message: "No changes detected" });
            } catch (e) {
                console.error("Failed to update config:", e);
                return res.status(500).json({ error: e.message });
            }
        });


        this.app.get('/api/skills', async (req, res) => {
            try {
                const libPath = path.join(process.cwd(), 'src', 'skills', 'lib');
                if (!fs.existsSync(libPath)) return res.json([]);

                const files = fs.readdirSync(libPath).filter(f => f.endsWith('.md'));

                const ALL_OPTIONAL_SKILLS = ['git.md', 'image-prompt.md', 'moltbot.md', 'spotify.md', 'youtube.md'];
                const optionalSkillsConfig = process.env.OPTIONAL_SKILLS || '';
                const enabledOptionalSkills = optionalSkillsConfig.split(',').map(s => s.trim().toLowerCase()).filter(s => s !== '');

                const skillsData = files.map(file => {
                    const content = fs.readFileSync(path.join(libPath, file), 'utf8');
                    const isOptional = ALL_OPTIONAL_SKILLS.includes(file);
                    const baseName = file.replace('.md', '').toLowerCase();
                    const isEnabled = !isOptional || enabledOptionalSkills.includes(baseName);

                    // Extract first line or generic title
                    const firstLineMatch = content.match(/^#+ (.*)|^【(.*)】/m) || content.match(/^([^\n]+)/);
                    let title = baseName;
                    if (firstLineMatch) {
                        title = firstLineMatch[1] || firstLineMatch[2] || firstLineMatch[0];
                        title = title.replace(/^#+\s*|【|】/g, '').trim();
                    }

                    return {
                        id: baseName,
                        title: title || baseName,
                        isOptional,
                        isEnabled,
                        content: content
                    };
                });

                // Sort: Enabled first, then by name
                skillsData.sort((a, b) => {
                    if (a.isEnabled && !b.isEnabled) return -1;
                    if (!a.isEnabled && b.isEnabled) return 1;
                    return a.id.localeCompare(b.id);
                });

                return res.json(skillsData);
            } catch (e) {
                console.error("Failed to read skills:", e);
                return res.status(500).json({ error: e.message });
            }
        });

        this.app.post('/api/skills/toggle', (req, res) => {
            try {
                const { id, enabled } = req.body;
                if (!id) return res.status(400).json({ error: "Missing skill ID" });

                const ALL_OPTIONAL_SKILLS = ['git', 'image-prompt', 'moltbot', 'spotify', 'youtube'];
                if (!ALL_OPTIONAL_SKILLS.includes(id)) {
                    return res.status(400).json({ error: "Cannot toggle core system skills" });
                }

                // 1. Update in-memory
                let currentStr = process.env.OPTIONAL_SKILLS || '';
                let currentSkills = currentStr.split(',').map(s => s.trim().toLowerCase()).filter(s => s !== '');

                if (enabled && !currentSkills.includes(id)) {
                    currentSkills.push(id);
                } else if (!enabled && currentSkills.includes(id)) {
                    currentSkills = currentSkills.filter(s => s !== id);
                }

                const newSkillsStr = currentSkills.join(',');
                process.env.OPTIONAL_SKILLS = newSkillsStr;

                // 2. Persist to .env
                const envPath = path.resolve(process.cwd(), '.env'); // Fixed: directly in root if started from root
                if (fs.existsSync(envPath)) {
                    let envContent = fs.readFileSync(envPath, 'utf8');

                    // Regex to find OPTIONAL_SKILLS=... and replace it
                    const regex = /^OPTIONAL_SKILLS=.*$/m;
                    if (regex.test(envContent)) {
                        envContent = envContent.replace(regex, `OPTIONAL_SKILLS=${newSkillsStr}`);
                    } else {
                        envContent += `\nOPTIONAL_SKILLS=${newSkillsStr}\n`;
                    }
                    fs.writeFileSync(envPath, envContent, 'utf8');
                    console.log(`📝 [System] Saved new skill config to .env: ${newSkillsStr}`);
                }

                // 3. Clear Cache (Hot Reload)
                const ProtocolFormatter = require('../src/services/ProtocolFormatter');
                ProtocolFormatter._lastScanTime = 0;

                return res.json({ success: true, enabled, skillsStr: newSkillsStr });
            } catch (e) {
                console.error("Failed to toggle skill:", e);
                return res.status(500).json({ error: e.message });
            }
        });

        this.app.post('/api/skills/reload', (req, res) => {
            try {
                console.log("🔄 [WebServer] Hot-reloading skills... Clearing ProtocolFormatter cache.");
                const ProtocolFormatter = require('../src/services/ProtocolFormatter');
                ProtocolFormatter._lastScanTime = 0; // Trigger a fresh scan on next turn
                return res.json({ success: true, message: "Skills cache cleared" });
            } catch (e) {
                console.error("Failed to reload skills cache:", e);
                return res.status(500).json({ error: e.message });
            }
        });

        // 🚀 技能注入：重新組裝技能書並送進 Gemini
        this.app.post('/api/skills/inject', async (req, res) => {
            try {
                // 1. 先清除 ProtocolFormatter 快取，確保讀到最新的技能清單
                const ProtocolFormatter = require('../src/services/ProtocolFormatter');
                ProtocolFormatter._lastScanTime = 0;

                // 2. 對每個運行中的 Golem Brain 呼叫 reloadSkills()
                const results = [];
                for (const [id, context] of this.contexts.entries()) {
                    if (context.brain && typeof context.brain.reloadSkills === 'function') {
                        try {
                            console.log(`⚡ [WebServer] Injecting skills into Golem [${id}]...`);
                            await context.brain.reloadSkills();
                            results.push({ id, status: 'success' });
                        } catch (e) {
                            console.error(`❌ [WebServer] Failed to inject skills into Golem [${id}]:`, e.message);
                            results.push({ id, status: 'error', error: e.message });
                        }
                    } else {
                        results.push({ id, status: 'skipped', error: 'Brain not ready or reloadSkills not available' });
                    }
                }

                if (results.length === 0) {
                    return res.status(503).json({ success: false, message: "No active Golem instances found" });
                }

                const allSuccess = results.every(r => r.status === 'success');
                return res.json({
                    success: allSuccess,
                    message: allSuccess
                        ? `技能書已成功注入 ${results.length} 個 Golem 實體`
                        : `部分注入失敗`,
                    results
                });
            } catch (e) {
                console.error("Failed to inject skills:", e);
                return res.status(500).json({ error: e.message });
            }
        });

        this.app.get('/api/golems/templates', (req, res) => {
            const personasDir = path.resolve(process.cwd(), 'personas');
            if (!fs.existsSync(personasDir)) {
                return res.json({ templates: [] });
            }

            try {
                const files = fs.readdirSync(personasDir).filter(f => f.endsWith('.md'));
                const templates = files.map(file => {
                    const content = fs.readFileSync(path.join(personasDir, file), 'utf8');
                    const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);

                    if (frontmatterMatch) {
                        const yamlStr = frontmatterMatch[1];
                        const body = frontmatterMatch[2].trim();

                        // Simple YAML parser (since we don't have a yaml library here)
                        const metadata = {};
                        yamlStr.split('\n').forEach(line => {
                            const [key, ...valParts] = line.split(':');
                            if (key && valParts.length > 0) {
                                let val = valParts.join(':').trim();
                                if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
                                if (val.startsWith('[') && val.endsWith(']')) {
                                    val = val.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(s => s !== '');
                                }
                                metadata[key.trim()] = val;
                            }
                        });

                        return {
                            id: file.replace('.md', ''),
                            name: metadata.name || file,
                            description: metadata.description || '',
                            icon: metadata.icon || 'BrainCircuit',
                            aiName: metadata.aiName || 'Golem',
                            userName: metadata.userName || 'Traveler',
                            role: body || metadata.role || '',
                            tone: metadata.tone || '',
                            tags: metadata.tags || [],
                            skills: metadata.skills || []
                        };
                    }
                    return null;
                }).filter(t => t !== null);

                return res.json({ templates });
            } catch (e) {
                console.error("Failed to load persona templates:", e);
                return res.status(500).json({ error: e.message });
            }
        });

        this.app.get('/api/golems', (req, res) => {
            const golemsData = Array.from(this.contexts.entries()).map(([id, context]) => {
                const status = (context.brain && context.brain.status) || 'running';
                return { id, status };
            });
            return res.json({ golems: golemsData });
        });

        this.app.post('/api/golems/setup', async (req, res) => {
            const { golemId, aiName, userName, currentRole, tone, skills } = req.body;
            if (!golemId) return res.status(400).json({ error: "Missing golemId" });

            const context = this.contexts.get(golemId);
            if (!context || !context.brain) return res.status(404).json({ error: "Golem not found" });

            try {
                const personaManager = require('../src/skills/core/persona');
                personaManager.save(context.brain.userDataDir, {
                    aiName: aiName || "Golem",
                    userName: userName || "Traveler",
                    currentRole: currentRole || "一個擁有長期記憶與自主意識的 AI 助手",
                    tone: tone || "預設口氣",
                    skills: skills || [],
                    isNew: false
                });

                // Update status and initialize
                context.brain.status = 'running';

                // Initialize asynchronously so we don't block the request
                context.brain.init().catch(err => {
                    console.error(`Failed to initialize Golem [${golemId}]:`, err);
                    context.brain.status = 'error';
                });

                return res.json({ success: true, message: "Golem setup initiated" });
            } catch (e) {
                console.error("Setup error:", e);
                return res.status(500).json({ error: e.message });
            }
        });

        this.app.get('/api/memory', async (req, res) => {
            const golemId = req.query.golemId || (this.contexts.size > 0 ? Array.from(this.contexts.keys())[0] : null);
            const context = golemId ? this.contexts.get(golemId) : null;
            if (!context || !context.memory) return res.status(503).json({ error: "Memory not engaged" });

            try {
                // If using Qmd/Native, we might need a way to list all. 
                // For now, let's assume valid search or exposed method.
                // If ExperienceMemory (JSON based):
                if (context.memory.data) return res.json(context.memory.data);

                // If SystemNativeDriver or Qmd, we need a implementation to "list all" or search empty
                const results = await context.memory.recall("");
                return res.json(results);
            } catch (e) {
                return res.status(500).json({ error: e.message });
            }
        });

        this.app.delete('/api/memory', async (req, res) => {
            const golemId = req.query.golemId || (this.contexts.size > 0 ? Array.from(this.contexts.keys())[0] : null);
            const context = golemId ? this.contexts.get(golemId) : null;
            if (!context || !context.memory) return res.status(503).json({ error: "Memory not engaged" });
            try {
                if (typeof context.memory.clearMemory === 'function') {
                    await context.memory.clearMemory();
                    return res.json({ success: true, message: "Memory cleared" });
                } else {
                    return res.status(501).json({ error: "Clear memory not supported by this driver" });
                }
            } catch (e) {
                return res.status(500).json({ error: e.message });
            }
        });

        this.app.get('/api/memory/export', async (req, res) => {
            const golemId = req.query.golemId || (this.contexts.size > 0 ? Array.from(this.contexts.keys())[0] : null);
            const context = golemId ? this.contexts.get(golemId) : null;
            if (!context || !context.memory) return res.status(503).json({ error: "Memory not engaged" });
            try {
                if (typeof context.memory.exportMemory === 'function') {
                    const data = await context.memory.exportMemory();
                    res.setHeader('Content-disposition', `attachment; filename=memory_${golemId || 'export'}_${Date.now()}.json`);
                    res.setHeader('Content-type', 'application/json');
                    return res.send(data);
                } else {
                    return res.status(501).json({ error: "Export memory not supported by this driver" });
                }
            } catch (e) {
                return res.status(500).json({ error: e.message });
            }
        });

        this.app.post('/api/memory/import', async (req, res) => {
            const golemId = req.query.golemId || (this.contexts.size > 0 ? Array.from(this.contexts.keys())[0] : null);
            const context = golemId ? this.contexts.get(golemId) : null;
            if (!context || !context.memory) return res.status(503).json({ error: "Memory not engaged" });

            try {
                if (typeof context.memory.importMemory === 'function') {
                    const jsonData = req.body;
                    // body is parsed as object if we use express.json(), need it as string for evaluate
                    const result = await context.memory.importMemory(JSON.stringify(jsonData));
                    if (result.success) {
                        return res.json(result);
                    } else {
                        return res.status(400).json(result);
                    }
                } else {
                    return res.status(501).json({ error: "Import memory not supported by this driver" });
                }
            } catch (e) {
                return res.status(500).json({ error: e.message });
            }
        });

        this.app.post('/api/memory', async (req, res) => {
            const golemId = req.query.golemId || (this.contexts.size > 0 ? Array.from(this.contexts.keys())[0] : null);
            const context = golemId ? this.contexts.get(golemId) : null;
            if (!context || !context.memory) return res.status(503).json({ error: "Memory not engaged" });
            try {
                const { text, metadata } = req.body;
                await context.memory.memorize(text, metadata || {});
                this.io.emit('memory_update', { action: 'add', text, metadata, golemId });
                return res.json({ success: true });
            } catch (e) {
                return res.status(500).json({ error: e.message });
            }
        });

        this.app.get('/api/agent/logs', (req, res) => {
            const golemId = req.query.golemId || (this.contexts.size > 0 ? Array.from(this.contexts.keys())[0] : null);
            const context = golemId ? this.contexts.get(golemId) : null;
            if (!context || !context.brain || !context.brain.chatLogFile) return res.json([]);
            try {
                if (!fs.existsSync(context.brain.chatLogFile)) return res.json([]);
                const content = fs.readFileSync(context.brain.chatLogFile, 'utf8');
                const logs = content.trim().split('\n').map(line => {
                    try { return JSON.parse(line); } catch (e) { return null; }
                }).filter(x => x);

                // Return last 1000 logs (approx 1 day of heavy usage)
                return res.json(logs.slice(-1000));
            } catch (e) {
                return res.status(500).json({ error: e.message });
            }
        });

        // ─── Todos API ────────────────────────────────────────────────────────

        const TODOS_FILE = path.resolve(process.cwd(), '.todos.json');
        const ARCHIVE_FILE = path.resolve(process.cwd(), '.todos_archive.json');

        const readTodos = () => {
            try { return fs.existsSync(TODOS_FILE) ? JSON.parse(fs.readFileSync(TODOS_FILE, 'utf8')) : []; } catch (e) { return []; }
        };
        const writeTodos = (todos) => fs.writeFileSync(TODOS_FILE, JSON.stringify(todos, null, 2));
        const readArchive = () => {
            try { return fs.existsSync(ARCHIVE_FILE) ? JSON.parse(fs.readFileSync(ARCHIVE_FILE, 'utf8')) : []; } catch (e) { return []; }
        };
        const writeArchive = (items) => fs.writeFileSync(ARCHIVE_FILE, JSON.stringify(items, null, 2));
        const genId = () => `todo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

        // 觸發 Golem 分析 (fire-and-forget)
        const triggerGolemAnalysis = async (todo, golemId) => {
            const context = this.contexts.get(golemId) || (this.contexts.size > 0 ? [...this.contexts.values()][0] : null);
            if (!context?.brain) return;
            try {
                const prompt = `【任務分析指令】使用者新增了一個待辦任務，請用 1-2 句話給出簡短可行的建議或分析，不需要標題，直接給建議內容：\n任務：${todo.title}${todo.description ? `\n描述：${todo.description}` : ''}`;
                const raw = await context.brain.sendMessage(prompt, false);
                const suggestion = (raw || '').replace(/\[.*?\]/g, '').trim().slice(0, 300);
                const todos = readTodos();
                const idx = todos.findIndex(t => t.id === todo.id);
                if (idx !== -1) {
                    todos[idx].suggestion = suggestion;
                    todos[idx].updatedAt = Date.now();
                    writeTodos(todos);
                    this.io.emit('todo_update', { action: 'updated', todo: todos[idx] });
                }
            } catch (e) {
                console.warn(`⚠️ [Todos] Golem 分析失敗: ${e.message}`);
            }
        };

        // 觸發 Golem 執行任務 (fire-and-forget)
        const triggerGolemExecution = async (todo, golemId) => {
            const context = this.contexts.get(golemId) || (this.contexts.size > 0 ? [...this.contexts.values()][0] : null);
            if (!context?.brain) return;
            try {
                const prompt = `【任務執行指令】請執行以下任務並給出完整的執行結果或成品：\n任務：${todo.title}${todo.description ? `\n描述：${todo.description}` : ''}`;
                const raw = await context.brain.sendMessage(prompt, false);
                const result = (raw || '').trim().slice(0, 1000);
                const todos = readTodos();
                const idx = todos.findIndex(t => t.id === todo.id);
                if (idx !== -1) {
                    todos[idx].status = 'review';
                    todos[idx].result = result;
                    todos[idx].updatedAt = Date.now();
                    writeTodos(todos);
                    this.io.emit('todo_update', { action: 'updated', todo: todos[idx] });
                    console.log(`✅ [Todos] Golem 完成任務 "${todo.title}"，已移至待確認`);
                }
            } catch (e) {
                console.warn(`⚠️ [Todos] Golem 執行失敗: ${e.message}`);
                // 還是移到 review，讓使用者知道
                const todos = readTodos();
                const idx = todos.findIndex(t => t.id === todo.id);
                if (idx !== -1) {
                    todos[idx].status = 'review';
                    todos[idx].result = `執行時發生錯誤：${e.message}`;
                    todos[idx].updatedAt = Date.now();
                    writeTodos(todos);
                    this.io.emit('todo_update', { action: 'updated', todo: todos[idx] });
                }
            }
        };

        this.app.get('/api/todos', (req, res) => {
            res.json(readTodos());
        });

        this.app.post('/api/todos', (req, res) => {
            const { title, description = '', golemId = '' } = req.body;
            if (!title?.trim()) return res.status(400).json({ error: 'Missing title' });
            const todo = { id: genId(), title: title.trim(), description, status: 'backlog', golemId, suggestion: '', result: '', createdAt: Date.now(), updatedAt: Date.now() };
            const todos = readTodos();
            todos.push(todo);
            writeTodos(todos);
            this.io.emit('todo_update', { action: 'added', todo });
            res.json(todo);
            // 非同步分析
            triggerGolemAnalysis(todo, golemId);
        });

        this.app.patch('/api/todos/:id', (req, res) => {
            const { id } = req.params;
            const todos = readTodos();
            const idx = todos.findIndex(t => t.id === id);
            if (idx === -1) return res.status(404).json({ error: 'Not found' });

            const prevStatus = todos[idx].status;
            Object.assign(todos[idx], req.body, { updatedAt: Date.now() });
            writeTodos(todos);
            this.io.emit('todo_update', { action: 'updated', todo: todos[idx] });
            res.json(todos[idx]);

            // 拖入 Doing → 觸發 Golem 執行
            if (req.body.status === 'doing' && prevStatus !== 'doing') {
                triggerGolemExecution(todos[idx], todos[idx].golemId);
            }
        });

        this.app.delete('/api/todos/:id', (req, res) => {
            const { id } = req.params;
            let todos = readTodos();
            const todo = todos.find(t => t.id === id);
            if (!todo) return res.status(404).json({ error: 'Not found' });
            todos = todos.filter(t => t.id !== id);
            writeTodos(todos);
            this.io.emit('todo_update', { action: 'deleted', id });
            res.json({ success: true });
        });

        this.app.post('/api/todos/:id/archive', (req, res) => {
            const { id } = req.params;
            let todos = readTodos();
            const todo = todos.find(t => t.id === id);
            if (!todo) return res.status(404).json({ error: 'Not found' });
            todos = todos.filter(t => t.id !== id);
            writeTodos(todos);
            const archive = readArchive();
            archive.unshift({ ...todo, archivedAt: Date.now() });
            writeArchive(archive);
            this.io.emit('todo_update', { action: 'deleted', id });
            this.io.emit('archive_update', { action: 'added', todo: archive[0] });
            res.json({ success: true });
        });

        this.app.get('/api/todos/archive', (req, res) => {
            res.json(readArchive());
        });

        this.app.delete('/api/todos/archive/all', (req, res) => {
            writeArchive([]);
            this.io.emit('archive_update', { action: 'cleared' });
            res.json({ success: true });
        });

        // ─── System ───────────────────────────────────────────────────────────

        this.app.post('/api/system/reload', (req, res) => {
            console.log("🔄 [WebServer] Received reload request. Restarting system...");
            res.json({ success: true, message: "System is restarting..." });

            // Small delay to ensure the response is sent before the process exits
            setTimeout(() => {
                const { spawn } = require('child_process');
                const subprocess = spawn(process.argv[0], process.argv.slice(1), {
                    detached: true,
                    stdio: 'ignore'
                });
                subprocess.unref();
                process.exit(0);
            }, 1000);
        });

        this.app.post('/api/system/shutdown', (req, res) => {
            console.log("⛔ [WebServer] Received shutdown request. Stopping system...");
            res.json({ success: true, message: "System is shutting down..." });

            // 直接終止進程，不 spawn 新子進程
            // 與 reload 的差異：reload 會生出新進程再死去（熱重啟），shutdown 則完全停止
            // Single mode / Multi mode 皆適用（都是同一個 Node.js 進程）
            setTimeout(() => {
                process.exit(0);
            }, 1000);
        });

        // Socket.io connection handler
        this.io.on('connection', (socket) => {
            const getGolemsData = () => {
                return Array.from(this.contexts.entries()).map(([id, context]) => {
                    const status = (context.brain && context.brain.status) || 'running';
                    return { id, status };
                });
            };

            // Send initial state upon connection
            if (this.dashboard) {
                socket.emit('init', {
                    queueCount: this.dashboard.queueCount,
                    lastSchedule: this.dashboard.lastSchedule,
                    uptime: process.uptime(),
                    logs: this.logBuffer, // Send buffered logs
                    golems: getGolemsData() // Send active golems
                });
            } else {
                socket.emit('init', {
                    queueCount: 0,
                    lastSchedule: 'N/A',
                    uptime: process.uptime(),
                    logs: this.logBuffer,
                    golems: getGolemsData()
                });
            }

            // Allow client to manually request logs (for page navigation)
            socket.on('request_logs', () => {
                socket.emit('init', { logs: this.logBuffer });
            });
        });

        // Start Server
        this.server.listen(this.port, () => {
            const url = `http://localhost:${this.port}/dashboard`;
            console.log(`🚀 [WebServer] Dashboard running at ${url}`);

            // Auto-open browser (MacOS 'open', Windows 'start', Linux 'xdg-open')
            const startCmd = process.platform == 'darwin' ? 'open' : process.platform == 'win32' ? 'start' : 'xdg-open';
            const { exec } = require('child_process');
            exec(`${startCmd} ${url}`);
        });
    }

    broadcastLog(data) {
        // Add to buffer
        this.logBuffer.push(data);
        if (this.logBuffer.length > 200) {
            this.logBuffer.shift();
        }

        if (this.io) {
            this.io.emit('log', data);
        }
    }

    broadcastState(data) {
        if (this.io) {
            this.io.emit('state_update', data);
        }
    }

    broadcastHeartbeat(data) {
        if (this.io) {
            this.io.emit('heartbeat', data);
        }
    }

    stop() {
        if (this.server) {
            this.server.close();
        }
    }
}
module.exports = WebServer;

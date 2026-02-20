/**
 * GolemBrain Unit Tests
 * Mock 所有外部依賴（fs, puppeteer, DOMDoctor），僅驗證內部邏輯。
 */

// --- Mocks ---
jest.mock('puppeteer-extra', () => {
    const mockPage = {
        goto: jest.fn().mockResolvedValue(),
        bringToFront: jest.fn().mockResolvedValue(),
        $: jest.fn().mockResolvedValue({}),
        evaluate: jest.fn().mockResolvedValue(''),
        content: jest.fn().mockResolvedValue('<html></html>'),
        click: jest.fn().mockResolvedValue(),
        waitForSelector: jest.fn().mockResolvedValue(),
        keyboard: { press: jest.fn().mockResolvedValue() },
        target: jest.fn().mockReturnValue({
            createCDPSession: jest.fn().mockResolvedValue({
                send: jest.fn().mockResolvedValue(),
            }),
        }),
    };
    const mockBrowser = {
        pages: jest.fn().mockResolvedValue([mockPage]),
        newPage: jest.fn().mockResolvedValue(mockPage),
    };
    const puppeteer = {
        use: jest.fn(),
        launch: jest.fn().mockResolvedValue(mockBrowser),
        connect: jest.fn().mockResolvedValue(mockBrowser),
        _mockBrowser: mockBrowser,
        _mockPage: mockPage,
    };
    return puppeteer;
});

jest.mock('puppeteer-extra-plugin-stealth', () => jest.fn());

jest.mock('../../services/DOMDoctor', () => {
    return jest.fn().mockImplementation(() => ({
        loadSelectors: jest.fn().mockReturnValue({
            input: 'div[contenteditable]',
            send: 'button[aria-label="Send"]',
            response: '.model-response-text',
        }),
        saveSelectors: jest.fn(),
        diagnose: jest.fn().mockResolvedValue(null),
    }));
});

jest.mock('../../memory/BrowserMemoryDriver', () => {
    return jest.fn().mockImplementation(() => ({
        init: jest.fn().mockResolvedValue(),
        recall: jest.fn().mockResolvedValue([]),
        memorize: jest.fn().mockResolvedValue(),
    }));
});

jest.mock('../../memory/SystemQmdDriver', () => {
    return jest.fn().mockImplementation(() => ({
        init: jest.fn().mockResolvedValue(),
        recall: jest.fn().mockResolvedValue([]),
        memorize: jest.fn().mockResolvedValue(),
    }));
});

jest.mock('../../memory/SystemNativeDriver', () => {
    return jest.fn().mockImplementation(() => ({
        init: jest.fn().mockResolvedValue(),
        recall: jest.fn().mockResolvedValue([]),
        memorize: jest.fn().mockResolvedValue(),
    }));
});

jest.mock('../../skills', () => ({
    getSystemPrompt: jest.fn().mockReturnValue('SYSTEM_PROMPT'),
}));

jest.mock('../../skills/lib/skill-manager', () => ({
    listSkills: jest.fn().mockReturnValue([]),
}));

jest.mock('../../config', () => ({
    CONFIG: { USER_DATA_DIR: '/tmp/golem_test_data' },
    cleanEnv: jest.fn((str) => (str || '').trim()),
}));

jest.mock('../../utils/system', () => ({
    getSystemFingerprint: jest.fn().mockReturnValue('OS: darwin | Arch: arm64 | Mode: browser'),
}));

// --- Module Under Test ---
const fs = require('fs');
const path = require('path');
const GolemBrain = require('../GolemBrain');
const { LIMITS } = require('../constants');

// Silence console to avoid chalk/Jest compatibility crash with emoji chars
const originalConsole = {};
beforeAll(() => {
    ['log', 'warn', 'error'].forEach(method => {
        originalConsole[method] = console[method];
        console[method] = jest.fn();
    });
});
afterAll(() => {
    Object.assign(console, originalConsole);
});

// ============================================================
// Test Suites
// ============================================================

describe('GolemBrain', () => {
    let brain;
    const testLogDir = path.join(process.cwd(), 'logs');
    const testLogFile = path.join(testLogDir, 'agent_chat.jsonl');

    beforeEach(() => {
        // Reset mocks but keep console silenced
        jest.restoreAllMocks();
        // Re-silence console after restoreAllMocks
        ['log', 'warn', 'error'].forEach(method => {
            console[method] = jest.fn();
        });

        // Mock fs methods used in constructor
        jest.spyOn(fs, 'existsSync').mockReturnValue(false);
        jest.spyOn(fs, 'mkdirSync').mockReturnValue(undefined);
        jest.spyOn(fs, 'readFileSync').mockReturnValue('');
        jest.spyOn(fs, 'writeFileSync').mockReturnValue(undefined);
        jest.spyOn(fs, 'appendFile').mockImplementation((_p, _d, cb) => cb && cb(null));

        brain = new GolemBrain();
    });

    // ----------------------------------------------------------
    // Constructor & Memory Mode Selection
    // ----------------------------------------------------------
    describe('constructor', () => {
        it('should default to BrowserMemoryDriver when no GOLEM_MEMORY_MODE set', () => {
            const BrowserMemoryDriver = require('../../memory/BrowserMemoryDriver');
            expect(BrowserMemoryDriver).toHaveBeenCalled();
        });

        it('should select SystemQmdDriver when mode is "qmd"', () => {
            process.env.GOLEM_MEMORY_MODE = 'qmd';
            jest.restoreAllMocks();
            ['log', 'warn', 'error'].forEach(m => { console[m] = jest.fn(); });
            jest.spyOn(fs, 'existsSync').mockReturnValue(false);
            jest.spyOn(fs, 'mkdirSync').mockReturnValue(undefined);

            const freshBrain = new GolemBrain();
            const SystemQmdDriver = require('../../memory/SystemQmdDriver');
            expect(SystemQmdDriver).toHaveBeenCalled();

            delete process.env.GOLEM_MEMORY_MODE;
        });

        it('should select SystemNativeDriver when mode is "native"', () => {
            process.env.GOLEM_MEMORY_MODE = 'native';
            jest.restoreAllMocks();
            ['log', 'warn', 'error'].forEach(m => { console[m] = jest.fn(); });
            jest.spyOn(fs, 'existsSync').mockReturnValue(false);
            jest.spyOn(fs, 'mkdirSync').mockReturnValue(undefined);

            const freshBrain = new GolemBrain();
            const SystemNativeDriver = require('../../memory/SystemNativeDriver');
            expect(SystemNativeDriver).toHaveBeenCalled();

            delete process.env.GOLEM_MEMORY_MODE;
        });
    });

    // ----------------------------------------------------------
    // _cleanupLogs
    // ----------------------------------------------------------
    describe('_cleanupLogs', () => {
        it('should keep recent entries and remove old ones', () => {
            const now = Date.now();
            const recentEntry = JSON.stringify({ timestamp: now - 1000, msg: 'recent' });
            const oldEntry = JSON.stringify({ timestamp: now - 2 * LIMITS.LOG_MAX_AGE_MS, msg: 'old' });
            const content = `${oldEntry}\n${recentEntry}`;

            jest.restoreAllMocks();
            ['log', 'warn', 'error'].forEach(m => { console[m] = jest.fn(); });
            jest.spyOn(fs, 'existsSync').mockReturnValue(true);
            jest.spyOn(fs, 'mkdirSync').mockReturnValue(undefined);
            jest.spyOn(fs, 'readFileSync').mockReturnValue(content);
            const writeSpy = jest.spyOn(fs, 'writeFileSync').mockReturnValue(undefined);

            brain._cleanupLogs(LIMITS.LOG_MAX_AGE_MS);

            expect(writeSpy).toHaveBeenCalledTimes(1);
            const writtenContent = writeSpy.mock.calls[0][1];
            expect(writtenContent).toContain('recent');
            expect(writtenContent).not.toContain('old');
        });

        it('should skip cleanup when log file does not exist', () => {
            jest.restoreAllMocks();
            ['log', 'warn', 'error'].forEach(m => { console[m] = jest.fn(); });
            jest.spyOn(fs, 'existsSync').mockReturnValue(false);
            const readSpy = jest.spyOn(fs, 'readFileSync');

            brain._cleanupLogs(LIMITS.LOG_MAX_AGE_MS);

            expect(readSpy).not.toHaveBeenCalled();
        });

        it('should discard lines with invalid JSON', () => {
            const now = Date.now();
            const validEntry = JSON.stringify({ timestamp: now - 1000, msg: 'ok' });
            const content = `not-json\n${validEntry}\n{broken:`;

            jest.restoreAllMocks();
            ['log', 'warn', 'error'].forEach(m => { console[m] = jest.fn(); });
            jest.spyOn(fs, 'existsSync').mockReturnValue(true);
            jest.spyOn(fs, 'mkdirSync').mockReturnValue(undefined);
            jest.spyOn(fs, 'readFileSync').mockReturnValue(content);
            const writeSpy = jest.spyOn(fs, 'writeFileSync').mockReturnValue(undefined);

            brain._cleanupLogs(LIMITS.LOG_MAX_AGE_MS);

            expect(writeSpy).toHaveBeenCalledTimes(1);
            const writtenContent = writeSpy.mock.calls[0][1];
            expect(writtenContent).toContain('ok');
            expect(writtenContent).not.toContain('not-json');
        });
    });

    // ----------------------------------------------------------
    // _appendChatLog
    // ----------------------------------------------------------
    describe('_appendChatLog', () => {
        it('should append JSON line to log file', () => {
            const appendSpy = jest.spyOn(fs, 'appendFile').mockImplementation((_p, _d, cb) => cb(null));
            const entry = { timestamp: Date.now(), role: 'user', text: 'hello' };

            brain._appendChatLog(entry);

            expect(appendSpy).toHaveBeenCalledWith(
                brain.chatLogFile,
                JSON.stringify(entry) + '\n',
                expect.any(Function)
            );
        });

        it('should log error on write failure without throwing', () => {
            jest.spyOn(fs, 'appendFile').mockImplementation((_p, _d, cb) => cb(new Error('disk full')));

            expect(() => brain._appendChatLog({ test: 1 })).not.toThrow();
            expect(console.error).toHaveBeenCalledWith('Failed to write chat log:', expect.any(Error));
        });
    });

    // ----------------------------------------------------------
    // _buildPayload
    // ----------------------------------------------------------
    describe('_buildPayload', () => {
        it('should include start and end tags in the payload', () => {
            const result = brain._buildPayload('Hello', '[[BEGIN:abc]]', '[[END:abc]]');

            expect(result).toContain('[[BEGIN:abc]]');
            expect(result).toContain('[[END:abc]]');
            expect(result).toContain('Hello');
            expect(result).toContain('[GOLEM_REPLY] (Required)');
        });

        it('should handle empty text', () => {
            const result = brain._buildPayload('', '[[BEGIN:x]]', '[[END:x]]');
            expect(result).toContain('[[BEGIN:x]]');
            expect(result).toContain('[[END:x]]');
        });
    });

    // ----------------------------------------------------------
    // _cleanResponseText
    // ----------------------------------------------------------
    describe('_cleanResponseText', () => {
        it('should strip envelope tags from response', () => {
            const raw = '[[BEGIN:abc]] Hello World [[END:abc]]';
            const result = brain._cleanResponseText(raw, '[[BEGIN:abc]]', '[[END:abc]]');
            expect(result).toBe('Hello World');
        });

        it('should remove SYSTEM: Please WRAP noise', () => {
            const raw = '[SYSTEM: Please WRAP your response] actual content';
            const result = brain._cleanResponseText(raw, '[[BEGIN:x]]', '[[END:x]]');
            expect(result).toBe('actual content');
        });

        it('should handle clean text without tags', () => {
            const result = brain._cleanResponseText('clean text', '[[BEGIN:x]]', '[[END:x]]');
            expect(result).toBe('clean text');
        });
    });

    // ----------------------------------------------------------
    // _resolveHeadlessMode
    // ----------------------------------------------------------
    describe('_resolveHeadlessMode', () => {
        afterEach(() => {
            delete process.env.PUPPETEER_HEADLESS;
        });

        it('should return true when env is "true"', () => {
            process.env.PUPPETEER_HEADLESS = 'true';
            expect(brain._resolveHeadlessMode()).toBe(true);
        });

        it('should return "new" when env is "new"', () => {
            process.env.PUPPETEER_HEADLESS = 'new';
            expect(brain._resolveHeadlessMode()).toBe('new');
        });

        it('should return false when env is not set', () => {
            delete process.env.PUPPETEER_HEADLESS;
            expect(brain._resolveHeadlessMode()).toBe(false);
        });
    });

    // ----------------------------------------------------------
    // recall & memorize
    // ----------------------------------------------------------
    describe('recall', () => {
        it('should return empty array for empty query', async () => {
            const result = await brain.recall('');
            expect(result).toEqual([]);
        });

        it('should return empty array for null query', async () => {
            const result = await brain.recall(null);
            expect(result).toEqual([]);
        });

        it('should return empty array when driver throws', async () => {
            brain.memoryDriver.recall = jest.fn().mockRejectedValue(new Error('fail'));
            const result = await brain.recall('test');
            expect(result).toEqual([]);
        });
    });

    describe('memorize', () => {
        it('should call memoryDriver.memorize', async () => {
            await brain.memorize('important fact', { source: 'test' });
            expect(brain.memoryDriver.memorize).toHaveBeenCalledWith('important fact', { source: 'test' });
        });

        it('should warn but not throw when driver fails', async () => {
            brain.memoryDriver.memorize = jest.fn().mockRejectedValue(new Error('write error'));

            await expect(brain.memorize('data')).resolves.not.toThrow();
            expect(console.warn).toHaveBeenCalledWith(
                expect.stringContaining('memorize 失敗'),
                expect.any(String)
            );
        });
    });
});

(() => {
    const STORAGE_KEY = 'battlechess.uiLanguage';
    const SUPPORTED_LANGUAGES = ['zh', 'en'];

    const TRANSLATIONS = {
        zh: {
            page: {
                indexTitle: 'BattleChess 象棋擂台',
                leaderboardTitle: 'BattleChess 排行榜',
            },
            brand: {
                subtitle: '象棋擂台',
            },
            header: {
                ready: '就绪',
                leaderboard: '排行榜',
                backToMain: '主界面',
                language: '界面语言',
            },
            lang: {
                zh: '中文',
                en: 'English',
            },
            timer: {
                redLabel: '红方',
                blackLabel: '黑方',
            },
            editor: {
                title: '局面编辑',
                edit: '编辑',
                done: '完成',
                turnLabel: '先行',
                turnRed: '红',
                turnBlack: '黑',
                finishBeforeStart: '请先完成局面编辑后再开始对局。',
                turnToMove: '局面编辑：{side}先行',
                cannotEdit: '当前局面暂时无法编辑：\n{reason}',
                blocked: '局面编辑不可用：{reason}',
                enabled: '局面编辑已开启',
                invalid: '无效局面：\n{reason}',
                invalidStatus: '无效局面：{reason}',
                updated: '局面已更新',
                dragToPlace: '拖拽放置',
                reusable: '可重复使用',
                pieceName: {
                    K: '红帅',
                    A: '红仕',
                    B: '红相',
                    N: '红马',
                    R: '红车',
                    C: '红炮',
                    P: '红兵',
                    k: '黑将',
                    a: '黑士',
                    b: '黑象',
                    n: '黑马',
                    r: '黑车',
                    c: '黑炮',
                    p: '黑卒',
                },
            },
            board: {
                fenPlaceholder: 'FEN 串...',
                load: '载入',
                init: '初始',
                pause: '暂停',
                resume: '继续',
                stepBackTitle: '后退一步',
                stepForwardTitle: '前进一步',
                reset: '重置',
                resign: '认输',
                resignTitle: '当前人类方立即认输',
                exportFen: '导出 FEN',
                exportFenTitle: '复制当前 FEN 到剪贴板',
                edit: '编辑',
                editTitle: '开局前编辑当前棋盘局面。',
                flip: '翻转',
                flipTitleDefault: '翻转棋盘，让黑方位于底部。',
                flipTitleActive: '当前为黑方视角。点击恢复红方视角。',
                start: '开始',
                startTitle: '新建并开始对局',
            },
            tabs: {
                log: '记录',
                settings: '设置',
                history: '历史',
                historyRefreshTitle: '刷新历史',
            },
            settings: {
                red: '红方',
                black: '黑方',
                playerType: '玩家类型',
                human: '人类',
                random: '随机',
                pikafish: 'Pikafish',
                customLLM: '自定义 LLM',
                thinkingMode: '思考模式',
                on: '开启',
                off: '关闭',
                prompt: '提示词',
                apiBase: 'API Base URL',
                apiKey: 'API Key',
                model: '模型',
                mode: '模式',
                movetime: '限时',
                depth: '深度',
                thinkTimeMs: '思考时间（毫秒）',
                timer: '计时模式',
                enableTimer: '启用计时',
                initialTimeMinutes: '初始时间（分钟）',
                incrementSeconds: '每步加秒（秒）',
                analysis: 'Pikafish 分析',
                enable: '启用',
                scoreType: '分数类型',
                scoreElo: '等级分差',
                scorePawn: '厘兵值',
                scoreRaw: '原始值',
            },
            history: {
                filterPlayerPlaceholder: '搜索选手名...',
                filterAll: '全部结果',
                filterRed: '红胜',
                filterBlack: '黑胜',
                filterDraw: '和棋',
                filterReset: '重置',
                filterResetTitle: '重置筛选',
                filterDate: '日期',
                filterMoves: '步数',
                filterMin: '最少',
                filterMax: '最多',
                back: '返回',
                firstTitle: '第一步',
                prevTitle: '上一步',
                nextTitle: '下一步',
                lastTitle: '最后一步',
                initialPosition: '初始局面',
                autoplay: '自动播放',
                autoplayTitle: '自动播放',
                stop: '停止',
                stopTitle: '停止自动播放',
                exportGifTitle: '下载当前对局回放 GIF',
                loading: '加载中...',
                failed: '加载历史失败。',
                noHistory: '暂无对局历史。',
                inProgress: '进行中',
                completed: '已结束',
                playing: '对局中',
                paused: '已暂停',
                localOnly: '仅本地',
                finalizing: '正在写入日志...',
                finished: '已结束',
                failedGameData: '加载对局数据失败。',
                movesCount: '{count} 步',
                initial: '初始局面',
            },
            status: {
                ready: '就绪',
                gameOver: '对局结束',
                gamePaused: '对局已暂停',
                gameResumed: '对局已继续',
                finishEditingBeforeStart: '请先完成局面编辑后再开始对局',
                creatingGame: '正在创建对局...',
                startingGame: '正在开始对局...',
                gameStartedLocal: '对局已开始（本地）',
                gameStarted: '对局已开始',
                initialPositionLoaded: '初始局面已载入',
                fenLoaded: 'FEN 已载入',
                fenCopied: 'FEN 已复制：{fen}',
                waitingHuman: '等待{side}（人类）走子...',
                sideThinking: '{side}思考中...',
                pikafishThinking: '{side} Pikafish（WASM）思考中...',
                randomThinking: '{side}（随机）思考中...',
                exportGifUnavailable: '当前浏览器不支持 GIF 导出。',
                boardNotReady: '棋盘渲染器尚未就绪。',
                exportingGif: '正在导出回放 GIF...',
                gifSaved: '回放 GIF 已保存：{filename}',
                gifFailed: 'GIF 导出失败：{message}',
                connectionLost: '连接断开，正在重连...',
                error: '错误：{message}',
                positionResetToMove: '已跳转到第 {ply} 步',
            },
            alerts: {
                fillLLMConfig: '请填写{side} LLM 配置。',
                failedCreateGame: '创建对局失败：{message}',
                invalidFEN: '无效 FEN',
                currentFEN: '当前 FEN：',
                confirmResign: '确认{side}认输？确认后当前方立即判负。',
                failedResign: '认输失败：{message}',
                genericError: '错误：{message}',
            },
            turn: {
                ready: '准备开始',
                viewInitial: '正在查看初始局面',
                viewAfterMove: '正在查看第 {current} / {total} 步后局面',
                gameOver: '对局结束',
                sideTurn: '<span class="turn-dot"></span> 轮到{side} | 第 {move} 步',
            },
            log: {
                moveThinking: '第 {move} 步：{side}思考中...',
                moveSummary: '#{number} {side}: {move}{captured}',
                toolCall: '> 工具：{tool}({args})',
                toolResult: '  结果：{result}',
            },
            leaderboard: {
                title: '排行榜',
                backToArena: '返回擂台',
                totalGames: '总对局',
                players: '选手数',
                redWins: '红胜',
                blackWins: '黑胜',
                draws: '和棋',
                rankings: '选手排名',
                refresh: '刷新',
                loading: '加载中...',
                empty: '还没有对局记录。',
                failed: '加载数据失败。',
                rank: '#',
                player: '选手',
                win: '胜',
                loss: '负',
                draw: '和',
                winRate: '胜率',
                winRateShort: '胜率',
                asRed: '执红',
                asBlack: '执黑',
                gamesCount: '{count} 局',
                sideRecord: '{wins}胜 {losses}负 {draws}和',
                sideWinRate: '胜率 {pct}%（{count} 局）',
            },
            banner: {
                gameOver: '对局结束',
                redWins: '红方胜',
                blackWins: '黑方胜',
                draw: '和棋',
                close: '关闭',
            },
            result: {
                drawWithReason: '和棋，{reason}',
                draw: '和棋',
                unfinished: '未结束',
                win: '{side}胜',
                winWithReason: '{side}胜，{reason}',
            },
            reason: {
                redKingCaptured: '红方将/帅被吃',
                blackKingCaptured: '黑方将/帅被吃',
                checkmateReason: '将死',
                stalemateReason: '困毙',
                drawOnlyKingsReason: '仅剩将/帅、士和象',
                drawNoCaptureReason: '连续 30 回合无吃子',
                redTimeout: '红方超时',
                blackTimeout: '黑方超时',
                redResigned: '红方认输',
                blackResigned: '黑方认输',
                checkmateRed: '将死，红方胜',
                checkmateBlack: '将死，黑方胜',
                stalemateRed: '困毙，红方胜',
                stalemateBlack: '困毙，黑方胜',
                drawOnlyKings: '和棋，仅剩将/帅、士和象',
                drawNoCapture: '和棋，连续 30 回合无吃子',
            },
            eval: {
                tooltip: '#{move}  {score}  （{side}）',
            },
            common: {
                versus: '对',
            },
        },
        en: {
            page: {
                indexTitle: 'BattleChess - Xiangqi Arena',
                leaderboardTitle: 'Leaderboard - BattleChess',
            },
            brand: {
                subtitle: 'Xiangqi Arena',
            },
            header: {
                ready: 'Ready',
                leaderboard: 'Leaderboard',
                backToMain: 'Main',
                language: 'Language',
            },
            lang: {
                zh: '中文',
                en: 'English',
            },
            timer: {
                redLabel: 'Red',
                blackLabel: 'Black',
            },
            editor: {
                title: 'Position Editor',
                edit: 'Edit',
                done: 'Done',
                turnLabel: 'Side to move',
                turnRed: 'Red',
                turnBlack: 'Black',
                finishBeforeStart: 'Finish editing the position before starting a game.',
                turnToMove: 'Position editor: {side} to move',
                cannotEdit: 'Cannot edit this position yet:\n{reason}',
                blocked: 'Position editor blocked: {reason}',
                enabled: 'Position editor enabled',
                invalid: 'Invalid position:\n{reason}',
                invalidStatus: 'Invalid position: {reason}',
                updated: 'Position updated',
                dragToPlace: 'Drag to place',
                reusable: 'Reusable',
                pieceName: {
                    K: 'Red King',
                    A: 'Red Advisor',
                    B: 'Red Bishop',
                    N: 'Red Knight',
                    R: 'Red Rook',
                    C: 'Red Cannon',
                    P: 'Red Pawn',
                    k: 'Black King',
                    a: 'Black Advisor',
                    b: 'Black Bishop',
                    n: 'Black Knight',
                    r: 'Black Rook',
                    c: 'Black Cannon',
                    p: 'Black Pawn',
                },
            },
            board: {
                fenPlaceholder: 'FEN string...',
                load: 'Load',
                init: 'Init',
                pause: 'Pause',
                resume: 'Resume',
                stepBackTitle: 'Step Back',
                stepForwardTitle: 'Step Forward',
                reset: 'Reset',
                resign: 'Resign',
                resignTitle: 'Current human side resigns immediately',
                exportFen: 'Export FEN',
                exportFenTitle: 'Copy current FEN to clipboard',
                edit: 'Edit',
                editTitle: 'Edit the board position before starting a game.',
                flip: 'Flip',
                flipTitleDefault: 'Flip the board so black is at the bottom.',
                flipTitleActive: 'Black-side view is active. Click to restore red-side view.',
                start: 'Start',
                startTitle: 'Create and start a new game',
            },
            tabs: {
                log: 'Log',
                settings: 'Settings',
                history: 'History',
                historyRefreshTitle: 'Refresh history',
            },
            settings: {
                red: 'Red',
                black: 'Black',
                playerType: 'Player Type',
                human: 'Human',
                random: 'Random',
                pikafish: 'Pikafish',
                customLLM: 'Custom LLM',
                thinkingMode: 'Thinking Mode',
                on: 'On',
                off: 'Off',
                prompt: 'Prompt',
                apiBase: 'API Base URL',
                apiKey: 'API Key',
                model: 'Model',
                mode: 'Mode',
                movetime: 'Think Time',
                depth: 'Depth',
                thinkTimeMs: 'Think Time (ms)',
                timer: 'Timer',
                enableTimer: 'Enable Timer',
                initialTimeMinutes: 'Initial Time (minutes)',
                incrementSeconds: 'Increment (seconds)',
                analysis: 'Pikafish Analysis',
                enable: 'Enable',
                scoreType: 'Score Type',
                scoreElo: 'Elo Delta',
                scorePawn: 'Pawn Value',
                scoreRaw: 'Raw',
            },
            history: {
                filterPlayerPlaceholder: 'Search player name...',
                filterAll: 'All Results',
                filterRed: 'Red Wins',
                filterBlack: 'Black Wins',
                filterDraw: 'Draw',
                filterReset: 'Reset',
                filterResetTitle: 'Reset filters',
                filterDate: 'Date',
                filterMoves: 'Moves',
                filterMin: 'Min',
                filterMax: 'Max',
                back: 'Back',
                firstTitle: 'First Move',
                prevTitle: 'Previous Move',
                nextTitle: 'Next Move',
                lastTitle: 'Last Move',
                initialPosition: 'Initial Position',
                autoplay: 'Auto',
                autoplayTitle: 'Autoplay',
                stop: 'Stop',
                stopTitle: 'Stop autoplay',
                exportGifTitle: 'Download the current replay as GIF',
                loading: 'Loading...',
                failed: 'Failed to load history.',
                noHistory: 'No game history yet.',
                inProgress: 'In Progress',
                completed: 'Completed',
                playing: 'Playing',
                paused: 'Paused',
                localOnly: 'Local only',
                finalizing: 'Finalizing...',
                finished: 'Finished',
                failedGameData: 'Failed to load game data.',
                movesCount: '{count} moves',
                initial: 'Initial',
            },
            status: {
                ready: 'Ready',
                gameOver: 'Game over',
                gamePaused: 'Game paused',
                gameResumed: 'Game resumed',
                finishEditingBeforeStart: 'Finish position editing before starting a game',
                creatingGame: 'Creating game...',
                startingGame: 'Starting game...',
                gameStartedLocal: 'Game started (local)',
                gameStarted: 'Game started',
                initialPositionLoaded: 'Initial position loaded',
                fenLoaded: 'FEN loaded',
                fenCopied: 'FEN copied: {fen}',
                waitingHuman: 'Waiting for {side} (human) to move...',
                sideThinking: '{side} is thinking...',
                pikafishThinking: '{side} Pikafish (WASM) is thinking...',
                randomThinking: '{side} (random) is thinking...',
                exportGifUnavailable: 'GIF export is unavailable in this browser.',
                boardNotReady: 'Board renderer is not ready yet.',
                exportingGif: 'Exporting replay GIF...',
                gifSaved: 'Replay GIF saved: {filename}',
                gifFailed: 'GIF export failed: {message}',
                connectionLost: 'Connection lost, reconnecting...',
                error: 'Error: {message}',
                positionResetToMove: 'Position reset to move #{ply}',
            },
            alerts: {
                fillLLMConfig: 'Please fill in the {side} LLM configuration.',
                failedCreateGame: 'Failed to create game: {message}',
                invalidFEN: 'Invalid FEN',
                currentFEN: 'Current FEN:',
                confirmResign: 'Confirm {side} resignation? This side will lose immediately.',
                failedResign: 'Failed to resign: {message}',
                genericError: 'Error: {message}',
            },
            turn: {
                ready: 'Ready to start',
                viewInitial: 'Viewing initial position',
                viewAfterMove: 'Viewing after move #{current} / {total}',
                gameOver: 'Game Over',
                sideTurn: '<span class="turn-dot"></span> {side} to move | Move #{move}',
            },
            log: {
                moveThinking: 'Move {move}: {side} thinking...',
                moveSummary: '#{number} {side}: {move}{captured}',
                toolCall: '> Tool: {tool}({args})',
                toolResult: '  Result: {result}',
            },
            leaderboard: {
                title: 'Leaderboard',
                backToArena: 'Back to Arena',
                totalGames: 'Total Games',
                players: 'Players',
                redWins: 'Red Wins',
                blackWins: 'Black Wins',
                draws: 'Draws',
                rankings: 'Player Rankings',
                refresh: 'Refresh',
                loading: 'Loading...',
                empty: 'No games played yet.',
                failed: 'Failed to load data.',
                rank: '#',
                player: 'Player',
                win: 'W',
                loss: 'L',
                draw: 'D',
                winRate: 'Win Rate',
                winRateShort: 'Win%',
                asRed: 'As Red',
                asBlack: 'As Black',
                gamesCount: '{count} games',
                sideRecord: '{wins}W {losses}L {draws}D',
                sideWinRate: 'Win {pct}% ({count} games)',
            },
            banner: {
                gameOver: 'Game Over',
                redWins: 'Red Wins!',
                blackWins: 'Black Wins!',
                draw: 'Draw',
                close: 'Close',
            },
            result: {
                drawWithReason: 'Draw - {reason}',
                draw: 'Draw',
                unfinished: 'Unfinished',
                win: '{side} wins',
                winWithReason: '{side} wins - {reason}',
            },
            reason: {
                redKingCaptured: 'Red king captured',
                blackKingCaptured: 'Black king captured',
                checkmateReason: 'Checkmate',
                stalemateReason: 'Stalemate',
                drawOnlyKingsReason: 'Only kings, advisors, and bishops remain',
                drawNoCaptureReason: '30 full moves without capture',
                redTimeout: 'Red ran out of time',
                blackTimeout: 'Black ran out of time',
                redResigned: 'Red resigned',
                blackResigned: 'Black resigned',
                checkmateRed: 'Checkmate - Red wins',
                checkmateBlack: 'Checkmate - Black wins',
                stalemateRed: 'Stalemate - Red wins',
                stalemateBlack: 'Stalemate - Black wins',
                drawOnlyKings: 'Draw - only kings, advisors, and bishops remain',
                drawNoCapture: 'Draw - 30 full moves without capture',
            },
            eval: {
                tooltip: '#{move}  {score}  ({side})',
            },
            common: {
                versus: 'vs',
            },
        },
    };

    function resolveLanguage(language) {
        if (SUPPORTED_LANGUAGES.includes(language)) return language;
        if (typeof language === 'string' && language.toLowerCase().startsWith('zh')) return 'zh';
        return 'en';
    }

    function getStoredLanguage() {
        try {
            return localStorage.getItem(STORAGE_KEY);
        } catch (_) {
            return null;
        }
    }

    function guessInitialLanguage() {
        const stored = getStoredLanguage();
        if (stored) return resolveLanguage(stored);
        if (typeof navigator !== 'undefined') {
            return resolveLanguage(navigator.language || navigator.userLanguage || 'en');
        }
        return 'en';
    }

    let currentLanguage = guessInitialLanguage();

    function setDocumentLanguage(language) {
        const resolved = resolveLanguage(language);
        if (typeof document === 'undefined') return resolved;
        document.documentElement.lang = resolved === 'zh' ? 'zh-CN' : 'en';
        document.documentElement.dataset.uiLang = resolved;
        if (document.body) {
            document.body.dataset.uiLang = resolved;
        }
        return resolved;
    }

    function lookup(key, language = currentLanguage) {
        const parts = String(key || '').split('.');
        let value = TRANSLATIONS[language];
        for (const part of parts) {
            if (!value || typeof value !== 'object' || !(part in value)) {
                value = undefined;
                break;
            }
            value = value[part];
        }
        if (value == null && language !== 'en') {
            return lookup(key, 'en');
        }
        return value;
    }

    function format(value, params = {}) {
        if (typeof value !== 'string') return value;
        return value.replace(/\{(\w+)\}/g, (_, name) => (
            Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : `{${name}}`
        ));
    }

    function t(key, params = {}) {
        const value = lookup(key);
        if (typeof value !== 'string') return key;
        return format(value, params);
    }

    function sideLabel(side, options = {}) {
        const normalized = side === 'w' ? 'red' : side === 'b' ? 'black' : side;
        const short = Boolean(options.short);
        const lower = Boolean(options.lower);
        if (currentLanguage === 'zh') {
            if (short) return normalized === 'red' ? '红' : '黑';
            return normalized === 'red' ? '红方' : '黑方';
        }
        const base = normalized === 'red' ? 'Red' : 'Black';
        return lower ? base.toLowerCase() : base;
    }

    function applyI18nAttributes(root = document) {
        if (!root || typeof root.querySelectorAll !== 'function') return;
        root.querySelectorAll('[data-i18n]').forEach((el) => {
            el.textContent = t(el.dataset.i18n);
        });
        root.querySelectorAll('[data-i18n-title]').forEach((el) => {
            el.title = t(el.dataset.i18nTitle);
        });
        root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
            el.placeholder = t(el.dataset.i18nPlaceholder);
        });
        root.querySelectorAll('[data-i18n-html]').forEach((el) => {
            el.innerHTML = t(el.dataset.i18nHtml);
        });
        root.querySelectorAll('[data-i18n-value]').forEach((el) => {
            el.value = t(el.dataset.i18nValue);
        });
        root.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
            el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel));
        });
    }

    function setLanguage(language, options = {}) {
        const next = setDocumentLanguage(language);
        const changed = next !== currentLanguage;
        currentLanguage = next;
        try {
            localStorage.setItem(STORAGE_KEY, currentLanguage);
        } catch (_) {}
        if (typeof document !== 'undefined' && (changed || options.force)) {
            applyI18nAttributes(document);
            document.dispatchEvent(new CustomEvent('battlechess:languagechange', {
                detail: { language: currentLanguage },
            }));
        }
        return currentLanguage;
    }

    setDocumentLanguage(currentLanguage);

    window.BattleChessI18n = {
        applyI18nAttributes,
        getLanguage: () => currentLanguage,
        resolveLanguage,
        setLanguage,
        sideLabel,
        t,
    };
})();

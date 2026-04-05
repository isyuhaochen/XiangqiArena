/**
 * BattleChess Application Controller
 * Manages game state, API communication, SSE streaming, and UI updates.
 * Supports multiple concurrent games via gameStates Map.
 */

const DEFAULT_FEN = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w';
const TIMER_PLACEHOLDER = '---';
const DEFAULT_TIMER_INITIAL_SECONDS = 30 * 60;

// --- Multi-game state ---
const gameStates = new Map(); // gameId → game state object
let activeGameId = null;

// History replay (global, not per-game)
let historyMode = false;
let historyGame = null;
let historyViewIndex = -1;
let historyAutoplayTimer = null;
let historyGifExportInProgress = false;
let _historyLogs = [];
let _historyActiveGames = [];
let _historyFinishedGames = [];
const HISTORY_GIF_FRAME_DELAY_MS = 700;
const HISTORY_GIF_INITIAL_DELAY_MS = 700;
const HISTORY_GIF_FINAL_DELAY_MS = 1500;
const HISTORY_GIF_PROGRESS_YIELD_EVERY = 4;

function createGameState(gameId, config = {}) {
    return {
        gameId,
        fen: config.fen || DEFAULT_FEN,
        status: 'waiting', // waiting | playing | paused | finished
        turn: 'w',
        moveHistory: [],
        lastMove: null,
        eventSource: null,
        viewIndex: -1,
        scoreType: 'Elo',
        // Labels for tab display
        redLabel: config.redLabel || 'Red',
        blackLabel: config.blackLabel || 'Black',
        // Per-game log HTML (saved when switching away)
        logHTML: '',
        // Per-game log state
        currentLogEntry: null,
        currentLogContent: null,
        currentStreamEl: null,
        currentStreamCls: null,
        // Per-game timer
        timer: {
            enabled: false,
            redTime: null,
            blackTime: null,
            activeSide: null,
            lastSync: 0,
            intervalId: null,
        },
    };
}

function activeGame() {
    return gameStates.get(activeGameId) || null;
}

let renderer = null;
const presetConfigs = {};
let availablePrompts = [];
let defaultPromptName = 'zh';
let defaultPikafishPath = '';  // No longer used (WASM)
let defaultEvalPikafishPath = '';  // No longer used (WASM)
let rightColumnSyncScheduled = false;
let rightColumnSyncTimeoutId = null;
let boardFlipped = false;

// --- WASM Pikafish engine instances ---
// Per-game player engines (keyed by gameId, value: { red: PikafishWasm, black: PikafishWasm })
const wasmPlayerEngines = new Map();
// Shared eval engine
let wasmEvalEngine = null;
let wasmEvalEngineInitPromise = null;

/**
 * Get or create a WASM Pikafish engine for a player side.
 */
async function getWasmPlayerEngine(gameId, side) {
    let engines = wasmPlayerEngines.get(gameId);
    if (!engines) {
        engines = {};
        wasmPlayerEngines.set(gameId, engines);
    }
    if (!engines[side]) {
        const engine = new PikafishWasm();
        await engine.init();
        engines[side] = engine;
    }
    return engines[side];
}

/**
 * Get or create the shared WASM eval engine.
 */
async function getWasmEvalEngine() {
    if (wasmEvalEngine && wasmEvalEngine.isReady) return wasmEvalEngine;
    if (wasmEvalEngineInitPromise) return wasmEvalEngineInitPromise;
    wasmEvalEngineInitPromise = (async () => {
        wasmEvalEngine = new PikafishWasm();
        await wasmEvalEngine.init();
        return wasmEvalEngine;
    })();
    return wasmEvalEngineInitPromise;
}

/**
 * Terminate all WASM engines for a game.
 */
function cleanupWasmEngines(gameId) {
    const engines = wasmPlayerEngines.get(gameId);
    if (engines) {
        if (engines.red) engines.red.terminate();
        if (engines.black) engines.black.terminate();
        wasmPlayerEngines.delete(gameId);
    }
}

/**
 * Auto-submit a WASM Pikafish move for the given side.
 */
async function wasmAutoMove(gameId, side) {
    const g = gameStates.get(gameId);
    if (!g || g.status !== 'playing') return;

    const config = getConfigs()[side];
    if (!config || config.type !== 'pikafish') return;

    try {
        const engine = await getWasmPlayerEngine(gameId, side);
        const fen = g.fen;
        const options = {
            mode: config.engine_mode || 'movetime',
            movetime: config.engine_movetime || 1000,
            depth: config.engine_depth || 20,
        };

        console.log(`[WASM] Computing move for ${side}, fen=${fen}, options=`, options);
        const move = await engine.bestmove(fen, options);
        console.log(`[WASM] Bestmove for ${side}: ${move}`);

        if (move && g.status === 'playing') {
            await apiPost(`/api/game/${gameId}/human-move`, { move });
        }
    } catch (e) {
        console.error(`[WASM] Auto-move error for ${side}:`, e);
    }
}

/**
 * Normalize score to red's perspective (positive = good for red).
 * Pikafish reports from side-to-move's perspective.
 */
function normalizeScoreToRed(score, fen) {
    if (!score) return score;
    const parts = fen.split(' ');
    const sideToMove = parts[1] || 'w';
    if (sideToMove === 'b') {
        return { type: score.type, value: -score.value };
    }
    return { type: score.type, value: score.value };
}

/**
 * Run WASM eval on a position and broadcast results locally.
 */
async function wasmEvaluatePosition(gameId, fen, moveNumber) {
    const g = gameStates.get(gameId);
    if (!g) return;

    const pikafishEnabled = document.getElementById('pikafish-enabled').checked;
    if (!pikafishEnabled) return;

    try {
        const engine = await getWasmEvalEngine();
        const mode = document.getElementById('pikafish-mode').value;
        const options = {
            mode: mode,
            movetime: parseInt(document.getElementById('pikafish-movetime').value) || 1000,
            depth: parseInt(document.getElementById('pikafish-depth').value) || 20,
        };
        const scoreType = document.getElementById('pikafish-score-type').value;

        // Set ScoreType UCI option before evaluation
        engine.setOption('ScoreType', scoreType);

        const result = await engine.evaluate(fen, options);

        if (result.score && moveNumber > 0 && moveNumber <= g.moveHistory.length) {
            // Normalize score to red's perspective
            const displayScore = normalizeScoreToRed(result.score, fen);
            g.moveHistory[moveNumber - 1].eval = displayScore;
            g.scoreType = scoreType;
            if (isActiveVisible(gameId)) {
                updateEvalDisplay(moveNumber, displayScore);
            }
        }
    } catch (e) {
        console.error('[WASM] Eval error:', e);
    }
}

function syncFlipBoardButton() {
    const btn = document.getElementById('btn-flip-board');
    if (!btn) return;
    btn.classList.toggle('is-active', boardFlipped);
    btn.setAttribute('aria-pressed', boardFlipped ? 'true' : 'false');
    btn.title = boardFlipped
        ? 'Black-side view is active. Click to restore red-side view.'
        : 'Flip the board so black is at the bottom.';
}

function setBoardFlipped(flipped) {
    boardFlipped = Boolean(flipped);
    if (renderer) {
        renderer.setFlipped(boardFlipped);
    }
    syncFlipBoardButton();
}

function toggleBoardFlipped() {
    setBoardFlipped(!boardFlipped);
}

function getConfiguredTimerInitialTime() {
    const timerInitialEl = document.getElementById('timer-initial');
    const minutes = timerInitialEl ? parseInt(timerInitialEl.value, 10) : NaN;
    const safeMinutes = Number.isFinite(minutes) && minutes > 0
        ? minutes
        : (DEFAULT_TIMER_INITIAL_SECONDS / 60);
    return safeMinutes * 60;
}

function syncTimerPreviewFromSettings() {
    const g = activeGame();
    if (g && g.status !== 'waiting') return;

    // If no active game, just update the display with settings preview
    const timerEnabledEl = document.getElementById('timer-enabled');
    const redEl = document.getElementById('timer-red');
    const blackEl = document.getElementById('timer-black');
    if (!redEl || !blackEl) return;

    if (timerEnabledEl && timerEnabledEl.checked) {
        const initialTime = getConfiguredTimerInitialTime();
        redEl.textContent = formatTimerDisplay(initialTime);
        blackEl.textContent = formatTimerDisplay(initialTime);
        redEl.classList.remove('placeholder');
        blackEl.classList.remove('placeholder');
    } else {
        redEl.textContent = TIMER_PLACEHOLDER;
        blackEl.textContent = TIMER_PLACEHOLDER;
        redEl.classList.add('placeholder');
        blackEl.classList.add('placeholder');
    }
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `tab-${tabName}`);
    });
    if (tabName === 'history') {
        loadHistoryList();
    } else if (historyMode) {
        closeHistoryDetail();
    } else {
        stopHistoryAutoplay();
    }
}

function applyLlmOptionDefaults(side, presetName = null) {
    const thinkingEl = document.getElementById(`${side}-thinking-mode`);
    const promptEl = document.getElementById(`${side}-prompt-name`);
    if (!thinkingEl || !promptEl) return;

    if (!presetName || !presetConfigs[presetName]) {
        thinkingEl.value = 'true';
        setSelectValue(promptEl, defaultPromptName, defaultPromptName);
        return;
    }

    const preset = presetConfigs[presetName];
    thinkingEl.value = String(preset.enable_thinking !== false);
    setSelectValue(promptEl, preset.prompt_name || defaultPromptName, defaultPromptName);
}

function setSelectValue(selectEl, desiredValue, fallbackValue) {
    const values = Array.from(selectEl.options).map(opt => opt.value);
    if (desiredValue && values.includes(desiredValue)) {
        selectEl.value = desiredValue;
        return;
    }
    if (fallbackValue && values.includes(fallbackValue)) {
        selectEl.value = fallbackValue;
        return;
    }
    if (selectEl.options.length > 0) {
        selectEl.value = selectEl.options[0].value;
    }
}

function populatePromptOptions(side) {
    const promptEl = document.getElementById(`${side}-prompt-name`);
    if (!promptEl) return;

    const currentValue = promptEl.value;
    promptEl.innerHTML = '';

    const prompts = availablePrompts.length > 0
        ? availablePrompts
        : [{ name: defaultPromptName, display_name: defaultPromptName, description: '' }];

    for (const prompt of prompts) {
        const opt = document.createElement('option');
        opt.value = prompt.name;
        opt.textContent = prompt.display_name || prompt.name;
        if (prompt.description) {
            opt.title = prompt.description;
        }
        promptEl.appendChild(opt);
    }

    setSelectValue(promptEl, currentValue, defaultPromptName);
}

function applyDefaultPikafishPaths() {
    // No-op: WASM Pikafish doesn't need local engine paths.
}

function formatTimerDisplay(seconds) {
    if (seconds == null || !Number.isFinite(seconds)) {
        return TIMER_PLACEHOLDER;
    }
    if (seconds < 0) seconds = 0;
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function updateTimerDisplay() {
    const redEl = document.getElementById('timer-red');
    const blackEl = document.getElementById('timer-black');
    if (!redEl || !blackEl) return;
    const redSide = redEl.closest('.timer-side');
    const blackSide = blackEl.closest('.timer-side');

    const g = activeGame();
    if (!g || !g.timer.enabled) {
        // Show placeholder if no active game or timer disabled
        const timerEnabledEl = document.getElementById('timer-enabled');
        if (!g && timerEnabledEl && timerEnabledEl.checked) {
            // No game, show settings preview
            return;
        }
        if (g && !g.timer.enabled) {
            redEl.textContent = TIMER_PLACEHOLDER;
            blackEl.textContent = TIMER_PLACEHOLDER;
            redEl.classList.add('placeholder');
            blackEl.classList.add('placeholder');
            if (redSide) { redSide.classList.remove('active'); redSide.classList.add('inactive'); }
            if (blackSide) { blackSide.classList.remove('active'); blackSide.classList.add('inactive'); }
            return;
        }
        return;
    }

    const t = g.timer;
    let redTime = t.redTime;
    let blackTime = t.blackTime;

    // Subtract elapsed time for the active side
    if (t.activeSide && t.lastSync > 0) {
        const elapsed = (Date.now() - t.lastSync) / 1000;
        if (t.activeSide === 'w') {
            redTime = Math.max(0, redTime - elapsed);
        } else {
            blackTime = Math.max(0, blackTime - elapsed);
        }
    }

    const redIsPlaceholder = redTime == null || !Number.isFinite(redTime);
    const blackIsPlaceholder = blackTime == null || !Number.isFinite(blackTime);

    redEl.textContent = formatTimerDisplay(redTime);
    blackEl.textContent = formatTimerDisplay(blackTime);
    redEl.classList.toggle('placeholder', redIsPlaceholder);
    blackEl.classList.toggle('placeholder', blackIsPlaceholder);

    // Low time warning (< 60 seconds)
    redEl.classList.toggle('low-time', !redIsPlaceholder && redTime < 60 && redTime > 0);
    blackEl.classList.toggle('low-time', !blackIsPlaceholder && blackTime < 60 && blackTime > 0);

    // Highlight active side
    if (redSide) {
        redSide.classList.toggle('active', t.activeSide === 'w');
        redSide.classList.toggle('inactive', redIsPlaceholder);
    }
    if (blackSide) {
        blackSide.classList.toggle('active', t.activeSide === 'b');
        blackSide.classList.toggle('inactive', blackIsPlaceholder);
    }
}

function startTimerInterval(g) {
    stopTimerInterval(g);
    g.timer.intervalId = setInterval(() => {
        if (activeGameId === g.gameId) updateTimerDisplay();
    }, 200);
}

function stopTimerInterval(g) {
    if (!g) return;
    if (g.timer.intervalId) {
        clearInterval(g.timer.intervalId);
        g.timer.intervalId = null;
    }
}

function resetTimerState(g) {
    if (!g) return;
    stopTimerInterval(g);
    g.timer.enabled = false;
    g.timer.redTime = null;
    g.timer.blackTime = null;
    g.timer.activeSide = null;
    g.timer.lastSync = 0;
    if (activeGameId === g.gameId) updateTimerDisplay();
}

// --- Game Tab Management ---

function switchActiveGame(gameId) {
    if (gameId === activeGameId) return;
    if (historyMode) closeHistoryDetail();

    // Save current game's log HTML
    const oldGame = activeGame();
    if (oldGame) {
        oldGame.logHTML = document.getElementById('game-log').innerHTML;
        oldGame.currentLogEntry = _currentLogEntry;
        oldGame.currentLogContent = _currentLogContent;
        oldGame.currentStreamEl = _currentStreamEl;
        oldGame.currentStreamCls = _currentStreamCls;
    }

    activeGameId = gameId;
    const g = activeGame();
    if (!g) return;

    // Restore log
    document.getElementById('game-log').innerHTML = g.logHTML;
    _currentLogEntry = g.currentLogEntry;
    _currentLogContent = g.currentLogContent;
    _currentStreamEl = g.currentStreamEl;
    _currentStreamCls = g.currentStreamCls;

    // Restore board
    renderer.clearSelection();
    if (g.viewIndex === -1) {
        renderer.render(g.fen, g.lastMove);
    } else if (g.viewIndex === 0) {
        renderer.render(g.fen); // initial
    } else {
        const entry = g.moveHistory[g.viewIndex - 1];
        if (entry) renderer.render(entry.fen, entry.move);
    }

    // Restore timer display
    updateTimerDisplay();

    // Restore eval chart
    drawEvalChart();

    updateUI();
    updateTurnIndicator();
    updateHumanInteractive();
}

function closeGameTab(gameId) {
    const g = gameStates.get(gameId);
    if (!g) return;

    // Close SSE
    if (g.eventSource) {
        g.eventSource.close();
        g.eventSource = null;
    }
    stopTimerInterval(g);

    // Cleanup WASM engines
    cleanupWasmEngines(gameId);

    // If game is playing/paused, try to reset it on server
    if (g.status === 'playing' || g.status === 'paused') {
        apiPost(`/api/game/${gameId}/reset`).catch(() => {});
    }

    gameStates.delete(gameId);

    if (activeGameId === gameId) {
        // Switch to another game, or clear
        const remaining = Array.from(gameStates.keys());
        if (remaining.length > 0) {
            activeGameId = null; // force full switch
            switchActiveGame(remaining[remaining.length - 1]);
        } else {
            activeGameId = null;
            clearGameLog();
            renderer.clearSelection();
            renderer.render(DEFAULT_FEN);
            document.getElementById('fen-input').value = DEFAULT_FEN;
            hideGameOver();
            syncTimerPreviewFromSettings();
            updateUI();
        }
    }
}

// --- Initialization ---

document.addEventListener('DOMContentLoaded', async () => {
    const canvas = document.getElementById('board-canvas');
    renderer = new BoardRenderer(canvas);
    syncFlipBoardButton();
    renderer.render(DEFAULT_FEN);

    document.getElementById('fen-input').value = DEFAULT_FEN;

    // Load prompts and presets from server
    await loadPrompts();
    await loadPresets();

    updateUI();
    syncRightColumnHeight();

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            switchTab(btn.dataset.tab);
        });
    });

    // Player type toggle - show/hide LLM / Pikafish fields
    for (const side of ['red', 'black']) {
        const sel = document.getElementById(`${side}-type`);
        const pikafishMode = document.getElementById(`${side}-pikafish-mode`);
        const pikafishMovetimeField = document.getElementById(`${side}-pikafish-movetime-field`);
        const pikafishDepthField = document.getElementById(`${side}-pikafish-depth-field`);

        pikafishMode.addEventListener('change', () => {
            pikafishMovetimeField.style.display = pikafishMode.value === 'movetime' ? '' : 'none';
            pikafishDepthField.style.display = pikafishMode.value === 'depth' ? '' : 'none';
        });

        sel.addEventListener('change', () => {
            const val = sel.value;
            const isLLM = val.startsWith('llm');
            const isPikafish = val === 'pikafish';
            document.getElementById(`${side}-llm-fields`).style.display = isLLM ? 'block' : 'none';
            document.getElementById(`${side}-custom-fields`).style.display =
                (val === 'llm:custom') ? 'block' : 'none';
            document.getElementById(`${side}-pikafish-fields`).style.display = isPikafish ? 'block' : 'none';
            if (val.startsWith('llm:') && val !== 'llm:custom') {
                applyLlmOptionDefaults(side, val.substring(4));
            } else if (val === 'llm:custom') {
                applyLlmOptionDefaults(side);
            }
        });
        pikafishMode.dispatchEvent(new Event('change'));
        sel.dispatchEvent(new Event('change'));
    }

    // Buttons
    document.getElementById('btn-pause').addEventListener('click', onPause);
    document.getElementById('btn-reset').addEventListener('click', onReset);
    document.getElementById('btn-step-back').addEventListener('click', onStepBack);
    document.getElementById('btn-step-forward').addEventListener('click', onStepForward);
    document.getElementById('btn-init-fen').addEventListener('click', onInitFEN);
    document.getElementById('btn-load-fen').addEventListener('click', onLoadFEN);
    document.getElementById('btn-export-fen').addEventListener('click', onExportFEN);
    document.getElementById('btn-flip-board').addEventListener('click', toggleBoardFlipped);
    document.getElementById('btn-new-game').addEventListener('click', onNewGame);
    document.getElementById('btn-leaderboard').addEventListener('click', toggleLeaderboard);

    // Pikafish settings toggle
    const pikafishEnabled = document.getElementById('pikafish-enabled');
    const pikafishOptions = document.getElementById('pikafish-options');
    const pikafishMode = document.getElementById('pikafish-mode');
    const pikafishMovetimeField = document.getElementById('pikafish-movetime-field');
    const pikafishDepthField = document.getElementById('pikafish-depth-field');

    pikafishEnabled.addEventListener('change', () => {
        pikafishOptions.style.display = pikafishEnabled.checked ? '' : 'none';
    });
    pikafishMode.addEventListener('change', () => {
        pikafishMovetimeField.style.display = pikafishMode.value === 'movetime' ? '' : 'none';
        pikafishDepthField.style.display = pikafishMode.value === 'depth' ? '' : 'none';
    });
    pikafishEnabled.dispatchEvent(new Event('change'));
    pikafishMode.dispatchEvent(new Event('change'));

    // Timer settings toggle
    const timerEnabled = document.getElementById('timer-enabled');
    const timerOptions = document.getElementById('timer-options');
    const timerInitial = document.getElementById('timer-initial');
    timerEnabled.addEventListener('change', () => {
        timerOptions.style.display = timerEnabled.checked ? '' : 'none';
        syncTimerPreviewFromSettings();
    });
    timerInitial.addEventListener('input', syncTimerPreviewFromSettings);
    timerInitial.addEventListener('change', syncTimerPreviewFromSettings);
    timerEnabled.dispatchEvent(new Event('change'));

    // Board click-to-move callbacks
    renderer.onMoveCallback = (move) => {
        const g = activeGame();
        if (g && g.status === 'playing') {
            submitHumanMove(move);
        }
    };
    renderer.onSelectCallback = (col, row) => {
        const g = activeGame();
        if (g && g.status === 'playing') {
            fetchLegalMovesForPiece(col, row);
        }
    };

    const mainAreaEl = document.getElementById('main-area');
    const boardColumnEl = document.getElementById('board-column');
    const logEl = document.getElementById('game-log');
    if (logEl && typeof MutationObserver !== 'undefined') {
        const logObserver = new MutationObserver(() => {
            scheduleRightColumnHeightSync();
        });
        logObserver.observe(logEl, {
            childList: true,
            subtree: true,
            characterData: true,
        });
    }

    if (typeof ResizeObserver !== 'undefined') {
        const layoutObserver = new ResizeObserver(() => {
            scheduleRightColumnHeightSync();
        });
        if (mainAreaEl) layoutObserver.observe(mainAreaEl);
        if (boardColumnEl) layoutObserver.observe(boardColumnEl);
    }

    window.addEventListener('resize', () => {
        scheduleRightColumnHeightSync();
        scheduleRightColumnHeightSync(120);
    });

    // Init eval chart tooltip
    _initEvalChartTooltip();

    // History tab buttons
    document.getElementById('btn-history-refresh').addEventListener('click', (e) => {
        e.stopPropagation();
        loadHistoryList();
    });

    // History filter controls
    const filterInputs = ['filter-player', 'filter-result', 'filter-date-start', 'filter-date-end', 'filter-moves-min', 'filter-moves-max'];
    for (const id of filterInputs) {
        document.getElementById(id).addEventListener('input', applyHistoryFilters);
        document.getElementById(id).addEventListener('change', applyHistoryFilters);
    }
    document.getElementById('btn-filter-reset').addEventListener('click', () => {
        for (const id of filterInputs) document.getElementById(id).value = '';
        applyHistoryFilters();
    });

    document.getElementById('btn-history-back').addEventListener('click', closeHistoryDetail);
    document.getElementById('btn-hist-first').addEventListener('click', historyGoFirst);
    document.getElementById('btn-hist-prev').addEventListener('click', historyStepPrev);
    document.getElementById('btn-hist-next').addEventListener('click', historyStepNext);
    document.getElementById('btn-hist-last').addEventListener('click', historyGoLast);
    document.getElementById('btn-hist-autoplay').addEventListener('click', historyToggleAutoplay);
    document.getElementById('btn-hist-export-gif').addEventListener('click', historyExportGif);

    // History keyboard navigation
    document.addEventListener('keydown', (e) => {
        if (!historyMode) return;
        const activeTab = document.querySelector('.tab-btn.active');
        if (!activeTab || activeTab.dataset.tab !== 'history') return;
        switch (e.key) {
            case 'ArrowLeft':
            case 'ArrowUp':
                e.preventDefault();
                historyStepPrev();
                break;
            case 'ArrowRight':
            case 'ArrowDown':
                e.preventDefault();
                historyStepNext();
                break;
            case 'Home':
                e.preventDefault();
                historyGoFirst();
                break;
            case 'End':
                e.preventDefault();
                historyGoLast();
                break;
            case 'Escape':
                e.preventDefault();
                closeHistoryDetail();
                break;
        }
    });
});

// --- Presets ---

async function loadPresets() {
    try {
        const resp = await fetch('/api/presets');
        const data = await resp.json();
        const presets = data.presets || [];
        defaultPikafishPath = data.default_pikafish_path || defaultPikafishPath;
        defaultEvalPikafishPath = data.default_eval_pikafish_path || defaultPikafishPath;

        for (const side of ['red', 'black']) {
            const typeSel = document.getElementById(`${side}-type`);
            for (const p of presets) {
                presetConfigs[p.name] = {
                    prompt_name: p.prompt_name || defaultPromptName,
                    enable_thinking: p.enable_thinking !== false,
                };
                const opt = document.createElement('option');
                opt.value = 'llm:' + p.name;
                opt.textContent = p.name;
                typeSel.appendChild(opt);
            }
            const customOpt = document.createElement('option');
            customOpt.value = 'llm:custom';
            customOpt.textContent = 'Custom LLM (自定义)';
            typeSel.appendChild(customOpt);
        }
    } catch (e) {
        defaultEvalPikafishPath = defaultPikafishPath;
        for (const side of ['red', 'black']) {
            const typeSel = document.getElementById(`${side}-type`);
            const opt = document.createElement('option');
            opt.value = 'llm:custom';
            opt.textContent = 'Custom LLM (自定义)';
            typeSel.appendChild(opt);
        }
    }

    applyDefaultPikafishPaths();
}

async function loadPrompts() {
    try {
        const resp = await fetch('/api/prompts');
        const data = await resp.json();
        availablePrompts = data.prompts || [];
        defaultPromptName = data.default_prompt_name || availablePrompts[0]?.name || 'zh';
    } catch (e) {
        availablePrompts = [];
        defaultPromptName = 'zh';
    }

    for (const side of ['red', 'black']) {
        populatePromptOptions(side);
    }
}

// --- API Calls ---

async function apiPost(path, body = {}) {
    const resp = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: resp.statusText }));
        throw new Error(err.detail || 'API error');
    }
    return resp.json();
}

async function apiGet(path) {
    const resp = await fetch(path);
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: resp.statusText }));
        throw new Error(err.detail || 'API error');
    }
    return resp.json();
}

function getConfigs() {
    const result = {};
    for (const side of ['red', 'black']) {
        const typeSelect = document.getElementById(`${side}-type`);
        const typeVal = typeSelect.value || typeSelect.options[typeSelect.selectedIndex]?.value || '';
        const llmOptions = {
            enable_thinking: document.getElementById(`${side}-thinking-mode`).value === 'true',
            prompt_name: document.getElementById(`${side}-prompt-name`).value,
        };
        if (typeVal === 'human' || typeVal === 'random') {
            result[side] = { type: typeVal };
        } else if (typeVal === 'llm:custom') {
            result[side] = {
                type: 'llm',
                api_base: document.getElementById(`${side}-api-base`).value.trim(),
                api_key: document.getElementById(`${side}-api-key`).value.trim(),
                model: document.getElementById(`${side}-model`).value.trim(),
                ...llmOptions,
            };
        } else if (typeVal.startsWith('llm:')) {
            result[side] = {
                type: 'llm',
                preset: typeVal.substring(4),
                ...llmOptions,
            };
        } else if (typeVal === 'pikafish') {
            result[side] = {
                type: 'pikafish',
                engine_mode: document.getElementById(`${side}-pikafish-mode`).value,
                engine_movetime: parseInt(document.getElementById(`${side}-pikafish-movetime`).value) || 1000,
                engine_depth: parseInt(document.getElementById(`${side}-pikafish-depth`).value) || 20,
            };
        } else {
            throw new Error(`Unsupported ${side} player type: ${typeVal || '(empty)'}`);
        }
    }
    return result;
}

function _getPlayerLabel(side, configs) {
    const c = configs[side];
    if (!c) return side;
    if (c.type === 'human') return 'Human';
    if (c.type === 'random') return 'Random';
    if (c.type === 'pikafish') return 'Pikafish';
    if (c.type === 'llm') return c.preset || c.model || 'LLM';
    return c.type;
}

// --- Event Handlers ---

async function onNewGame() {
    try {
        const configs = getConfigs();
        for (const side of ['red', 'black']) {
            if (!configs[side]) {
                throw new Error(`Missing ${side} side configuration. Please reselect Player Type.`);
            }
            if (configs[side].type === 'llm' && !configs[side].preset) {
                if (!configs[side].api_base || !configs[side].api_key || !configs[side].model) {
                    alert(`Please fill in ${side} side LLM configuration.`);
                    return;
                }
            }
        }

        const fen = document.getElementById('fen-input').value.trim() || DEFAULT_FEN;

        setStatus('Creating game...');
        const pikafishConfig = {
            enabled: document.getElementById('pikafish-enabled').checked,
            mode: document.getElementById('pikafish-mode').value,
            movetime: parseInt(document.getElementById('pikafish-movetime').value) || 2000,
            depth: parseInt(document.getElementById('pikafish-depth').value) || 20,
            score_type: document.getElementById('pikafish-score-type').value,
        };
        const timerEnabledChecked = document.getElementById('timer-enabled').checked;
        const timerConfig = {
            enabled: timerEnabledChecked,
            initial_time: timerEnabledChecked ? getConfiguredTimerInitialTime() : DEFAULT_TIMER_INITIAL_SECONDS,
            increment: timerEnabledChecked ? parseInt(document.getElementById('timer-increment').value) : 10,
        };
        const { game_id } = await apiPost('/api/game/create', {
            fen,
            red: configs.red,
            black: configs.black,
            pikafish: pikafishConfig,
            timer: timerConfig,
        });

        const g = createGameState(game_id, {
            fen,
            redLabel: _getPlayerLabel('red', configs),
            blackLabel: _getPlayerLabel('black', configs),
        });

        // Initialize timer
        if (timerConfig.enabled) {
            g.timer.enabled = true;
            g.timer.redTime = timerConfig.initial_time;
            g.timer.blackTime = timerConfig.initial_time;
        }

        gameStates.set(game_id, g);

        // Save current game log before switching
        const oldGame = activeGame();
        if (oldGame) {
            oldGame.logHTML = document.getElementById('game-log').innerHTML;
            oldGame.currentLogEntry = _currentLogEntry;
            oldGame.currentLogContent = _currentLogContent;
            oldGame.currentStreamEl = _currentStreamEl;
            oldGame.currentStreamCls = _currentStreamCls;
        }

        activeGameId = game_id;
        clearGameLog();
        renderer.clearSelection();
        renderer.render(g.fen);
        updateTimerDisplay();
        switchTab('log');

        updateUI();
        updateHumanInteractive();

        // Auto-start the game
        setStatus('Starting game...');
        g.status = 'playing';
        connectSSE(game_id);
        await apiPost(`/api/game/${game_id}/start`);
        setStatus('Game started');
        updateUI();
        updateHumanInteractive();
    } catch (e) {
        alert('Failed to create game: ' + e.message);
        setStatus('Error: ' + e.message);
    }
}

function closeGameStream(g) {
    if (!g || !g.eventSource) return;
    g.eventSource.close();
    g.eventSource = null;
}

function enterReadyState(fen, statusMessage = 'Ready') {
    // This is only used for reset of the active game or when no game exists
    const g = activeGame();
    if (g) {
        closeGameStream(g);
        gameStates.delete(g.gameId);
        activeGameId = null;
    }

    // Switch to another remaining game or show empty state
    const remaining = Array.from(gameStates.keys());
    if (remaining.length > 0) {
        switchActiveGame(remaining[remaining.length - 1]);
    } else {
        clearGameLog();
        renderer.clearSelection();
        renderer.humanInteractive = false;
        renderer.render(fen);
        document.getElementById('fen-input').value = fen;
        hideGameOver();
        syncTimerPreviewFromSettings();
        setStatus(statusMessage);
        updateUI();
    }
}

function applySeekState(data, statusMessage = null) {
    const g = activeGame();
    if (!g) return;
    g.fen = data.fen;
    g.turn = (data.turn === 'black' ? 'b' : 'w');
    g.moveHistory = data.move_history || [];
    g.lastMove = g.moveHistory.length > 0 ? g.moveHistory[g.moveHistory.length - 1].move : null;
    g.viewIndex = -1;

    syncGameLogWithHistory();
    renderer.clearSelection();
    renderer.render(g.fen, g.lastMove);
    if (statusMessage) {
        setStatus(statusMessage);
    }
    updateUI();
    updateHumanInteractive();
}

async function onPause() {
    const g = activeGame();
    if (!g) return;
    try {
        if (g.status === 'playing') {
            await apiPost(`/api/game/${g.gameId}/pause`);
            g.status = 'paused';
        } else if (g.status === 'paused') {
            if (g.viewIndex !== -1) {
                await apiPost(`/api/game/${g.gameId}/seek`, { ply: g.viewIndex });
            }
            await apiPost(`/api/game/${g.gameId}/resume`);
            g.status = 'playing';
        }
        updateUI();
        updateHumanInteractive();
        } catch (e) {
        alert('Error: ' + e.message);
    }
}

async function onReset() {
    const g = activeGame();
    if (!g) return;
    closeGameStream(g);
    try { await apiPost(`/api/game/${g.gameId}/reset`); } catch (_) {}
    stopTimerInterval(g);
    enterReadyState(document.getElementById('fen-input').value.trim() || DEFAULT_FEN, 'Ready');
}

function onInitFEN() {
    const g = activeGame();
    if (g && (g.status === 'playing' || g.status === 'paused')) return;

    document.getElementById('fen-input').value = DEFAULT_FEN;
    if (!g) {
        renderer.render(DEFAULT_FEN);
        setStatus('Initial position loaded');
    }
}

function onLoadFEN() {
    const g = activeGame();
    if (g && (g.status === 'playing' || g.status === 'paused')) return;

    const fen = document.getElementById('fen-input').value.trim();
    if (!fen) return;
    try {
        renderer.render(fen);
        setStatus('FEN loaded');
    } catch (e) {
        alert('Invalid FEN');
    }
}

function onExportFEN() {
    let fen;
    if (historyMode && historyGame) {
        if (historyViewIndex === 0) {
            fen = historyGame.initial_fen || DEFAULT_FEN;
        } else {
            const m = (historyGame.moves || [])[historyViewIndex - 1];
            fen = m ? m.fen : DEFAULT_FEN;
        }
    } else {
        const g = activeGame();
        if (!g) {
            fen = document.getElementById('fen-input').value.trim() || DEFAULT_FEN;
        } else if (g.viewIndex === -1) {
            fen = g.fen;
        } else if (g.viewIndex === 0) {
            fen = document.getElementById('fen-input').value.trim() || DEFAULT_FEN;
        } else {
            fen = g.moveHistory[g.viewIndex - 1].fen;
        }
    }
    if (navigator.clipboard) {
        navigator.clipboard.writeText(fen).then(() => {
            setStatus('FEN copied: ' + fen);
        }).catch(() => {
            prompt('Current FEN:', fen);
        });
    } else {
        prompt('Current FEN:', fen);
    }
}

function onStepBack() {
    const g = activeGame();
    if (!g || g.moveHistory.length === 0) return;
    if (g.viewIndex === -1) {
        g.viewIndex = g.moveHistory.length - 1;
    } else if (g.viewIndex > 0) {
        g.viewIndex--;
    } else {
        return;
    }
    showViewIndex();
    updateUI();
}

function onStepForward() {
    const g = activeGame();
    if (!g || g.viewIndex === -1) return;
    g.viewIndex++;
    if (g.viewIndex >= g.moveHistory.length) {
        g.viewIndex = -1;
    }
    showViewIndex();
    updateUI();
}

function showViewIndex() {
    const g = activeGame();
    if (!g) return;
    if (g.viewIndex === -1) {
        renderer.render(g.fen, g.lastMove);
    } else if (g.viewIndex === 0) {
        const initialFen = document.getElementById('fen-input').value.trim() || DEFAULT_FEN;
        renderer.render(initialFen);
    } else {
        const entry = g.moveHistory[g.viewIndex - 1];
        renderer.render(entry.fen, entry.move);
    }
}

async function submitHumanMove(move) {
    const g = activeGame();
    if (!g) return;
    try {
        renderer.humanInteractive = false;
        await apiPost(`/api/game/${g.gameId}/human-move`, { move });
    } catch (e) {
        alert('Invalid move: ' + e.message);
        updateHumanInteractive();
    }
}

async function fetchLegalMovesForPiece(col, row) {
    const g = activeGame();
    if (!g) return;
    try {
        const data = await apiGet(`/api/game/${g.gameId}/legal-moves?col=${col}&row=${row}`);
        if (data.moves) {
            const legalMoves = data.moves.map(m => ({
                col: m.charCodeAt(2) - 97,
                row: parseInt(m[3]),
            }));
            renderer.setLegalMoves(legalMoves);
        }
    } catch (e) {
        // ignore
    }
}

function updateHumanInteractive() {
    const g = activeGame();
    if (historyMode || !g || g.status !== 'playing' || g.viewIndex !== -1) {
        renderer.humanInteractive = false;
        return;
    }
    const side = g.turn === 'w' ? 'red' : 'black';
    const type = document.getElementById(`${side}-type`).value;
    renderer.humanInteractive = (type === 'human');
}

// --- SSE ---

/** Check if this game is active AND the user is not in history replay mode */
function isActiveVisible(gameId) {
    return activeGameId === gameId && !historyMode;
}

function connectSSE(gameId) {
    const g = gameStates.get(gameId);
    if (!g) return;
    if (g.eventSource) g.eventSource.close();

    const es = new EventSource(`/api/game/${gameId}/stream`);
    g.eventSource = es;

    es.addEventListener('move', (e) => {
        const data = JSON.parse(e.data);
        g.fen = data.fen;
        g.turn = data.fen.split(' ')[1] || 'w';
        g.lastMove = data.move;
        g.moveHistory.push(data);

        if (isActiveVisible(gameId)) {
            finalizeLogEntry(data);
            if (g.viewIndex === -1) {
                renderer.render(g.fen, data.move);
            }
            updateTurnIndicator();
            updateHumanInteractive();
        }

        // Trigger browser-side WASM eval if enabled
        if (data.number && data.fen) {
            wasmEvaluatePosition(gameId, data.fen, data.number);
        }
    });

    es.addEventListener('reasoning', (e) => {
        const data = JSON.parse(e.data);
        if (isActiveVisible(gameId)) {
            appendToCurrentLog(data.side, data.content, 'reasoning', true);
        }
    });

    es.addEventListener('thinking', (e) => {
        const data = JSON.parse(e.data);
        if (isActiveVisible(gameId)) {
            appendToCurrentLog(data.side, data.content, 'thinking', true);
        }
    });

    es.addEventListener('tool_call', (e) => {
        const data = JSON.parse(e.data);
        if (isActiveVisible(gameId)) {
            const argsStr = data.args && Object.keys(data.args).length > 0 ? JSON.stringify(data.args) : '';
            appendToCurrentLog(data.side, `> Tool: ${data.tool}(${argsStr})`, 'tool-call', false);
        }
    });

    es.addEventListener('tool_result', (e) => {
        const data = JSON.parse(e.data);
        if (isActiveVisible(gameId)) {
            const resultStr = data.result.length > 200 ? data.result.slice(0, 200) + '...' : data.result;
            appendToCurrentLog(data.side, `  Result: ${resultStr}`, 'tool-result', false);
        }
    });

    es.addEventListener('turn', (e) => {
        const data = JSON.parse(e.data);
        g.turn = data.side === 'red' ? 'w' : 'b';
        if (data.fen) g.fen = data.fen;
        if (isActiveVisible(gameId)) {
            updateTurnIndicator();
            setStatus(`${data.side === 'red' ? 'Red' : 'Black'} is thinking...`);
            updateHumanInteractive();
            createLogEntry(data.side);
        }
        if (g.timer.enabled) {
            g.timer.activeSide = g.turn;
            g.timer.lastSync = Date.now();
            startTimerInterval(g);
        }
    });

    es.addEventListener('timer', (e) => {
        const data = JSON.parse(e.data);
        g.timer.redTime = data.red;
        g.timer.blackTime = data.black;
        g.timer.lastSync = Date.now();
        if (isActiveVisible(gameId)) updateTimerDisplay();
    });

    es.addEventListener('waiting_human', (e) => {
        const data = JSON.parse(e.data);
        if (isActiveVisible(gameId)) {
            setStatus(`Waiting for ${data.side} (human) to move...`);
            updateHumanInteractive();
        }
        // If this side is a Pikafish WASM player, auto-compute and submit move
        const sideType = document.getElementById(`${data.side}-type`).value;
        if (sideType === 'pikafish') {
            if (isActiveVisible(gameId)) {
                setStatus(`${data.side === 'red' ? 'Red' : 'Black'} Pikafish (WASM) is thinking...`);
            }
            wasmAutoMove(gameId, data.side);
        }
    });

    es.addEventListener('game_over', (e) => {
        const data = JSON.parse(e.data);
        g.status = 'finished';
        stopTimerInterval(g);
        g.timer.activeSide = null;

        // Cleanup WASM engines for this game
        cleanupWasmEngines(gameId);

        if (isActiveVisible(gameId)) {
            renderer.humanInteractive = false;
            updateTimerDisplay();
            showGameOver(data.winner, data.reason);
            setStatus('Game over');
            updateUI();
        }
        // Refresh leaderboard after log is written
        setTimeout(() => {
            const activeTab = document.querySelector('.tab-btn.active');
            if (activeTab && activeTab.dataset.tab === 'leaderboard') loadLeaderboard();
        }, 3000);
    });

    es.addEventListener('seek', (e) => {
        const data = JSON.parse(e.data);
        if (isActiveVisible(gameId)) {
            applySeekState(data, `Position reset to move #${data.ply}`);
        }
    });

    es.addEventListener('eval', (e) => {
        const data = JSON.parse(e.data);
        g.scoreType = data.score_type || 'Elo';
        if (data.move_number > 0 && data.move_number <= g.moveHistory.length) {
            g.moveHistory[data.move_number - 1].eval = data.score;
        }
        if (isActiveVisible(gameId)) {
            updateEvalDisplay(data.move_number, data.score);
        }
    });

    es.addEventListener('status', (e) => {
        const data = JSON.parse(e.data);
        if (data.status === 'paused') {
            g.status = 'paused';
            stopTimerInterval(g);
            g.timer.activeSide = null;
            if (isActiveVisible(gameId)) {
                setStatus('Game paused');
                updateTimerDisplay();
            }
        } else if (data.status === 'playing') {
            g.status = 'playing';
            if (isActiveVisible(gameId)) {
                setStatus('Game resumed');
            }
        } else if (data.status === 'finished') {
            g.status = 'finished';
            stopTimerInterval(g);
            g.timer.activeSide = null;
            if (isActiveVisible(gameId)) {
                setStatus('Game over');
                updateTimerDisplay();
            }
        }
        if (isActiveVisible(gameId)) {
            updateUI();
            updateHumanInteractive();
        }
        });

    es.addEventListener('error', (e) => {
        try {
            const data = JSON.parse(e.data);
            if (activeGameId === gameId) {
                setStatus('Error: ' + (data.message || 'Connection error'));
            }
        } catch (_) {}
    });

    es.onerror = () => {
        if (g.status === 'playing' && activeGameId === gameId) {
            setStatus('Connection lost, reconnecting...');
        }
    };
}

// --- UI Updates ---

function updateUI() {
    const g = activeGame();
    const status = g ? g.status : 'waiting';
    const isPlaying = status === 'playing';
    const isPaused = status === 'paused';
    const isWaiting = status === 'waiting';
    const isGameActive = isPlaying || isPaused;
    const hasGame = !!g;

    document.getElementById('btn-pause').disabled = !hasGame || (!isPlaying && !isPaused);
    document.getElementById('btn-pause').textContent = isPaused ? 'Resume' : 'Pause';
    document.getElementById('btn-reset').disabled = !hasGame || isWaiting;
    document.getElementById('fen-input').disabled = isGameActive;
    document.getElementById('btn-load-fen').disabled = isGameActive;
    document.getElementById('btn-init-fen').disabled = isGameActive;

    // Step back/forward
    const moveCount = g ? g.moveHistory.length : 0;
    const viewIndex = g ? g.viewIndex : -1;
    document.getElementById('btn-step-back').disabled = moveCount === 0 || (viewIndex === 0);
    document.getElementById('btn-step-forward').disabled = viewIndex === -1;

    updateTurnIndicator();
    scheduleRightColumnHeightSync();
}

function updateTurnIndicator() {
    const el = document.getElementById('turn-indicator');
    const g = activeGame();

    if (!g) {
        el.className = '';
        el.innerHTML = 'Ready to start';
        return;
    }

    const side = g.turn === 'w' ? 'red' : 'black';
    const sideName = side === 'red' ? 'Red (红方)' : 'Black (黑方)';
    el.className = side;

    if (g.viewIndex !== -1) {
        el.innerHTML = g.viewIndex === 0
            ? 'Viewing initial position'
            : `Viewing after move #${g.viewIndex} / ${g.moveHistory.length}`;
    } else if (g.status === 'finished') {
        el.innerHTML = `Game Over`;
    } else if (g.status === 'waiting') {
        el.innerHTML = `Ready to start`;
    } else {
        el.innerHTML = `<span class="turn-dot"></span> ${sideName}'s turn | Move #${g.moveHistory.length + 1}`;
    }
}

function setStatus(msg) {
    document.getElementById('status-bar').textContent = msg;
}

function sanitizeFilenamePart(text) {
    const cleaned = String(text || '')
        .trim()
        .replace(/[<>:"/\\|?*\x00-\x1f]+/g, '_')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^[ ._]+|[ ._]+$/g, '');
    return (cleaned || 'unknown').slice(0, 80);
}

function triggerBlobDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function yieldToBrowser() {
    return new Promise(resolve => window.setTimeout(resolve, 0));
}

function scheduleRightColumnHeightSync(delayMs = 0) {
    if (delayMs > 0) {
        if (rightColumnSyncTimeoutId) {
            clearTimeout(rightColumnSyncTimeoutId);
        }
        rightColumnSyncTimeoutId = setTimeout(() => {
            rightColumnSyncTimeoutId = null;
            scheduleRightColumnHeightSync();
        }, delayMs);
        return;
    }

    if (rightColumnSyncScheduled) return;
    rightColumnSyncScheduled = true;
    requestAnimationFrame(() => {
        rightColumnSyncScheduled = false;
        syncRightColumnHeight();
    });
}

function syncRightColumnHeight() {
    const rightCol = document.getElementById('right-column');
    const leftCol = document.getElementById('board-column');
    if (!rightCol || !leftCol) return;

    if (window.innerWidth <= 960) {
        rightCol.style.removeProperty('height');
        return;
    }

    rightCol.style.height = `${leftCol.offsetHeight}px`;
}

// --- Unified Game Log ---
let _currentLogEntry = null;
let _currentLogContent = null;
let _currentStreamEl = null;
let _currentStreamCls = null;

function formatMoveLabel(moveData) {
    const move = moveData.move || '';
    return moveData.move_zh ? `${move}（${moveData.move_zh}）` : move;
}

function getGameLogEl() {
    return document.getElementById('game-log');
}

function isLogNearBottom(logEl, threshold = 24) {
    if (!logEl) return true;
    return logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight <= threshold;
}

function scrollLogToBottom(shouldStick = true) {
    const logEl = getGameLogEl();
    if (!logEl || !shouldStick) return;
    logEl.scrollTop = logEl.scrollHeight;
}

function createLogEntry(side) {
    if (_currentLogEntry) {
        _currentLogEntry.removeAttribute('open');
    }

    const g = activeGame();
    const moveNum = g ? g.moveHistory.length + 1 : '?';
    const sideName = side === 'red' ? 'Red' : 'Black';
    const dotClass = side === 'red' ? 'red-dot' : 'black-dot';

    const details = document.createElement('details');
    details.className = `log-entry ${side}`;
    details.setAttribute('open', '');

    const summary = document.createElement('summary');
    summary.innerHTML = `<span class="dot ${dotClass}"></span> Move ${moveNum}: ${sideName} thinking...`;
    details.appendChild(summary);

    const content = document.createElement('div');
    content.className = 'log-entry-content';
    details.appendChild(content);

    const log = getGameLogEl();
    const shouldStick = isLogNearBottom(log);
    log.appendChild(details);
    scrollLogToBottom(shouldStick);

    _currentLogEntry = details;
    _currentLogContent = content;
    _currentStreamEl = null;
    _currentStreamCls = null;
}

function appendToCurrentLog(side, text, cls, streaming = false) {
    if (!_currentLogContent) {
        createLogEntry(side);
    }

    const log = getGameLogEl();
    const shouldStick = isLogNearBottom(log);

    if (streaming && (cls === 'reasoning' || cls === 'thinking')) {
        if (_currentStreamEl && _currentStreamCls === cls) {
            _currentStreamEl.textContent += text;
        } else {
            _currentStreamEl = null;
            _currentStreamCls = null;
            const el = document.createElement('div');
            el.className = `entry ${cls}`;
            el.textContent = text;
            _currentLogContent.appendChild(el);
            _currentStreamEl = el;
            _currentStreamCls = cls;
        }
    } else {
        _currentStreamEl = null;
        _currentStreamCls = null;
        const el = document.createElement('div');
        el.className = `entry ${cls}`;
        el.textContent = text;
        _currentLogContent.appendChild(el);
    }

    scrollLogToBottom(shouldStick);
}

function finalizeLogEntry(moveData) {
    if (_currentLogEntry) {
        const summary = _currentLogEntry.querySelector('summary');
        const sideName = moveData.side === 'red' ? 'Red' : 'Black';
        const dotClass = moveData.side === 'red' ? 'red-dot' : 'black-dot';
        const captured = moveData.captured ? ` x${moveData.captured}` : '';
        const existingBadge = summary.querySelector('.eval-badge');
        summary.innerHTML = `<span class="dot ${dotClass}"></span> #${moveData.number} ${sideName}: ${formatMoveLabel(moveData)}${captured}`;
        if (existingBadge) summary.appendChild(existingBadge);
        _currentLogEntry.removeAttribute('open');
    }
    _currentLogEntry = null;
    _currentLogContent = null;
    _currentStreamEl = null;
    _currentStreamCls = null;
}

function clearGameLog() {
    document.getElementById('game-log').innerHTML = '';
    _currentLogEntry = null;
    _currentLogContent = null;
    _currentStreamEl = null;
    _currentStreamCls = null;
    const chartContainer = document.getElementById('eval-chart-container');
    if (chartContainer) chartContainer.style.display = 'none';
}

function applyEvalBadge(summary, score, scoreType) {
    if (!summary || !score) return;

    let badge = summary.querySelector('.eval-badge');
    if (!badge) {
        badge = document.createElement('span');
        badge.className = 'eval-badge';
        summary.appendChild(badge);
    }

    badge.textContent = formatEvalScore(score, scoreType);
    const val = score.type === 'cp' ? score.value : (score.value > 0 ? 9999 : -9999);
    badge.classList.remove('eval-red', 'eval-black', 'eval-even');
    if (val > 0) badge.classList.add('eval-red');
    else if (val < 0) badge.classList.add('eval-black');
    else badge.classList.add('eval-even');
}

function appendHistoricalLogEntry(moveData) {
    const g = activeGame();
    const sideName = moveData.side === 'red' ? 'Red' : 'Black';
    const dotClass = moveData.side === 'red' ? 'red-dot' : 'black-dot';
    const captured = moveData.captured ? ` x${moveData.captured}` : '';

    const details = document.createElement('details');
    details.className = `log-entry ${moveData.side}`;

    const summary = document.createElement('summary');
    summary.innerHTML = `<span class="dot ${dotClass}"></span> #${moveData.number} ${sideName}: ${formatMoveLabel(moveData)}${captured}`;
    details.appendChild(summary);

    const content = document.createElement('div');
    content.className = 'log-entry-content';
    details.appendChild(content);

    if (moveData.eval) {
        const scoreType = (g && g.scoreType) || 'Elo';
        applyEvalBadge(summary, moveData.eval, moveData.score_type || scoreType);
    }

    getGameLogEl().appendChild(details);
}

function rebuildGameLogFromHistory() {
    const g = activeGame();
    if (!g) return;
    clearGameLog();
    for (const move of g.moveHistory) {
        appendHistoricalLogEntry(move);
    }
    drawEvalChart();
}

function syncGameLogWithHistory() {
    const g = activeGame();
    if (!g) return;
    const log = getGameLogEl();
    if (!log) return;

    const desiredCount = g.moveHistory.length;
    const entries = Array.from(log.querySelectorAll('.log-entry'));
    let keptCount = 0;

    for (const entry of entries) {
        const summary = entry.querySelector('summary');
        const match = summary ? summary.textContent.match(/#(\d+)/) : null;
        if (!match) {
            entry.remove();
            continue;
        }

        const moveNumber = parseInt(match[1], 10);
        if (!Number.isFinite(moveNumber) || moveNumber > desiredCount) {
            entry.remove();
            continue;
        }
        keptCount++;
    }

    _currentLogEntry = null;
    _currentLogContent = null;
    _currentStreamEl = null;
    _currentStreamCls = null;

    if (keptCount !== desiredCount) {
        rebuildGameLogFromHistory();
        return;
    }

    drawEvalChart();
}

// --- Eval Display ---

function formatEvalScore(score, scoreType) {
    if (score.type === 'mate') {
        return score.value > 0 ? `M${score.value}` : `M${score.value}`;
    }
    if (scoreType === 'Elo') {
        return score.value > 0 ? `+${score.value}` : `${score.value}`;
    }
    return score.value > 0 ? `+${score.value}` : `${score.value}`;
}

function updateEvalDisplay(moveNumber, score) {
    const g = activeGame();
    if (!g) return;
    // Store eval in moveHistory
    if (moveNumber > 0 && moveNumber <= g.moveHistory.length) {
        g.moveHistory[moveNumber - 1].eval = score;
    }

    const scoreType = g.scoreType || 'Elo';

    const logEntries = document.querySelectorAll('.log-entry');
    for (const entry of logEntries) {
        const summary = entry.querySelector('summary');
        if (!summary) continue;
        const match = summary.textContent.match(/#(\d+)/);
        if (match && parseInt(match[1]) === moveNumber) {
            applyEvalBadge(summary, score, scoreType);
            break;
        }
    }

    drawEvalChart();
}

function restoreEvalBadges() {
    const g = activeGame();
    if (!g) return;
    for (const move of g.moveHistory) {
        if (move.eval) {
            updateEvalDisplay(move.number, move.eval);
        }
    }
}

// --- Eval Chart ---

let _chartState = null;

function _getEvalPoints() {
    const g = activeGame();
    if (!g) return [];
    const isElo = (g.scoreType || 'Elo') === 'Elo';
    let maxAbs = 0;
    const rawEntries = [];
    for (const move of g.moveHistory) {
        if (move.eval) {
            // Skip mate 0 (checkmate position) — it flips sign misleadingly
            if (move.eval.type === 'mate' && move.eval.value === 0) continue;
            if (move.eval.type === 'mate') {
                rawEntries.push({ x: move.number, isMate: true, sign: move.eval.value > 0 ? 1 : -1, raw: move.eval });
            } else {
                const val = move.eval.value;
                if (Math.abs(val) > maxAbs) maxAbs = Math.abs(val);
                rawEntries.push({ x: move.number, isMate: false, y: val, raw: move.eval });
            }
        }
    }
    const mateCap = isElo ? 10000 : 10000;

    const points = [];
    for (const e of rawEntries) {
        if (e.isMate) {
            points.push({ x: e.x, y: e.sign * mateCap, raw: e.raw });
        } else {
            points.push({ x: e.x, y: e.y, raw: e.raw });
        }
    }
    return points;
}

function _pickYTicks(yRange) {
    const candidates = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
    for (const step of candidates) {
        if (yRange / step <= 4) return step;
    }
    return 5000;
}

function drawEvalChart() {
    const container = document.getElementById('eval-chart-container');
    const canvas = document.getElementById('eval-chart');
    if (!canvas || !container) return;

    const points = _getEvalPoints();
    if (points.length === 0) {
        container.style.display = 'none';
        _chartState = null;
        return;
    }
    container.style.display = 'block';

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const padL = 36, padR = 12, padT = 12, padB = 18;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    const maxAbs = Math.max(50, ...points.map(p => Math.abs(p.y)));
    const yRange = maxAbs * 1.15;

    const xMin = 1;
    const xMax = Math.max(points[points.length - 1].x, 2);

    function toCanvasX(x) { return padL + ((x - xMin) / (xMax - xMin)) * plotW; }
    function toCanvasY(y) { return padT + ((yRange - y) / (2 * yRange)) * plotH; }

    _chartState = { points, padL, padR, padT, padB, plotW, plotH, xMin, xMax, yRange, toCanvasX, toCanvasY, w, h };

    ctx.clearRect(0, 0, w, h);

    const midY = toCanvasY(0);
    ctx.fillStyle = 'rgba(180, 30, 30, 0.05)';
    ctx.fillRect(padL, padT, plotW, midY - padT);
    ctx.fillStyle = 'rgba(26, 26, 26, 0.05)';
    ctx.fillRect(padL, midY, plotW, padT + plotH - midY);

    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(padL, midY);
    ctx.lineTo(padL + plotW, midY);
    ctx.stroke();
    ctx.setLineDash([]);

    const yStep = _pickYTicks(yRange);
    ctx.fillStyle = '#2c2c2c';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let v = -Math.floor(yRange / yStep) * yStep; v <= yRange; v += yStep) {
        v = Math.round(v * 1000) / 1000;
        if (v === 0) continue;
        const cy = toCanvasY(v);
        if (cy < padT + 6 || cy > padT + plotH - 6) continue;
        const label = yStep < 1 ? v.toFixed(1) : String(v);
        ctx.fillText(v > 0 ? '+' + label : label, padL - 4, cy);
        ctx.strokeStyle = '#eee';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(padL, cy);
        ctx.lineTo(padL + plotW, cy);
        ctx.stroke();
    }

    ctx.fillStyle = '#2c2c2c';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const xStep = xMax <= 10 ? 2 : xMax <= 30 ? 5 : 10;
    for (let x = xStep; x <= xMax; x += xStep) {
        ctx.fillText(x, toCanvasX(x), padT + plotH + 3);
    }

    if (points.length >= 1) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(padL, padT, plotW, midY - padT);
        ctx.clip();
        ctx.beginPath();
        ctx.moveTo(toCanvasX(points[0].x), midY);
        for (const p of points) ctx.lineTo(toCanvasX(p.x), toCanvasY(p.y));
        ctx.lineTo(toCanvasX(points[points.length - 1].x), midY);
        ctx.closePath();
        ctx.fillStyle = 'rgba(180, 30, 30, 0.15)';
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.beginPath();
        ctx.rect(padL, midY, plotW, padT + plotH - midY);
        ctx.clip();
        ctx.beginPath();
        ctx.moveTo(toCanvasX(points[0].x), midY);
        for (const p of points) ctx.lineTo(toCanvasX(p.x), toCanvasY(p.y));
        ctx.lineTo(toCanvasX(points[points.length - 1].x), midY);
        ctx.closePath();
        ctx.fillStyle = 'rgba(26, 26, 26, 0.15)';
        ctx.fill();
        ctx.restore();
    }

    ctx.strokeStyle = '#c07830';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
        const cx = toCanvasX(points[i].x);
        const cy = toCanvasY(points[i].y);
        if (i === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
    }
    ctx.stroke();

    for (const p of points) {
        const cx = toCanvasX(p.x);
        const cy = toCanvasY(p.y);
        ctx.fillStyle = p.y >= 0 ? '#b41e1e' : '#1a1a1a';
        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.strokeStyle = '#ece6da';
    ctx.lineWidth = 1;
    ctx.strokeRect(padL, padT, plotW, plotH);
}

// --- Eval Chart Tooltip ---

function _initEvalChartTooltip() {
    const canvas = document.getElementById('eval-chart');
    if (!canvas) return;

    const tooltip = document.createElement('div');
    tooltip.id = 'eval-tooltip';
    tooltip.style.cssText = 'position:fixed;display:none;padding:4px 8px;background:rgba(44,44,44,0.92);color:#fff;font-size:11px;font-family:monospace;border-radius:4px;pointer-events:none;z-index:50;white-space:nowrap;';
    document.body.appendChild(tooltip);

    canvas.addEventListener('mousemove', (e) => {
        if (!_chartState || _chartState.points.length === 0) {
            tooltip.style.display = 'none';
            return;
        }

        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const { points, padL, padT, plotW, plotH, toCanvasX, toCanvasY } = _chartState;

        if (mx < padL || mx > padL + plotW || my < padT || my > padT + plotH) {
            tooltip.style.display = 'none';
            return;
        }

        let closest = null;
        let minDist = Infinity;
        for (const p of points) {
            const cx = toCanvasX(p.x);
            const dist = Math.abs(mx - cx);
            if (dist < minDist) {
                minDist = dist;
                closest = p;
            }
        }

        if (!closest || minDist > 30) {
            tooltip.style.display = 'none';
            return;
        }

        const g = activeGame();
        const scoreType = (g && g.scoreType) || 'Elo';
        const label = formatEvalScore(closest.raw, scoreType);
        const sideLabel = closest.y >= 0 ? 'Red' : 'Black';
        tooltip.textContent = `#${closest.x}  ${label}  (${sideLabel})`;
        tooltip.style.display = 'block';
        tooltip.style.left = (e.clientX + 12) + 'px';
        tooltip.style.top = (e.clientY - 28) + 'px';

        drawEvalChart();
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        ctx.save();
        ctx.scale(dpr, dpr);
        const hx = toCanvasX(closest.x);
        const hy = toCanvasY(closest.y);
        ctx.strokeStyle = 'rgba(192,120,48,0.4)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(hx, padT);
        ctx.lineTo(hx, padT + plotH);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#c07830';
        ctx.beginPath();
        ctx.arc(hx, hy, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
    });

    canvas.addEventListener('mouseleave', () => {
        tooltip.style.display = 'none';
        drawEvalChart();
    });
}

function showGameOver(winner, reason) {
    const banner = document.getElementById('game-over-banner');
    banner.className = `game-over-banner ${winner}`;
    banner.querySelector('h2').textContent =
        winner === 'red' ? 'Red Wins!' : winner === 'black' ? 'Black Wins!' : 'Draw';
    banner.querySelector('.reason').textContent = reason;
    banner.classList.remove('hidden');
}

function hideGameOver() {
    document.getElementById('game-over-banner').classList.add('hidden');
}

// --- History replay ---

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function loadHistoryList() {
    const listEl = document.getElementById('history-list');
    listEl.innerHTML = '<div class="history-empty">Loading...</div>';
    try {
        const [activeResp, logsResp] = await Promise.all([
            fetch('/api/games').then(r => r.json()).catch(() => ({ games: [] })),
            fetch('/api/logs').then(r => r.json()).catch(() => ({ logs: [] })),
        ]);

        _historyActiveGames = (activeResp.games || []).filter(g => g.status !== 'finished');
        _historyFinishedGames = (activeResp.games || []).filter(g => g.status === 'finished');
        _historyLogs = logsResp.logs || [];

        applyHistoryFilters();
    } catch (e) {
        listEl.innerHTML = '<div class="history-empty">Failed to load history.</div>';
    }
}

function applyHistoryFilters() {
    const playerQ = (document.getElementById('filter-player').value || '').trim().toLowerCase();
    const resultQ = document.getElementById('filter-result').value;
    const dateStart = document.getElementById('filter-date-start').value;
    const dateEnd = document.getElementById('filter-date-end').value;
    const movesMin = document.getElementById('filter-moves-min').value;
    const movesMax = document.getElementById('filter-moves-max').value;

    const filtered = _historyLogs.filter(log => {
        if (playerQ) {
            const r = (log.red_label || '').toLowerCase();
            const b = (log.black_label || '').toLowerCase();
            if (!r.includes(playerQ) && !b.includes(playerQ)) return false;
        }
        if (resultQ === 'red' && !log.result.includes('red wins')) return false;
        if (resultQ === 'black' && !log.result.includes('black wins')) return false;
        if (resultQ === 'draw' && (log.result.includes('red wins') || log.result.includes('black wins'))) return false;
        if (dateStart) {
            const logDate = (log.timestamp || '').slice(0, 10).replace(/\//g, '-');
            if (logDate < dateStart) return false;
        }
        if (dateEnd) {
            const logDate = (log.timestamp || '').slice(0, 10).replace(/\//g, '-');
            if (logDate > dateEnd) return false;
        }
        if (movesMin && log.move_count < parseInt(movesMin)) return false;
        if (movesMax && log.move_count > parseInt(movesMax)) return false;
        return true;
    });

    renderHistoryList(_historyActiveGames, _historyFinishedGames, filtered);
}

function renderHistoryList(activeGames, finishedGames, logs) {
    const listEl = document.getElementById('history-list');
    listEl.innerHTML = '';

    // Section: In Progress (always shown, not filtered)
    if (activeGames.length > 0) {
        const header = document.createElement('div');
        header.className = 'history-section-header';
        header.textContent = '\u8fdb\u884c\u4e2d (In Progress)';
        listEl.appendChild(header);

        for (const g of activeGames) {
            const item = document.createElement('div');
            item.className = 'history-item active-game';
            const statusText = g.status === 'playing' ? '\u5bf9\u5c40\u4e2d' : g.status === 'paused' ? '\u5df2\u6682\u505c' : g.status;
            const statusClass = g.status === 'playing' ? 'status-playing' : 'status-paused';
            item.innerHTML = `
                <div class="hist-meta">
                    <span class="hist-status ${statusClass}">${escapeHtml(statusText)}</span>
                    <span class="hist-moves-count">${g.move_count} moves</span>
                </div>
                <div class="hist-players">
                    <span class="red-name">${escapeHtml(g.red_label)}</span>
                    <span class="vs">vs</span>
                    <span class="black-name">${escapeHtml(g.black_label)}</span>
                </div>
            `;
            item.addEventListener('click', () => {
                if (gameStates.has(g.id)) {
                    switchActiveGame(g.id);
                    switchTab('log');
                }
            });
            listEl.appendChild(item);
        }
    }

    // Section: Completed
    const hasCompleted = finishedGames.length > 0 || logs.length > 0;
    if (hasCompleted) {
        const header = document.createElement('div');
        header.className = 'history-section-header';
        header.textContent = '\u5df2\u7ed3\u675f (Completed)';
        listEl.appendChild(header);
    }

    for (const log of logs) {
        const item = document.createElement('div');
        item.className = 'history-item';
        const resultClass = log.result.includes('red wins') ? 'result-red'
            : log.result.includes('black wins') ? 'result-black'
            : 'result-draw';
        item.innerHTML = `
            <div class="hist-meta">
                <span class="hist-date">${escapeHtml(log.timestamp)}</span>
                <span class="hist-moves-count">${log.move_count} moves</span>
            </div>
            <div class="hist-players">
                <span class="red-name">${escapeHtml(log.red_label)}</span>
                <span class="vs">vs</span>
                <span class="black-name">${escapeHtml(log.black_label)}</span>
            </div>
            <span class="hist-result ${resultClass}">${escapeHtml(log.result)}</span>
        `;
        item.addEventListener('click', () => openHistoryDetail(log.filename));
        listEl.appendChild(item);
    }

    if (activeGames.length === 0 && logs.length === 0) {
        listEl.innerHTML = '<div class="history-empty">No game history yet.</div>';
    }
}

async function openHistoryDetail(filename) {
    const listView = document.getElementById('history-list-view');
    const detailView = document.getElementById('history-detail-view');
    const infoEl = document.getElementById('history-detail-info');
    const moveListEl = document.getElementById('history-move-list');

    infoEl.textContent = 'Loading...';
    moveListEl.innerHTML = '';
    listView.style.display = 'none';
    detailView.style.display = '';

    try {
        const resp = await fetch(`/api/logs/${encodeURIComponent(filename)}`);
        if (!resp.ok) throw new Error('Failed to load');
        const game = await resp.json();

        historyMode = true;
        historyGame = game;
        historyViewIndex = 0;

        infoEl.innerHTML = `
            <span class="detail-players">${escapeHtml(game.red_label)} vs ${escapeHtml(game.black_label)}</span>
            &nbsp;|&nbsp;${escapeHtml(game.timestamp)}
        `;

        moveListEl.innerHTML = '';
        const moves = game.moves || [];
        for (let i = 0; i < moves.length; i++) {
            const m = moves[i];
            const item = document.createElement('div');
            item.className = 'hist-move-item';
            item.dataset.index = i + 1;
            const zhPart = m.move_zh ? `<span class="move-zh">${escapeHtml(m.move_zh)}</span>` : '';
            const capturePart = m.captured ? `<span class="move-capture">x${escapeHtml(m.captured)}</span>` : '';
            item.innerHTML = `
                <span class="move-num">#${m.number}</span>
                <span class="move-side-dot ${m.side}"></span>
                <span class="move-text">${escapeHtml(m.move)}</span>
                ${zhPart}
                ${capturePart}
            `;
            item.addEventListener('click', () => historyJumpTo(i + 1));
            moveListEl.appendChild(item);
        }

        renderer.clearSelection();
        historyRenderPosition();
        updateHistoryNavUI();
        updateHumanInteractive();
    } catch (e) {
        infoEl.textContent = 'Failed to load game data.';
    }
}

function historyJumpTo(index) {
    if (!historyGame) return;
    stopHistoryAutoplay();
    const maxIndex = (historyGame.moves || []).length;
    historyViewIndex = Math.max(0, Math.min(index, maxIndex));
    renderer.clearSelection();
    historyRenderPosition();
    updateHistoryNavUI();
}

function historyStepPrev() {
    if (historyViewIndex > 0) {
        historyJumpTo(historyViewIndex - 1);
    }
}

function historyStepNext() {
    if (!historyGame) return;
    const maxIndex = (historyGame.moves || []).length;
    if (historyViewIndex < maxIndex) {
        historyJumpTo(historyViewIndex + 1);
    }
}

function historyGoFirst() {
    historyJumpTo(0);
}

function historyGoLast() {
    if (!historyGame) return;
    historyJumpTo((historyGame.moves || []).length);
}

function historyRenderPosition() {
    if (!historyGame) return;
    const moves = historyGame.moves || [];
    if (historyViewIndex === 0) {
        renderer.render(historyGame.initial_fen);
    } else {
        const m = moves[historyViewIndex - 1];
        if (m) {
            renderer.render(m.fen, m.move);
        }
    }
}

function updateHistoryNavUI() {
    if (!historyGame) return;
    const moves = historyGame.moves || [];
    const maxIndex = moves.length;
    const label = document.getElementById('hist-position-label');

    if (historyViewIndex === 0) {
        label.textContent = 'Initial';
    } else {
        const m = moves[historyViewIndex - 1];
        label.textContent = `#${m.number} ${m.move}`;
    }

    document.getElementById('btn-hist-first').disabled = historyViewIndex === 0;
    document.getElementById('btn-hist-prev').disabled = historyViewIndex === 0;
    document.getElementById('btn-hist-next').disabled = historyViewIndex >= maxIndex;
    document.getElementById('btn-hist-last').disabled = historyViewIndex >= maxIndex;

    const moveListEl = document.getElementById('history-move-list');
    moveListEl.querySelectorAll('.hist-move-item').forEach(el => {
        el.classList.toggle('active', parseInt(el.dataset.index) === historyViewIndex);
    });

    const activeItem = moveListEl.querySelector('.hist-move-item.active');
    if (activeItem) {
        activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
}

function closeHistoryDetail() {
    stopHistoryAutoplay();
    historyMode = false;
    historyGame = null;
    historyViewIndex = -1;

    const listView = document.getElementById('history-list-view');
    const detailView = document.getElementById('history-detail-view');
    listView.style.display = '';
    detailView.style.display = 'none';

    // Restore the board to the current live game position
    renderer.clearSelection();
    const g = activeGame();
    if (g) {
        if (g.viewIndex === -1) {
            renderer.render(g.fen, g.lastMove);
        } else {
            showViewIndex();
        }
    } else {
        renderer.render(DEFAULT_FEN);
    }
    updateHumanInteractive();
}

function stopHistoryAutoplay() {
    if (historyAutoplayTimer) {
        clearInterval(historyAutoplayTimer);
        historyAutoplayTimer = null;
    }
    const btn = document.getElementById('btn-hist-autoplay');
    if (btn) {
        btn.textContent = '\u25B6 Auto';
        btn.classList.remove('playing');
    }
}

function historyToggleAutoplay() {
    if (historyAutoplayTimer) {
        stopHistoryAutoplay();
        return;
    }
    if (!historyGame) return;
    const maxIndex = (historyGame.moves || []).length;
    if (historyViewIndex >= maxIndex) return;

    const btn = document.getElementById('btn-hist-autoplay');
    btn.textContent = '\u23F8 Stop';
    btn.classList.add('playing');

    historyAutoplayTimer = setInterval(() => {
        const max = (historyGame.moves || []).length;
        if (!historyGame || historyViewIndex >= max) {
            stopHistoryAutoplay();
            return;
        }
        historyViewIndex++;
        renderer.clearSelection();
        historyRenderPosition();
        updateHistoryNavUI();
    }, 1000);
}

function setHistoryGifButtonState(label = 'GIF', disabled = false, exporting = false) {
    const btn = document.getElementById('btn-hist-export-gif');
    if (!btn) return;
    btn.textContent = label;
    btn.disabled = disabled;
    btn.classList.toggle('exporting', exporting);
}

function buildHistoryGifFilename(game) {
    const now = new Date();
    const fallbackTimestamp = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
    ].join('')
        + '-'
        + [
            String(now.getHours()).padStart(2, '0'),
            String(now.getMinutes()).padStart(2, '0'),
            String(now.getSeconds()).padStart(2, '0'),
        ].join('');

    const timestamp = sanitizeFilenamePart(game && game.timestamp ? game.timestamp : fallbackTimestamp);
    const red = sanitizeFilenamePart(game && game.red_label ? game.red_label : 'red');
    const black = sanitizeFilenamePart(game && game.black_label ? game.black_label : 'black');
    return `replay_${timestamp}_red-${red}_vs_black-${black}.gif`;
}

async function historyExportGif() {
    if (!historyGame || historyGifExportInProgress) return;
    if (typeof window.BattleChessGifEncoder !== 'function') {
        setStatus('GIF export is unavailable in this browser.');
        return;
    }
    if (!renderer) {
        setStatus('Board renderer is not ready yet.');
        return;
    }

    stopHistoryAutoplay();
    historyGifExportInProgress = true;
    setHistoryGifButtonState('GIF...', true, true);
    setStatus('Exporting replay GIF...');

    const exportGame = historyGame;
    const initialFen = exportGame.initial_fen || DEFAULT_FEN;
    const moves = Array.isArray(exportGame.moves) ? exportGame.moves.slice() : [];
    const totalFrames = moves.length + 1;

    try {
        const exportCanvas = document.createElement('canvas');
        const exportRenderer = new BoardRenderer(
            exportCanvas,
            renderer.cellSize,
            renderer.margin,
            { devicePixelRatio: 1, interactive: false, flipped: boardFlipped }
        );
        const encoder = new window.BattleChessGifEncoder(exportRenderer.width, exportRenderer.height);

        const captureFrame = (fen, lastMove, delayMs) => {
            exportRenderer.selectedSquare = null;
            exportRenderer.legalMoves = [];
            exportRenderer.render(fen, lastMove);
            const frame = exportRenderer.ctx.getImageData(0, 0, exportRenderer.width, exportRenderer.height);
            encoder.addFrame(frame, delayMs);
        };

        await yieldToBrowser();
        captureFrame(initialFen, null, moves.length === 0 ? HISTORY_GIF_FINAL_DELAY_MS : HISTORY_GIF_INITIAL_DELAY_MS);
        setHistoryGifButtonState(`GIF 1/${totalFrames}`, true, true);

        let lastFen = initialFen;
        for (let i = 0; i < moves.length; i++) {
            const move = moves[i] || {};
            const nextFen = move.fen || lastFen;
            const delayMs = i === moves.length - 1 ? HISTORY_GIF_FINAL_DELAY_MS : HISTORY_GIF_FRAME_DELAY_MS;
            captureFrame(nextFen, move.move || null, delayMs);
            lastFen = nextFen;
            setHistoryGifButtonState(`GIF ${i + 2}/${totalFrames}`, true, true);

            if ((i + 1) % HISTORY_GIF_PROGRESS_YIELD_EVERY === 0) {
                await yieldToBrowser();
            }
        }

        const blob = encoder.finish();
        const filename = buildHistoryGifFilename(exportGame);
        triggerBlobDownload(blob, filename);
        setStatus(`Replay GIF saved: ${filename}`);
    } catch (e) {
        console.error('GIF export failed:', e);
        const message = e && e.message ? e.message : String(e);
        setStatus(`GIF export failed: ${message}`);
    } finally {
        historyGifExportInProgress = false;
        setHistoryGifButtonState('GIF', false, false);
    }
}

// --- Leaderboard ---

function toggleLeaderboard() {
    const page = document.getElementById('leaderboard-page');
    const main = document.getElementById('main-area');
    const btn = document.getElementById('btn-leaderboard');
    const statusBar = document.getElementById('status-bar');
    const isVisible = !page.classList.contains('hidden');

    if (isVisible) {
        page.classList.add('hidden');
        main.style.display = '';
        btn.classList.remove('active');
        statusBar.style.display = '';
    } else {
        page.classList.remove('hidden');
        main.style.display = 'none';
        btn.classList.add('active');
        statusBar.style.display = 'none';
        loadLeaderboard();
    }
}

async function loadLeaderboard() {
    const container = document.getElementById('leaderboard-content');
    if (!container) return;

    try {
        const resp = await fetch('/api/logs');
        const data = await resp.json();
        const logs = data.logs || [];

        if (logs.length === 0) {
            container.innerHTML = '<div class="lb-empty">No games played yet.</div>';
            return;
        }

        let totalRedWins = 0, totalBlackWins = 0, totalDraws = 0;
        const stats = {};

        for (const log of logs) {
            const redWin = log.result.includes('red wins');
            const blackWin = log.result.includes('black wins');
            if (redWin) totalRedWins++;
            else if (blackWin) totalBlackWins++;
            else totalDraws++;

            for (const label of [log.red_label, log.black_label]) {
                if (!label) continue;
                if (!stats[label]) stats[label] = {
                    wins: 0, losses: 0, draws: 0,
                    asRed: { wins: 0, losses: 0, draws: 0, total: 0 },
                    asBlack: { wins: 0, losses: 0, draws: 0, total: 0 },
                };
            }

            const rs = stats[log.red_label];
            const bs = stats[log.black_label];
            if (rs) rs.asRed.total++;
            if (bs) bs.asBlack.total++;

            if (redWin) {
                if (rs) { rs.wins++; rs.asRed.wins++; }
                if (bs) { bs.losses++; bs.asBlack.losses++; }
            } else if (blackWin) {
                if (bs) { bs.wins++; bs.asBlack.wins++; }
                if (rs) { rs.losses++; rs.asRed.losses++; }
            } else {
                if (rs) { rs.draws++; rs.asRed.draws++; }
                if (bs) { bs.draws++; bs.asBlack.draws++; }
            }
        }

        const entries = Object.entries(stats).map(([name, s]) => {
            const total = s.wins + s.losses + s.draws;
            const winRate = total > 0 ? s.wins / total : 0;
            return { name, ...s, total, winRate };
        });
        entries.sort((a, b) => b.wins - a.wins || b.winRate - a.winRate || a.losses - b.losses);

        let html = `<div class="lb-summary">
            <div class="lb-summary-item"><div class="lb-summary-val">${logs.length}</div><div class="lb-summary-label">Total Games</div></div>
            <div class="lb-summary-item"><div class="lb-summary-val">${entries.length}</div><div class="lb-summary-label">Players</div></div>
            <div class="lb-summary-item"><div class="lb-summary-val">${totalRedWins}</div><div class="lb-summary-label">Red Wins</div></div>
            <div class="lb-summary-item"><div class="lb-summary-val">${totalBlackWins}</div><div class="lb-summary-label">Black Wins</div></div>
            <div class="lb-summary-item"><div class="lb-summary-val">${totalDraws}</div><div class="lb-summary-label">Draws</div></div>
        </div>`;

        html += `<table class="lb-table"><thead><tr>
            <th class="num">#</th>
            <th>Player</th>
            <th class="stat">W</th><th class="stat">L</th><th class="stat">D</th>
            <th class="rate">Win%</th>
            <th class="side-group">As Red</th>
            <th class="side-group">As Black</th>
        </tr></thead><tbody>`;

        for (let i = 0; i < entries.length; i++) {
            const e = entries[i];
            const rank = i + 1;
            const rankCls = rank <= 3 ? ` lb-rank-${rank}` : '';
            const pct = Math.round(e.winRate * 100);
            const rateCls = pct >= 60 ? 'high' : pct >= 40 ? 'mid' : 'low';

            const redPct = e.asRed.total > 0 ? Math.round(e.asRed.wins / e.asRed.total * 100) : 0;
            const blackPct = e.asBlack.total > 0 ? Math.round(e.asBlack.wins / e.asBlack.total * 100) : 0;

            html += `<tr>
                <td class="num${rankCls}">${rank}</td>
                <td>
                    <div class="lb-player-name" title="${escapeHtml(e.name)}">${escapeHtml(e.name)}</div>
                    <div class="lb-player-games">${e.total} games</div>
                </td>
                <td class="stat lb-stat-w">${e.wins}</td>
                <td class="stat lb-stat-l">${e.losses}</td>
                <td class="stat lb-stat-d">${e.draws}</td>
                <td class="rate">
                    <div class="lb-rate-bar">
                        <span class="lb-rate-num ${rateCls}">${pct}%</span>
                        <div class="lb-bar-bg"><div class="lb-bar-fill ${rateCls}" style="width:${pct}%"></div></div>
                    </div>
                </td>
                <td class="stat"><div class="lb-side-detail">${e.asRed.wins}W ${e.asRed.losses}L ${e.asRed.draws}D</div><div class="lb-side-detail">Win ${redPct}% (${e.asRed.total} games)</div></td>
                <td class="stat"><div class="lb-side-detail">${e.asBlack.wins}W ${e.asBlack.losses}L ${e.asBlack.draws}D</div><div class="lb-side-detail">Win ${blackPct}% (${e.asBlack.total} games)</div></td>
            </tr>`;
        }
        html += '</tbody></table>';
        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = '<div class="lb-empty">Failed to load.</div>';
    }
}

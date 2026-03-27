/**
 * BattleChess Application Controller
 * Manages game state, API communication, SSE streaming, and UI updates.
 */

const DEFAULT_FEN = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w';

const state = {
    gameId: null,
    fen: DEFAULT_FEN,
    status: 'waiting', // waiting | playing | paused | finished
    turn: 'w',
    moveHistory: [],
    lastMove: null,
    eventSource: null,
    viewIndex: -1, // -1 = live view, otherwise index into moveHistory for back/forward
    scoreType: 'Elo',
};

let renderer = null;
const presetConfigs = {};
let availablePrompts = [];
let defaultPromptName = 'zh';

function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `tab-${tabName}`);
    });
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

// --- Initialization ---

document.addEventListener('DOMContentLoaded', async () => {
    const canvas = document.getElementById('board-canvas');
    renderer = new BoardRenderer(canvas);
    renderer.render(state.fen);

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

    // Player type toggle - show/hide LLM fields
    for (const side of ['red', 'black']) {
        const sel = document.getElementById(`${side}-type`);
        sel.addEventListener('change', () => {
            const val = sel.value;
            const isLLM = val.startsWith('llm');
            document.getElementById(`${side}-llm-fields`).style.display = isLLM ? 'block' : 'none';
            document.getElementById(`${side}-custom-fields`).style.display =
                (val === 'llm:custom') ? 'block' : 'none';
            if (val.startsWith('llm:') && val !== 'llm:custom') {
                applyLlmOptionDefaults(side, val.substring(4));
            } else if (val === 'llm:custom') {
                applyLlmOptionDefaults(side);
            }
        });
        sel.dispatchEvent(new Event('change'));
    }

    // Buttons
    document.getElementById('btn-start').addEventListener('click', onStart);
    document.getElementById('btn-pause').addEventListener('click', onPause);
    document.getElementById('btn-reset').addEventListener('click', onReset);
    document.getElementById('btn-step-back').addEventListener('click', onStepBack);
    document.getElementById('btn-step-forward').addEventListener('click', onStepForward);
    document.getElementById('btn-init-fen').addEventListener('click', onInitFEN);
    document.getElementById('btn-load-fen').addEventListener('click', onLoadFEN);
    document.getElementById('btn-export-fen').addEventListener('click', onExportFEN);

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

    // Board click-to-move callbacks
    renderer.onMoveCallback = (move) => {
        if (state.gameId && state.status === 'playing') {
            submitHumanMove(move);
        }
    };
    renderer.onSelectCallback = (col, row) => {
        if (state.gameId && state.status === 'playing') {
            fetchLegalMovesForPiece(col, row);
        }
    };

    window.addEventListener('resize', syncRightColumnHeight);

    // Init eval chart tooltip
    _initEvalChartTooltip();
});

// --- Presets ---

async function loadPresets() {
    try {
        const resp = await fetch('/api/presets');
        const data = await resp.json();
        const presets = data.presets || [];

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
        for (const side of ['red', 'black']) {
            const typeSel = document.getElementById(`${side}-type`);
            const opt = document.createElement('option');
            opt.value = 'llm:custom';
            opt.textContent = 'Custom LLM (自定义)';
            typeSel.appendChild(opt);
        }
    }
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
        const typeVal = document.getElementById(`${side}-type`).value;
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
            // Preset name
            result[side] = {
                type: 'llm',
                preset: typeVal.substring(4),
                ...llmOptions,
            };
        }
    }
    return result;
}

// --- Event Handlers ---

async function onStart() {
    try {
        const configs = getConfigs();
        // Validate LLM configs (only for custom, presets are validated server-side)
        for (const side of ['red', 'black']) {
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
        const { game_id } = await apiPost('/api/game/create', {
            fen,
            red: configs.red,
            black: configs.black,
            pikafish: pikafishConfig,
        });

        state.gameId = game_id;
        state.fen = fen;
        state.moveHistory = [];
        state.lastMove = null;
        state.status = 'playing';
        state.viewIndex = -1;

        clearGameLog();
        renderer.clearSelection();
        renderer.render(state.fen);
        switchTab('log');
        updateUI();
        updateHumanInteractive();

        connectSSE(game_id);

        await apiPost(`/api/game/${game_id}/start`);
        setStatus('Game started');
        updateUI();
        updateHumanInteractive();
    } catch (e) {
        alert('Failed to start: ' + e.message);
        setStatus('Error: ' + e.message);
    }
}

function closeGameStream() {
    if (!state.eventSource) return;
    state.eventSource.close();
    state.eventSource = null;
}

function enterReadyState(fen, statusMessage = 'Ready') {
    closeGameStream();
    state.gameId = null;
    state.status = 'waiting';
    state.moveHistory = [];
    state.lastMove = null;
    state.viewIndex = -1;
    state.fen = fen;
    state.turn = fen.split(' ')[1] || 'w';

    clearGameLog();
    renderer.clearSelection();
    renderer.humanInteractive = false;
    renderer.render(state.fen);
    hideGameOver();
    setStatus(statusMessage);
    updateUI();
}

function applySeekState(data, statusMessage = null) {
    state.fen = data.fen;
    state.turn = (data.turn === 'black' ? 'b' : 'w');
    state.moveHistory = data.move_history || [];
    state.lastMove = state.moveHistory.length > 0 ? state.moveHistory[state.moveHistory.length - 1].move : null;
    state.viewIndex = -1;

    clearGameLog();
    renderer.clearSelection();
    renderer.render(state.fen, state.lastMove);
    if (statusMessage) {
        setStatus(statusMessage);
    }
    updateUI();
    updateHumanInteractive();
}

async function onPause() {
    if (!state.gameId) return;
    try {
        if (state.status === 'playing') {
            await apiPost(`/api/game/${state.gameId}/pause`);
            state.status = 'paused';
        } else if (state.status === 'paused') {
            if (state.viewIndex !== -1) {
                const seekResult = await apiPost(`/api/game/${state.gameId}/seek`, { ply: state.viewIndex });
                applySeekState(seekResult, `Resuming from move #${seekResult.ply}`);
            }
            await apiPost(`/api/game/${state.gameId}/resume`);
            state.status = 'playing';
        }
        updateUI();
        updateHumanInteractive();
    } catch (e) {
        alert('Error: ' + e.message);
    }
}

async function onReset() {
    closeGameStream();
    if (state.gameId) {
        try { await apiPost(`/api/game/${state.gameId}/reset`); } catch (_) {}
    }
    enterReadyState(document.getElementById('fen-input').value.trim() || DEFAULT_FEN, 'Ready');
}

function onInitFEN() {
    if (state.status === 'playing' || state.status === 'paused') return;

    document.getElementById('fen-input').value = DEFAULT_FEN;
    enterReadyState(DEFAULT_FEN, 'Initial position loaded');
}

function onLoadFEN() {
    if (state.status === 'playing' || state.status === 'paused') return;

    const fen = document.getElementById('fen-input').value.trim();
    if (!fen) return;
    try {
        enterReadyState(fen, 'FEN loaded');
    } catch (e) {
        alert('Invalid FEN');
    }
}

function onExportFEN() {
    let fen;
    if (state.viewIndex === -1) {
        fen = state.fen;
    } else if (state.viewIndex === 0) {
        fen = document.getElementById('fen-input').value.trim() || DEFAULT_FEN;
    } else {
        fen = state.moveHistory[state.viewIndex - 1].fen;
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
    if (state.moveHistory.length === 0) return;
    if (state.viewIndex === -1) {
        state.viewIndex = state.moveHistory.length - 1;
    } else if (state.viewIndex > 0) {
        state.viewIndex--;
    } else {
        return; // already at start
    }
    showViewIndex();
    updateUI();
}

function onStepForward() {
    if (state.viewIndex === -1) return; // already at live
    state.viewIndex++;
    if (state.viewIndex >= state.moveHistory.length) {
        state.viewIndex = -1; // back to live
    }
    showViewIndex();
    updateUI();
}

function showViewIndex() {
    if (state.viewIndex === -1) {
        // Show current live position
        renderer.render(state.fen, state.lastMove);
    } else if (state.viewIndex === 0) {
        // Before first move - show initial FEN
        const initialFen = document.getElementById('fen-input').value.trim() || DEFAULT_FEN;
        renderer.render(initialFen);
    } else {
        const entry = state.moveHistory[state.viewIndex - 1];
        renderer.render(entry.fen, entry.move);
    }
}

async function submitHumanMove(move) {
    if (!state.gameId) return;
    try {
        renderer.humanInteractive = false;
        await apiPost(`/api/game/${state.gameId}/human-move`, { move });
    } catch (e) {
        alert('Invalid move: ' + e.message);
        updateHumanInteractive();
    }
}

async function fetchLegalMovesForPiece(col, row) {
    if (!state.gameId) return;
    try {
        const data = await apiGet(`/api/game/${state.gameId}/legal-moves?col=${col}&row=${row}`);
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
    if (state.status !== 'playing' || state.viewIndex !== -1) {
        renderer.humanInteractive = false;
        return;
    }
    // Check if current turn's player is human
    const side = state.turn === 'w' ? 'red' : 'black';
    const type = document.getElementById(`${side}-type`).value;
    renderer.humanInteractive = (type === 'human');
}

// --- SSE ---

function connectSSE(gameId) {
    if (state.eventSource) state.eventSource.close();

    const es = new EventSource(`/api/game/${gameId}/stream`);
    state.eventSource = es;

    es.addEventListener('move', (e) => {
        const data = JSON.parse(e.data);
        state.fen = data.fen;
        state.turn = data.fen.split(' ')[1] || 'w';
        state.lastMove = data.move;
        state.moveHistory.push(data);

        // Finalize current log entry with move info
        finalizeLogEntry(data);

        if (state.viewIndex === -1) {
            renderer.render(state.fen, data.move);
        }
        updateTurnIndicator();
        updateHumanInteractive();
    });

    es.addEventListener('reasoning', (e) => {
        const data = JSON.parse(e.data);
        appendToCurrentLog(data.side, data.content, 'reasoning', true);
    });

    es.addEventListener('thinking', (e) => {
        const data = JSON.parse(e.data);
        appendToCurrentLog(data.side, data.content, 'thinking', true);
    });

    es.addEventListener('tool_call', (e) => {
        const data = JSON.parse(e.data);
        const argsStr = data.args && Object.keys(data.args).length > 0 ? JSON.stringify(data.args) : '';
        appendToCurrentLog(data.side, `> Tool: ${data.tool}(${argsStr})`, 'tool-call', false);
    });

    es.addEventListener('tool_result', (e) => {
        const data = JSON.parse(e.data);
        const resultStr = data.result.length > 200 ? data.result.slice(0, 200) + '...' : data.result;
        appendToCurrentLog(data.side, `  Result: ${resultStr}`, 'tool-result', false);
    });

    es.addEventListener('turn', (e) => {
        const data = JSON.parse(e.data);
        state.turn = data.side === 'red' ? 'w' : 'b';
        updateTurnIndicator();
        setStatus(`${data.side === 'red' ? 'Red' : 'Black'} is thinking...`);
        updateHumanInteractive();
        // Create a new log entry for this turn
        createLogEntry(data.side);
    });

    es.addEventListener('waiting_human', (e) => {
        const data = JSON.parse(e.data);
        setStatus(`Waiting for ${data.side} (human) to move...`);
        updateHumanInteractive();
    });

    es.addEventListener('game_over', (e) => {
        const data = JSON.parse(e.data);
        state.status = 'finished';
        renderer.humanInteractive = false;
        showGameOver(data.winner, data.reason);
        updateUI();
        es.close();
    });

    es.addEventListener('seek', (e) => {
        const data = JSON.parse(e.data);
        applySeekState(data);
    });

    es.addEventListener('eval', (e) => {
        const data = JSON.parse(e.data);
        state.scoreType = data.score_type || 'Elo';
        updateEvalDisplay(data.move_number, data.score);
    });

    es.addEventListener('status', (e) => {
        const data = JSON.parse(e.data);
        if (data.status === 'paused') {
            state.status = 'paused';
            setStatus('Game paused');
        } else if (data.status === 'playing') {
            state.status = 'playing';
            setStatus('Game resumed');
        }
        updateUI();
        updateHumanInteractive();
    });

    es.addEventListener('error', (e) => {
        try {
            const data = JSON.parse(e.data);
            setStatus('Error: ' + (data.message || 'Connection error'));
        } catch (_) {}
    });

    es.onerror = () => {
        if (state.status === 'playing') {
            setStatus('Connection lost, reconnecting...');
        }
    };
}

// --- UI Updates ---

function updateUI() {
    const isPlaying = state.status === 'playing';
    const isPaused = state.status === 'paused';
    const isWaiting = state.status === 'waiting';
    const isGameActive = isPlaying || isPaused;

    document.getElementById('btn-start').disabled = !isWaiting;
    document.getElementById('btn-pause').disabled = !isPlaying && !isPaused;
    document.getElementById('btn-pause').textContent = isPaused ? 'Resume' : 'Pause';
    document.getElementById('btn-reset').disabled = isWaiting;
    document.getElementById('fen-input').disabled = isGameActive;
    document.getElementById('btn-load-fen').disabled = isGameActive;
    document.getElementById('btn-init-fen').disabled = isGameActive;

    // Step back/forward: enabled when there's history
    document.getElementById('btn-step-back').disabled = state.moveHistory.length === 0 || (state.viewIndex === 0);
    document.getElementById('btn-step-forward').disabled = state.viewIndex === -1;

    // Disable config during play
    const inputs = document.querySelectorAll('#tab-settings input, #tab-settings select');
    inputs.forEach(inp => { inp.disabled = isPlaying || isPaused; });

    updateTurnIndicator();
    requestAnimationFrame(syncRightColumnHeight);
}

function updateTurnIndicator() {
    const el = document.getElementById('turn-indicator');
    const side = state.turn === 'w' ? 'red' : 'black';
    const sideName = side === 'red' ? 'Red (红方)' : 'Black (黑方)';
    el.className = side;

    if (state.viewIndex !== -1) {
        el.innerHTML = state.viewIndex === 0
            ? 'Viewing initial position'
            : `Viewing after move #${state.viewIndex} / ${state.moveHistory.length}`;
    } else if (state.status === 'finished') {
        el.innerHTML = `Game Over`;
    } else if (state.status === 'waiting') {
        el.innerHTML = `Ready to start`;
    } else {
        el.innerHTML = `<span class="turn-dot"></span> ${sideName}'s turn | Move #${state.moveHistory.length + 1}`;
    }
}

function setStatus(msg) {
    document.getElementById('status-bar').textContent = msg;
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
// Each turn is a collapsible <details> element. The latest one is open, previous ones collapsed.

let _currentLogEntry = null; // current <details> element
let _currentLogContent = null; // the content div inside current <details>
let _currentStreamEl = null; // current streaming element
let _currentStreamCls = null; // class of current streaming element

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
    // Collapse previous entry
    if (_currentLogEntry) {
        _currentLogEntry.removeAttribute('open');
    }

    const moveNum = state.moveHistory.length + 1;
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
        // Preserve existing eval badge if any
        const existingBadge = summary.querySelector('.eval-badge');
        summary.innerHTML = `<span class="dot ${dotClass}"></span> #${moveData.number} ${sideName}: ${moveData.move}${captured}`;
        if (existingBadge) summary.appendChild(existingBadge);
        // Collapse it
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
    // Hide eval chart
    const chartContainer = document.getElementById('eval-chart-container');
    if (chartContainer) chartContainer.style.display = 'none';
}

// --- Eval Display ---

function formatEvalScore(score, scoreType) {
    if (score.type === 'mate') {
        return score.value > 0 ? `M${score.value}` : `M${score.value}`;
    }
    if (scoreType === 'Elo') {
        const pawns = (score.value / 100).toFixed(1);
        return score.value > 0 ? `+${pawns}` : `${pawns}`;
    }
    return score.value > 0 ? `+${score.value}` : `${score.value}`;
}

function updateEvalDisplay(moveNumber, score) {
    // Store eval in moveHistory
    if (moveNumber > 0 && moveNumber <= state.moveHistory.length) {
        state.moveHistory[moveNumber - 1].eval = score;
    }

    const scoreType = state.scoreType || 'Elo';

    // Find log entry and update badge
    const logEntries = document.querySelectorAll('.log-entry');
    for (const entry of logEntries) {
        const summary = entry.querySelector('summary');
        if (!summary) continue;
        const match = summary.textContent.match(/#(\d+)/);
        if (match && parseInt(match[1]) === moveNumber) {
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
            break;
        }
    }

    // Redraw chart
    drawEvalChart();
}

function restoreEvalBadges() {
    for (const move of state.moveHistory) {
        if (move.eval) {
            updateEvalDisplay(move.number, move.eval);
        }
    }
}

// --- Eval Chart ---

// Store chart layout info for tooltip hit-testing
let _chartState = null;

function _getEvalPoints() {
    const isElo = (state.scoreType || 'Elo') === 'Elo';
    // First pass: collect non-mate values to find max
    let maxAbs = 0;
    const rawEntries = [];
    for (const move of state.moveHistory) {
        if (move.eval) {
            if (move.eval.type === 'mate') {
                rawEntries.push({ x: move.number, isMate: true, sign: move.eval.value > 0 ? 1 : -1, raw: move.eval });
            } else {
                const val = isElo ? move.eval.value / 100 : move.eval.value;
                if (Math.abs(val) > maxAbs) maxAbs = Math.abs(val);
                rawEntries.push({ x: move.number, isMate: false, y: val, raw: move.eval });
            }
        }
    }
    // Mate cap: fixed ceiling per score type
    const mateCap = isElo ? 100 : 10000;

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
    // Pick a nice step so we get ~2-3 ticks on each side of zero
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

    // Layout
    const padL = 36, padR = 12, padT = 12, padB = 18;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    // Y-axis range: symmetric around 0
    const maxAbs = Math.max(50, ...points.map(p => Math.abs(p.y)));
    const yRange = maxAbs * 1.15;

    // X-axis range
    const xMin = 1;
    const xMax = Math.max(points[points.length - 1].x, 2);

    function toCanvasX(x) { return padL + ((x - xMin) / (xMax - xMin)) * plotW; }
    function toCanvasY(y) { return padT + ((yRange - y) / (2 * yRange)) * plotH; }

    // Save chart state for tooltip
    _chartState = { points, padL, padR, padT, padB, plotW, plotH, xMin, xMax, yRange, toCanvasX, toCanvasY, w, h };

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Background: red top half, black bottom half
    const midY = toCanvasY(0);
    ctx.fillStyle = 'rgba(180, 30, 30, 0.05)';
    ctx.fillRect(padL, padT, plotW, midY - padT);
    ctx.fillStyle = 'rgba(26, 26, 26, 0.05)';
    ctx.fillRect(padL, midY, plotW, padT + plotH - midY);

    // Zero line
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(padL, midY);
    ctx.lineTo(padL + plotW, midY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Y-axis: only a few ticks
    const yStep = _pickYTicks(yRange);
    ctx.fillStyle = '#2c2c2c';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let v = -Math.floor(yRange / yStep) * yStep; v <= yRange; v += yStep) {
        // Fix floating point (e.g. 0.30000000000000004)
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

    // X-axis labels
    ctx.fillStyle = '#2c2c2c';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const xStep = xMax <= 10 ? 2 : xMax <= 30 ? 5 : 10;
    for (let x = xStep; x <= xMax; x += xStep) {
        ctx.fillText(x, toCanvasX(x), padT + plotH + 3);
    }

    // Fill area: split into positive and negative segments
    if (points.length >= 1) {
        // Positive fill (above zero line)
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

        // Negative fill (below zero line)
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

    // Draw curve line
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

    // Draw dots
    for (const p of points) {
        const cx = toCanvasX(p.x);
        const cy = toCanvasY(p.y);
        ctx.fillStyle = p.y >= 0 ? '#b41e1e' : '#1a1a1a';
        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        ctx.fill();
    }

    // Border
    ctx.strokeStyle = '#ece6da';
    ctx.lineWidth = 1;
    ctx.strokeRect(padL, padT, plotW, plotH);
}

// --- Eval Chart Tooltip ---

function _initEvalChartTooltip() {
    const canvas = document.getElementById('eval-chart');
    if (!canvas) return;

    // Create tooltip element
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

        // Check if mouse is inside plot area
        if (mx < padL || mx > padL + plotW || my < padT || my > padT + plotH) {
            tooltip.style.display = 'none';
            return;
        }

        // Find closest point
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

        const scoreType = state.scoreType || 'Elo';
        const label = formatEvalScore(closest.raw, scoreType);
        const sideLabel = closest.y >= 0 ? 'Red' : 'Black';
        tooltip.textContent = `#${closest.x}  ${label}  (${sideLabel})`;
        tooltip.style.display = 'block';
        tooltip.style.left = (e.clientX + 12) + 'px';
        tooltip.style.top = (e.clientY - 28) + 'px';

        // Redraw chart with highlight
        drawEvalChart();
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        ctx.save();
        ctx.scale(dpr, dpr);
        const hx = toCanvasX(closest.x);
        const hy = toCanvasY(closest.y);
        // Vertical guide line
        ctx.strokeStyle = 'rgba(192,120,48,0.4)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(hx, padT);
        ctx.lineTo(hx, padT + plotH);
        ctx.stroke();
        ctx.setLineDash([]);
        // Highlight dot
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
        drawEvalChart(); // redraw without highlight
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

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
};

let renderer = null;
const presetConfigs = {};

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
    const promptLangEl = document.getElementById(`${side}-prompt-lang`);
    if (!thinkingEl || !promptLangEl) return;

    if (!presetName || !presetConfigs[presetName]) {
        thinkingEl.value = 'true';
        promptLangEl.value = 'zh';
        return;
    }

    const preset = presetConfigs[presetName];
    thinkingEl.value = String(preset.enable_thinking !== false);
    promptLangEl.value = preset.prompt_lang || 'zh';
}

// --- Initialization ---

document.addEventListener('DOMContentLoaded', async () => {
    const canvas = document.getElementById('board-canvas');
    renderer = new BoardRenderer(canvas);
    renderer.render(state.fen);

    document.getElementById('fen-input').value = DEFAULT_FEN;

    // Load presets from server and populate dropdowns
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
                    prompt_lang: p.prompt_lang || 'zh',
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
            prompt_lang: document.getElementById(`${side}-prompt-lang`).value,
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
        const { game_id } = await apiPost('/api/game/create', {
            fen,
            red: configs.red,
            black: configs.black,
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
        summary.innerHTML = `<span class="dot ${dotClass}"></span> #${moveData.number} ${sideName}: ${moveData.move}${captured}`;
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

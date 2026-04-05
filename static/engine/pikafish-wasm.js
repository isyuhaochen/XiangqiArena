/**
 * Pikafish WASM Engine Wrapper
 * Runs Pikafish in the browser via WebAssembly.
 * Auto-detects best WASM variant (simd, multi-thread).
 * Provides a clean API for move computation and position evaluation.
 */

const ENGINE_BASE = '/static/engine';

// --- WASM capability detection (from xiangqiai.com) ---

async function detectSimd() {
    try {
        return WebAssembly.validate(new Uint8Array([
            0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,10,1,8,0,65,0,253,15,253,98,11
        ]));
    } catch { return false; }
}

async function detectSimdRelaxed() {
    try {
        return WebAssembly.validate(new Uint8Array([
            0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,15,1,13,0,65,1,253,15,65,2,253,15,253,128,2,11
        ]));
    } catch { return false; }
}

function detectSharedMemory() {
    try {
        if (typeof SharedArrayBuffer === 'undefined') return false;
        const mem = new WebAssembly.Memory({ initial: 1, maximum: 1, shared: true });
        return mem.buffer instanceof SharedArrayBuffer;
    } catch { return false; }
}

async function detectWasmType() {
    const multi = detectSharedMemory();
    const simd = await detectSimd();
    const relaxed = await detectSimdRelaxed();
    if (simd) {
        if (multi) return relaxed ? 'multi_simd_relaxed' : 'multi_simd';
        return 'single_simd';
    }
    return multi ? 'multi' : 'single';
}

// --- Single-thread worker code (inline) ---

function createSingleThreadWorkerCode() {
    return `
let EngineInstance = null;

self.onmessage = function(e) {
    const data = e.data;
    if (data.wasm_type && data.origin) {
        const base = data.origin + '/static/engine';
        const variant = data.wasm_type;
        importScripts(base + '/' + variant + '/pikafish.js');
        self.Pikafish({
            onReceiveStdout: function(line) {
                self.postMessage({ stdout: line });
            },
            onExit: function(code) {
                self.postMessage({ exit: code });
            },
            locateFile: function(f) {
                if (f === 'pikafish.data') return base + '/data/' + f;
                return base + '/' + variant + '/' + f;
            },
            setStatus: function(status) {
                self.postMessage({ download: status });
            }
        }).then(function(p) {
            EngineInstance = p;
            self.postMessage({ ready: true });
        });
    } else if (data.command && EngineInstance) {
        EngineInstance.sendCommand(data.command);
    }
};
`;
}

// --- PikafishWasm class ---

class PikafishWasm {
    constructor() {
        this._engine = null;
        this._ready = false;
        this._mode = 'single';  // 'single' or 'multi'
        this._wasmType = null;
        this._onOutput = null;
        this._resolveReady = null;
        this._readyPromise = new Promise(r => { this._resolveReady = r; });
        this._fallbackTriggered = false;
    }

    async init() {
        this._wasmType = await detectWasmType();
        console.log('[PikafishWasm] Detected WASM type:', this._wasmType);
        this._startEngine();
        await this._readyPromise;
        console.log('[PikafishWasm] Engine ready');
    }

    _startEngine() {
        const wasmType = this._wasmType;
        if (wasmType.startsWith('multi')) {
            this._mode = 'multi';
            this._startMultiThread(wasmType);
        } else {
            this._mode = 'single';
            this._startSingleThread(wasmType);
        }
    }

    _startMultiThread(wasmType) {
        const base = ENGINE_BASE;
        const scriptUrl = `${base}/${wasmType}/pikafish.js`;

        const script = document.createElement('script');
        script.src = scriptUrl;
        script.onload = () => {
            if (typeof self.Pikafish !== 'function') {
                console.warn('[PikafishWasm] Multi-thread load failed, falling back');
                this._fallbackToSingle();
                return;
            }
            self.Pikafish({
                onReceiveStdout: (line) => this._handleOutput(line),
                onExit: (code) => this._handleExit(code),
                locateFile: (f) => {
                    if (f === 'pikafish.data') return `${base}/data/${f}`;
                    return `${base}/${wasmType}/${f}`;
                },
                setStatus: (s) => { /* download progress */ }
            }).then(engine => {
                this._engine = engine;
                setTimeout(() => {
                    this.sendCommand('uci');
                }, 100);
            }).catch(err => {
                console.warn('[PikafishWasm] Multi-thread init error, falling back:', err);
                this._fallbackToSingle();
            });
        };
        script.onerror = () => {
            console.warn('[PikafishWasm] Script load error, falling back');
            this._fallbackToSingle();
        };
        document.head.appendChild(script);
    }

    _startSingleThread(wasmType) {
        const code = createSingleThreadWorkerCode();
        const blob = new Blob([code], { type: 'text/javascript' });
        const url = URL.createObjectURL(blob);
        this._engine = new Worker(url, { type: 'classic' });

        this._engine.onmessage = (e) => {
            const data = e.data;
            if (data.ready) {
                setTimeout(() => {
                    this.sendCommand('uci');
                }, 100);
            } else if (data.stdout != null) {
                this._handleOutput(data.stdout);
            } else if (data.exit != null) {
                this._handleExit(data.exit);
            }
        };

        this._engine.postMessage({
            wasm_type: wasmType,
            origin: window.location.origin
        });
    }

    _fallbackToSingle() {
        if (this._fallbackTriggered) return;
        this._fallbackTriggered = true;

        if (this._engine && typeof this._engine.terminate === 'function') {
            try { this._engine.terminate(); } catch {}
        }
        this._engine = null;
        this._ready = false;
        this._mode = 'single';

        // Determine single-thread equivalent
        if (this._wasmType.includes('simd')) {
            this._wasmType = 'single_simd';
        } else {
            this._wasmType = 'single';
        }
        console.log('[PikafishWasm] Falling back to:', this._wasmType);
        this._startSingleThread(this._wasmType);
    }

    _handleOutput(line) {
        if (line === 'uciok') {
            this._ready = true;
            if (this._resolveReady) {
                this._resolveReady();
                this._resolveReady = null;
            }
        }
        if (this._onOutput) {
            this._onOutput(line);
        }
    }

    /**
     * Set UCI options on the engine.
     * @param {string} name - option name
     * @param {string} value - option value
     */
    setOption(name, value) {
        this.sendCommand(`setoption name ${name} value ${value}`);
    }

    _handleExit(code) {
        console.error('[PikafishWasm] Engine exited with code', code);
        this._engine = null;
        this._ready = false;
    }

    sendCommand(cmd) {
        if (!this._engine) return;
        if (this._mode === 'multi') {
            this._engine.sendCommand(cmd);
        } else {
            this._engine.postMessage({ command: cmd });
        }
    }

    /**
     * Get the best move for a given FEN position.
     * @param {string} fen - FEN string
     * @param {object} options - { mode: 'movetime'|'depth', movetime: ms, depth: int }
     * @returns {Promise<string>} bestmove in ICCS format (e.g. 'b0c2')
     */
    bestmove(fen, options = {}) {
        return new Promise((resolve) => {
            const mode = options.mode || 'movetime';
            const goCmd = mode === 'depth'
                ? `go depth ${options.depth || 20}`
                : `go movetime ${options.movetime || 1000}`;

            this._onOutput = (line) => {
                if (line.startsWith('bestmove')) {
                    const parts = line.split(/\s+/);
                    this._onOutput = null;
                    resolve(parts[1] || null);
                }
            };

            this.sendCommand(`position fen ${fen}`);
            this.sendCommand(goCmd);
        });
    }

    /**
     * Evaluate a position and return score info.
     * @param {string} fen - FEN string
     * @param {object} options - { mode, movetime, depth }
     * @param {function} onInfo - callback for intermediate info lines (optional)
     * @returns {Promise<{bestmove: string, score: object}>}
     */
    evaluate(fen, options = {}, onInfo = null) {
        return new Promise((resolve) => {
            const mode = options.mode || 'movetime';
            const goCmd = mode === 'depth'
                ? `go depth ${options.depth || 20}`
                : `go movetime ${options.movetime || 1000}`;

            let lastScore = null;

            this._onOutput = (line) => {
                // Parse score from info lines
                if (line.startsWith('info') && line.includes('score')) {
                    const cpMatch = line.match(/\bscore (cp|mate) (-?\d+)/);
                    if (cpMatch) {
                        lastScore = {
                            type: cpMatch[1],
                            value: parseInt(cpMatch[2])
                        };
                    }
                    if (onInfo) onInfo(line);
                }
                if (line.startsWith('bestmove')) {
                    const parts = line.split(/\s+/);
                    this._onOutput = null;
                    resolve({
                        bestmove: parts[1] || null,
                        score: lastScore
                    });
                }
            };

            this.sendCommand(`position fen ${fen}`);
            this.sendCommand(goCmd);
        });
    }

    stop() {
        this.sendCommand('stop');
    }

    terminate() {
        if (this._engine) {
            if (this._mode === 'single' && typeof this._engine.terminate === 'function') {
                this._engine.terminate();
            }
            this._engine = null;
        }
        this._ready = false;
    }

    get isReady() {
        return this._ready;
    }
}

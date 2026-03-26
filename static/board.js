/**
 * Xiangqi board renderer using HTML5 Canvas.
 * Draws a traditional-style board with pieces as circles with Chinese characters.
 * Supports click-to-move for human players.
 */

const PIECE_CHARS = {
    'K': '帅', 'A': '仕', 'B': '相', 'N': '马', 'R': '车', 'C': '炮', 'P': '兵',
    'k': '将', 'a': '士', 'b': '象', 'n': '马', 'r': '车', 'c': '炮', 'p': '卒',
};

const BOARD_COLORS = {
    background: '#f6e0b5',
    line: '#5c3a1e',
    redPieceFill: '#fff0dc',
    redPieceStroke: '#b41e1e',
    redPieceText: '#b41e1e',
    blackPieceFill: '#fff0dc',
    blackPieceStroke: '#1a1a1a',
    blackPieceText: '#1a1a1a',
    lastMoveHighlight: 'rgba(255, 200, 0, 0.35)',
    coordText: '#8b7355',
    selectedHighlight: 'rgba(0, 180, 255, 0.35)',
    legalMoveHighlight: 'rgba(0, 200, 100, 0.3)',
};

const MARKER_POSITIONS = [
    [1, 2], [7, 2], [1, 7], [7, 7],
    [0, 3], [2, 3], [4, 3], [6, 3], [8, 3],
    [0, 6], [2, 6], [4, 6], [6, 6], [8, 6],
];

class BoardRenderer {
    constructor(canvas, cellSize = 58, margin = 42) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.cellSize = cellSize;
        this.margin = margin;
        this.leftPad = margin + 14;
        this.rightPad = margin - 14;
        this.topPad = margin - 12;
        this.bottomPad = margin + 12;
        this.pieceRadius = cellSize * 0.42;

        const w = this.leftPad + this.rightPad + cellSize * 8;
        const h = this.topPad + this.bottomPad + cellSize * 9;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        this.ctx.scale(dpr, dpr);
        this.width = w;
        this.height = h;

        // Selection state for human player
        this.selectedSquare = null; // {col, row}
        this.legalMoves = []; // [{col, row}, ...]
        this.onMoveCallback = null; // called with ICCS move string
        this.currentFen = null;
        this.currentLastMove = null;
        this.humanInteractive = false; // whether clicks are enabled

        // Click handler
        canvas.addEventListener('click', (e) => this._onClick(e));
    }

    /** Convert board coords (col 0-8, row 0-9) to pixel coords. Row 0 = bottom (red). */
    toPixel(col, row) {
        return {
            x: this.leftPad + col * this.cellSize,
            y: this.topPad + (9 - row) * this.cellSize,
        };
    }

    /** Convert pixel coords to board coords. Returns {col, row} or null. */
    fromPixel(px, py) {
        const col = Math.round((px - this.leftPad) / this.cellSize);
        const row = 9 - Math.round((py - this.topPad) / this.cellSize);
        if (col >= 0 && col <= 8 && row >= 0 && row <= 9) {
            return { col, row };
        }
        return null;
    }

    parseFEN(fen) {
        const grid = Array.from({ length: 10 }, () => Array(9).fill(null));
        const boardStr = fen.split(' ')[0];
        const ranks = boardStr.split('/');
        for (let i = 0; i < ranks.length; i++) {
            const row = 9 - i;
            let col = 0;
            for (const ch of ranks[i]) {
                if (ch >= '1' && ch <= '9') {
                    col += parseInt(ch);
                } else {
                    grid[row][col] = ch;
                    col++;
                }
            }
        }
        return grid;
    }

    render(fen, lastMove = null) {
        this.currentFen = fen;
        this.currentLastMove = lastMove;

        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.width, this.height);

        this.drawBackground();
        this.drawGrid();
        this.drawPalace();
        this.drawPositionMarkers();
        this.drawRiver();
        this.drawCoordinates();

        if (lastMove) this.drawLastMove(lastMove);

        // Draw selection and legal moves
        if (this.selectedSquare) {
            this._drawSelection(this.selectedSquare.col, this.selectedSquare.row);
        }
        for (const m of this.legalMoves) {
            this._drawLegalMove(m.col, m.row);
        }

        const grid = this.parseFEN(fen);
        for (let row = 0; row < 10; row++) {
            for (let col = 0; col < 9; col++) {
                if (grid[row][col]) {
                    this.drawPiece(col, row, grid[row][col]);
                }
            }
        }
    }

    _drawSelection(col, row) {
        const { x, y } = this.toPixel(col, row);
        const ctx = this.ctx;
        ctx.fillStyle = BOARD_COLORS.selectedHighlight;
        ctx.fillRect(x - this.cellSize / 2, y - this.cellSize / 2, this.cellSize, this.cellSize);
    }

    _drawLegalMove(col, row) {
        const { x, y } = this.toPixel(col, row);
        const ctx = this.ctx;
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fillStyle = BOARD_COLORS.legalMoveHighlight;
        ctx.fill();
    }

    _onClick(e) {
        if (!this.humanInteractive || !this.currentFen) return;

        const rect = this.canvas.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const pos = this.fromPixel(px, py);
        if (!pos) return;

        const grid = this.parseFEN(this.currentFen);
        const turn = this.currentFen.split(' ')[1] || 'w';

        if (this.selectedSquare) {
            // Check if clicking a legal move destination
            const isLegal = this.legalMoves.some(m => m.col === pos.col && m.row === pos.row);
            if (isLegal) {
                const move = String.fromCharCode(97 + this.selectedSquare.col) + this.selectedSquare.row
                           + String.fromCharCode(97 + pos.col) + pos.row;
                this.selectedSquare = null;
                this.legalMoves = [];
                this.render(this.currentFen, this.currentLastMove);
                if (this.onMoveCallback) this.onMoveCallback(move);
                return;
            }
            // Check if clicking own piece to re-select
            const piece = grid[pos.row][pos.col];
            if (piece && this._isOwnPiece(piece, turn)) {
                this._selectPiece(pos.col, pos.row, grid, turn);
                return;
            }
            // Deselect
            this.selectedSquare = null;
            this.legalMoves = [];
            this.render(this.currentFen, this.currentLastMove);
            return;
        }

        // No selection yet - try to select a piece
        const piece = grid[pos.row][pos.col];
        if (piece && this._isOwnPiece(piece, turn)) {
            this._selectPiece(pos.col, pos.row, grid, turn);
        }
    }

    _selectPiece(col, row, grid, turn) {
        this.selectedSquare = { col, row };
        // We need legal moves from the server, but for now compute locally via the callback
        // The app.js will set legalMovesForPiece
        if (this.onSelectCallback) {
            this.onSelectCallback(col, row);
        }
        this.render(this.currentFen, this.currentLastMove);
    }

    _isOwnPiece(piece, turn) {
        if (turn === 'w') return piece === piece.toUpperCase() && 'KABNRCP'.includes(piece);
        return piece === piece.toLowerCase() && 'kabnrcp'.includes(piece);
    }

    setLegalMoves(moves) {
        // moves: array of {col, row}
        this.legalMoves = moves;
        this.render(this.currentFen, this.currentLastMove);
    }

    clearSelection() {
        this.selectedSquare = null;
        this.legalMoves = [];
        if (this.currentFen) this.render(this.currentFen, this.currentLastMove);
    }

    drawBackground() {
        const ctx = this.ctx;
        const grad = ctx.createLinearGradient(0, 0, this.width, this.height);
        grad.addColorStop(0, '#f0d8a8');
        grad.addColorStop(0.5, '#f6e0b5');
        grad.addColorStop(1, '#ecd49c');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, this.width, this.height);
    }

    drawGrid() {
        const ctx = this.ctx;
        ctx.strokeStyle = BOARD_COLORS.line;
        ctx.lineWidth = 1.2;
        for (let row = 0; row <= 9; row++) {
            const { x: x0, y } = this.toPixel(0, row);
            const { x: x1 } = this.toPixel(8, row);
            ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
        }
        for (let col = 0; col <= 8; col++) {
            if (col === 0 || col === 8) {
                const { x, y: y0 } = this.toPixel(col, 0);
                const { y: y1 } = this.toPixel(col, 9);
                ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
            } else {
                const { x, y: y0 } = this.toPixel(col, 0);
                const { y: y4 } = this.toPixel(col, 4);
                const { y: y5 } = this.toPixel(col, 5);
                const { y: y9 } = this.toPixel(col, 9);
                ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y4); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(x, y5); ctx.lineTo(x, y9); ctx.stroke();
            }
        }
    }

    drawPalace() {
        const ctx = this.ctx;
        ctx.strokeStyle = BOARD_COLORS.line;
        ctx.lineWidth = 1.0;
        let p1 = this.toPixel(3, 0), p2 = this.toPixel(5, 2);
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
        p1 = this.toPixel(5, 0); p2 = this.toPixel(3, 2);
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
        p1 = this.toPixel(3, 7); p2 = this.toPixel(5, 9);
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
        p1 = this.toPixel(5, 7); p2 = this.toPixel(3, 9);
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    }

    drawPositionMarkers() {
        const ctx = this.ctx;
        const s = 5, g = 3;
        ctx.strokeStyle = BOARD_COLORS.line;
        ctx.lineWidth = 1.0;
        for (const [col, row] of MARKER_POSITIONS) {
            const { x, y } = this.toPixel(col, row);
            const dirs = [];
            if (col > 0) { dirs.push([-1, -1]); dirs.push([-1, 1]); }
            if (col < 8) { dirs.push([1, -1]); dirs.push([1, 1]); }
            for (const [dx, dy] of dirs) {
                ctx.beginPath();
                ctx.moveTo(x + dx * g, y + dy * (g + s));
                ctx.lineTo(x + dx * g, y + dy * g);
                ctx.lineTo(x + dx * (g + s), y + dy * g);
                ctx.stroke();
            }
        }
    }

    drawRiver() {
        const ctx = this.ctx;
        const { y: y4 } = this.toPixel(0, 4);
        const { y: y5 } = this.toPixel(0, 5);
        const midY = (y4 + y5) / 2;
        ctx.font = `${this.cellSize * 0.45}px "KaiTi", "STKaiti", "楷体", serif`;
        ctx.fillStyle = BOARD_COLORS.line;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const { x: x2 } = this.toPixel(2, 0);
        const { x: x6 } = this.toPixel(6, 0);
        ctx.fillText('楚  河', x2, midY);
        ctx.fillText('汉  界', x6, midY);
    }

    drawCoordinates() {
        const ctx = this.ctx;
        ctx.font = `700 ${this.cellSize * 0.28}px "Consolas", monospace`;
        ctx.fillStyle = '#000000';
        const edgePadding = 6;

        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        for (let col = 0; col <= 8; col++) {
            const label = String.fromCharCode(97 + col);
            const { x } = this.toPixel(col, 0);
            ctx.fillText(label, x, this.height - edgePadding);
        }

        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        for (let row = 0; row <= 9; row++) {
            const { y } = this.toPixel(0, row);
            ctx.fillText(row.toString(), edgePadding, y);
        }
    }

    drawLastMove(moveStr) {
        if (!moveStr || moveStr.length < 4) return;
        const ctx = this.ctx;
        const cf = moveStr.charCodeAt(0) - 97;
        const rf = parseInt(moveStr[1]);
        const ct = moveStr.charCodeAt(2) - 97;
        const rt = parseInt(moveStr[3]);
        for (const [c, r] of [[cf, rf], [ct, rt]]) {
            const { x, y } = this.toPixel(c, r);
            ctx.fillStyle = BOARD_COLORS.lastMoveHighlight;
            ctx.fillRect(x - this.cellSize / 2, y - this.cellSize / 2, this.cellSize, this.cellSize);
        }
    }

    drawPiece(col, row, piece) {
        const ctx = this.ctx;
        const { x, y } = this.toPixel(col, row);
        const r = this.pieceRadius;
        const isRed = piece === piece.toUpperCase();
        const fillColor = isRed ? BOARD_COLORS.redPieceFill : BOARD_COLORS.blackPieceFill;
        const strokeColor = isRed ? BOARD_COLORS.redPieceStroke : BOARD_COLORS.blackPieceStroke;
        const textColor = isRed ? BOARD_COLORS.redPieceText : BOARD_COLORS.blackPieceText;

        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.25)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.restore();

        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(x, y, r - 4, 0, Math.PI * 2);
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1;
        ctx.stroke();

        const charName = PIECE_CHARS[piece] || piece;
        ctx.font = `bold ${r * 1.2}px "KaiTi", "STKaiti", "楷体", "SimSun", serif`;
        ctx.fillStyle = textColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(charName, x, y + 1);
    }
}

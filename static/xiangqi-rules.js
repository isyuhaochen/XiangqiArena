/**
 * Client-side Xiangqi legal move generator.
 * Computes legal moves from a FEN string without server calls.
 */

const XiangqiRules = (() => {

const RED_PIECES = new Set('KABNRCP');
const BLACK_PIECES = new Set('kabnrcp');

function pieceColor(p) {
    if (!p) return null;
    return RED_PIECES.has(p) ? 'w' : BLACK_PIECES.has(p) ? 'b' : null;
}

function parseFEN(fen) {
    const grid = Array.from({ length: 10 }, () => Array(9).fill(null));
    const parts = fen.split(' ');
    const rows = parts[0].split('/');
    const turn = parts[1] || 'w';
    for (let i = 0; i < rows.length && i < 10; i++) {
        const rowIdx = 9 - i; // FEN row 0 = top = row 9
        let col = 0;
        for (const ch of rows[i]) {
            if (ch >= '1' && ch <= '9') {
                col += parseInt(ch);
            } else {
                if (col < 9) grid[rowIdx][col] = ch;
                col++;
            }
        }
    }
    return { grid, turn };
}

function inBounds(c, r) { return c >= 0 && c <= 8 && r >= 0 && r <= 9; }

function isOwn(grid, turn, c, r) {
    const p = grid[r]?.[c];
    return p ? pieceColor(p) === turn : false;
}

function isEnemy(grid, turn, c, r) {
    const p = grid[r]?.[c];
    if (!p) return false;
    const color = pieceColor(p);
    return color !== null && color !== turn;
}

function kingMoves(grid, turn, col, row) {
    const color = pieceColor(grid[row][col]);
    const pCols = [3, 4, 5];
    const pRows = color === 'w' ? [0, 1, 2] : [7, 8, 9];
    const moves = [];
    for (const [dc, dr] of [[0,1],[0,-1],[1,0],[-1,0]]) {
        const nc = col + dc, nr = row + dr;
        if (pCols.includes(nc) && pRows.includes(nr) && !isOwn(grid, turn, nc, nr)) {
            moves.push([nc, nr]);
        }
    }
    return moves;
}

function advisorMoves(grid, turn, col, row) {
    const color = pieceColor(grid[row][col]);
    const pCols = [3, 4, 5];
    const pRows = color === 'w' ? [0, 1, 2] : [7, 8, 9];
    const moves = [];
    for (const [dc, dr] of [[1,1],[1,-1],[-1,1],[-1,-1]]) {
        const nc = col + dc, nr = row + dr;
        if (pCols.includes(nc) && pRows.includes(nr) && !isOwn(grid, turn, nc, nr)) {
            moves.push([nc, nr]);
        }
    }
    return moves;
}

function bishopMoves(grid, turn, col, row) {
    const color = pieceColor(grid[row][col]);
    const minR = color === 'w' ? 0 : 5;
    const maxR = color === 'w' ? 4 : 9;
    const moves = [];
    for (const [dc, dr] of [[2,2],[2,-2],[-2,2],[-2,-2]]) {
        const nc = col + dc, nr = row + dr;
        const ec = col + dc / 2, er = row + dr / 2;
        if (inBounds(nc, nr) && nr >= minR && nr <= maxR) {
            if (!grid[er][ec] && !isOwn(grid, turn, nc, nr)) {
                moves.push([nc, nr]);
            }
        }
    }
    return moves;
}

function knightMoves(grid, turn, col, row) {
    const moves = [];
    const offsets = [
        [0,1,1,2],[0,1,-1,2],[0,-1,1,-2],[0,-1,-1,-2],
        [1,0,2,1],[1,0,2,-1],[-1,0,-2,1],[-1,0,-2,-1],
    ];
    for (const [ldc, ldr, fdc, fdr] of offsets) {
        const lc = col + ldc, lr = row + ldr;
        if (!inBounds(lc, lr) || grid[lr][lc]) continue;
        const nc = col + fdc, nr = row + fdr;
        if (inBounds(nc, nr) && !isOwn(grid, turn, nc, nr)) {
            moves.push([nc, nr]);
        }
    }
    return moves;
}

function rookMoves(grid, turn, col, row) {
    const moves = [];
    for (const [dc, dr] of [[0,1],[0,-1],[1,0],[-1,0]]) {
        let nc = col + dc, nr = row + dr;
        while (inBounds(nc, nr)) {
            const p = grid[nr][nc];
            if (!p) {
                moves.push([nc, nr]);
            } else if (isEnemy(grid, turn, nc, nr)) {
                moves.push([nc, nr]);
                break;
            } else {
                break;
            }
            nc += dc; nr += dr;
        }
    }
    return moves;
}

function cannonMoves(grid, turn, col, row) {
    const moves = [];
    for (const [dc, dr] of [[0,1],[0,-1],[1,0],[-1,0]]) {
        let nc = col + dc, nr = row + dr;
        // Phase 1: move without capture
        while (inBounds(nc, nr)) {
            if (!grid[nr][nc]) {
                moves.push([nc, nr]);
            } else {
                break;
            }
            nc += dc; nr += dr;
        }
        // Phase 2: skip screen, find capture
        nc += dc; nr += dr;
        while (inBounds(nc, nr)) {
            if (grid[nr][nc]) {
                if (isEnemy(grid, turn, nc, nr)) moves.push([nc, nr]);
                break;
            }
            nc += dc; nr += dr;
        }
    }
    return moves;
}

function pawnMoves(grid, turn, col, row) {
    const color = pieceColor(grid[row][col]);
    const moves = [];
    const fdr = color === 'w' ? 1 : -1;
    const crossed = color === 'w' ? row >= 5 : row <= 4;

    const nr = row + fdr;
    if (inBounds(col, nr) && !isOwn(grid, turn, col, nr)) {
        moves.push([col, nr]);
    }
    if (crossed) {
        for (const dc of [1, -1]) {
            const nc = col + dc;
            if (inBounds(nc, row) && !isOwn(grid, turn, nc, row)) {
                moves.push([nc, row]);
            }
        }
    }
    return moves;
}

function pseudoMoves(grid, turn, col, row) {
    const p = grid[row]?.[col];
    if (!p) return [];
    const u = p.toUpperCase();
    switch (u) {
        case 'K': return kingMoves(grid, turn, col, row);
        case 'A': return advisorMoves(grid, turn, col, row);
        case 'B': return bishopMoves(grid, turn, col, row);
        case 'N': return knightMoves(grid, turn, col, row);
        case 'R': return rookMoves(grid, turn, col, row);
        case 'C': return cannonMoves(grid, turn, col, row);
        case 'P': return pawnMoves(grid, turn, col, row);
        default: return [];
    }
}

function findKing(grid, side) {
    const k = side === 'w' ? 'K' : 'k';
    for (let r = 0; r < 10; r++)
        for (let c = 0; c < 9; c++)
            if (grid[r][c] === k) return [c, r];
    return null;
}

function flyingKingExposed(grid) {
    const rk = findKing(grid, 'w');
    const bk = findKing(grid, 'b');
    if (!rk || !bk || rk[0] !== bk[0]) return false;
    const col = rk[0];
    const minR = Math.min(rk[1], bk[1]);
    const maxR = Math.max(rk[1], bk[1]);
    for (let r = minR + 1; r < maxR; r++) {
        if (grid[r][col]) return false;
    }
    return true;
}

function isInCheck(grid, side) {
    const kp = findKing(grid, side);
    if (!kp) return true;
    const attacker = side === 'w' ? 'b' : 'w';
    for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 9; c++) {
            const p = grid[r][c];
            if (p && pieceColor(p) === attacker) {
                const targets = pseudoMoves(grid, attacker, c, r);
                if (targets.some(([tc, tr]) => tc === kp[0] && tr === kp[1])) {
                    return true;
                }
            }
        }
    }
    return false;
}

function wouldLeaveInCheck(grid, turn, cf, rf, ct, rt) {
    const piece = grid[rf][cf];
    const captured = grid[rt][ct];
    grid[rf][cf] = null;
    grid[rt][ct] = piece;
    const side = pieceColor(piece);
    const bad = isInCheck(grid, side) || flyingKingExposed(grid);
    grid[rf][cf] = piece;
    grid[rt][ct] = captured;
    return bad;
}

/**
 * Get legal destination squares for a piece at (col, row) given a FEN.
 * @param {string} fen
 * @param {number} col
 * @param {number} row
 * @returns {Array<{col: number, row: number}>}
 */
function getLegalMovesForPiece(fen, col, row) {
    const { grid, turn } = parseFEN(fen);
    const piece = grid[row]?.[col];
    if (!piece || pieceColor(piece) !== turn) return [];

    const targets = pseudoMoves(grid, turn, col, row);
    const legal = [];
    for (const [tc, tr] of targets) {
        if (!wouldLeaveInCheck(grid, turn, col, row, tc, tr)) {
            legal.push({ col: tc, row: tr });
        }
    }
    return legal;
}

function gridToFen(grid, turn) {
    const ranks = [];
    for (let row = 9; row >= 0; row--) {
        let rank = '';
        let empty = 0;
        for (let col = 0; col < 9; col++) {
            const p = grid[row][col];
            if (!p) {
                empty++;
            } else {
                if (empty > 0) { rank += empty; empty = 0; }
                rank += p;
            }
        }
        if (empty > 0) rank += empty;
        ranks.push(rank);
    }
    return ranks.join('/') + ' ' + turn;
}

/**
 * Apply a move to a FEN position. No validation (caller must ensure legality).
 * @param {string} fen
 * @param {string} moveStr - ICCS format e.g. "h2e2"
 * @returns {{ piece: string, captured: string|null, fen_after: string, move: string }}
 */
function applyMove(fen, moveStr) {
    const { grid, turn } = parseFEN(fen);
    const cf = moveStr.charCodeAt(0) - 97;
    const rf = parseInt(moveStr[1]);
    const ct = moveStr.charCodeAt(2) - 97;
    const rt = parseInt(moveStr[3]);
    const piece = grid[rf][cf];
    const captured = grid[rt][ct];
    grid[rf][cf] = null;
    grid[rt][ct] = piece;
    const newTurn = turn === 'w' ? 'b' : 'w';
    return { piece, captured, fen_after: gridToFen(grid, newTurn), move: moveStr };
}

/**
 * Get all legal moves in ICCS format for the current side.
 * @param {string} fen
 * @returns {string[]} e.g. ["h2e2", "b0c2", ...]
 */
function getAllLegalMoves(fen) {
    const { grid, turn } = parseFEN(fen);
    const moves = [];
    for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 9; c++) {
            const p = grid[r][c];
            if (!p || pieceColor(p) !== turn) continue;
            const targets = pseudoMoves(grid, turn, c, r);
            for (const [tc, tr] of targets) {
                if (!wouldLeaveInCheck(grid, turn, c, r, tc, tr)) {
                    moves.push(String.fromCharCode(97 + c) + r + String.fromCharCode(97 + tc) + tr);
                }
            }
        }
    }
    return moves;
}

/**
 * Check if the game is over.
 * @param {string} fen - current position
 * @param {number} moveCount - total moves played (for draw detection)
 * @param {Array} moveHistory - array of move records with `captured` field
 * @returns {{ isOver: boolean, winner: string|null, reason: string }}
 */
function isGameOver(fen, moveCount, moveHistory) {
    const { grid, turn } = parseFEN(fen);

    // King missing
    if (!findKing(grid, 'w')) return { isOver: true, winner: 'black', reason: 'black wins - red king captured' };
    if (!findKing(grid, 'b')) return { isOver: true, winner: 'red', reason: 'red wins - black king captured' };

    // No legal moves
    const legal = getAllLegalMoves(fen);
    if (legal.length === 0) {
        const winner = turn === 'w' ? 'black' : 'red';
        if (isInCheck(grid, turn)) {
            return { isOver: true, winner, reason: `checkmate - ${winner} wins` };
        } else {
            return { isOver: true, winner, reason: `stalemate - ${winner} wins` };
        }
    }

    // Draw by 30 full moves (60 plies) without capture
    if (moveHistory && moveHistory.length >= 60) {
        const recent = moveHistory.slice(-60);
        if (recent.every(m => !m.captured)) {
            return { isOver: true, winner: 'draw', reason: 'draw - 30 full moves without capture' };
        }
    }

    return { isOver: false, winner: null, reason: '' };
}

// --- Chinese notation ---

const PIECE_NAMES_ZH = {
    'K': '帅', 'A': '仕', 'B': '相', 'N': '马', 'R': '车', 'C': '炮', 'P': '兵',
    'k': '将', 'a': '士', 'b': '象', 'n': '马', 'r': '车', 'c': '炮', 'p': '卒',
};
const RED_DIGITS = '零一二三四五六七八九';
const BLACK_DIGITS = '0123456789';
const POSITION_PREFIXES = { 2: ['前', '后'], 3: ['前', '中', '后'] };

function sideNumeral(side, value) {
    const digits = side === 'w' ? RED_DIGITS : BLACK_DIGITS;
    return value >= 0 && value < digits.length ? digits[value] : String(value);
}

function fileNumberForSide(side, col) {
    return side === 'w' ? 9 - col : col + 1;
}

function isForwardForSide(side, fromRow, toRow) {
    return side === 'w' ? toRow > fromRow : toRow < fromRow;
}

function movePrefixZh(grid, piece, col, row) {
    const side = pieceColor(piece);
    // Find same piece on same file
    const sameFile = [];
    for (let r = 0; r < 10; r++) {
        if (grid[r][col] === piece) sameFile.push([col, r]);
    }
    const pieceName = PIECE_NAMES_ZH[piece];
    if (sameFile.length > 1) {
        // Sort: red descending row (front=high), black ascending row (front=low)
        const ordered = [...sameFile].sort((a, b) => side === 'w' ? b[1] - a[1] : a[1] - b[1]);
        const idx = ordered.findIndex(p => p[0] === col && p[1] === row);
        const prefixes = POSITION_PREFIXES[ordered.length];
        const prefix = prefixes ? prefixes[idx] : sideNumeral(side, idx + 1);
        return prefix + pieceName;
    }
    return pieceName + sideNumeral(side, fileNumberForSide(side, col));
}

/**
 * Convert ICCS move to Chinese notation given the BEFORE-move FEN.
 * @param {string} fen - position BEFORE the move
 * @param {string} moveStr - ICCS e.g. "h2e2"
 * @returns {string} e.g. "炮二平五"
 */
function toChineseMove(fen, moveStr) {
    const { grid } = parseFEN(fen);
    const cf = moveStr.charCodeAt(0) - 97;
    const rf = parseInt(moveStr[1]);
    const ct = moveStr.charCodeAt(2) - 97;
    const rt = parseInt(moveStr[3]);
    const piece = grid[rf][cf];
    if (!piece) return moveStr;

    const side = pieceColor(piece);
    const pieceType = piece.toUpperCase();
    const prefix = movePrefixZh(grid, piece, cf, rf);
    let action, target;

    if (ct === cf) {
        action = isForwardForSide(side, rf, rt) ? '进' : '退';
        if ('ABN'.includes(pieceType)) {
            target = sideNumeral(side, fileNumberForSide(side, ct));
        } else {
            target = sideNumeral(side, Math.abs(rt - rf));
        }
    } else if (rt === rf) {
        action = '平';
        target = sideNumeral(side, fileNumberForSide(side, ct));
    } else {
        action = isForwardForSide(side, rf, rt) ? '进' : '退';
        target = sideNumeral(side, fileNumberForSide(side, ct));
    }

    return prefix + action + target;
}

return { getLegalMovesForPiece, applyMove, getAllLegalMoves, isGameOver, toChineseMove };

})();

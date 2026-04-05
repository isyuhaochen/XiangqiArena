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

return { getLegalMovesForPiece };

})();

"""
Xiangqi (Chinese Chess) game engine.
Pure Python, no external dependencies.
Handles board state, FEN parsing, move generation, validation, and game-over detection.
"""


# --- Coordinate helpers ---

def iccs_to_coords(iccs: str):
    """Convert ICCS move string (e.g. 'h2e2') to (col_from, row_from, col_to, row_to)."""
    cf = ord(iccs[0]) - ord('a')
    rf = int(iccs[1])
    ct = ord(iccs[2]) - ord('a')
    rt = int(iccs[3])
    return cf, rf, ct, rt


def coords_to_iccs(cf, rf, ct, rt):
    """Convert coordinates to ICCS string."""
    return f"{chr(cf + ord('a'))}{rf}{chr(ct + ord('a'))}{rt}"


# Piece characters
RED_PIECES = set('KABNRCP')
BLACK_PIECES = set('kabnrcp')
RED_DIGITS = "零一二三四五六七八九"
BLACK_DIGITS = "0123456789"
POSITION_PREFIXES = {
    2: ["前", "后"],
    3: ["前", "中", "后"],
}

PIECE_NAMES_ZH = {
    'K': '帅', 'A': '仕', 'B': '相', 'N': '马', 'R': '车', 'C': '炮', 'P': '兵',
    'k': '将', 'a': '士', 'b': '象', 'n': '马', 'r': '车', 'c': '炮', 'p': '卒',
}


class Board:
    """Xiangqi board with full rule enforcement."""

    def __init__(self, fen=None):
        # 10 rows x 9 cols, grid[row][col], None = empty
        self._grid = [[None] * 9 for _ in range(10)]
        self.turn = 'w'  # 'w' = red, 'b' = black
        self.move_history = []
        if fen:
            self.from_fen(fen)

    # --- FEN ---

    def from_fen(self, fen: str):
        """Parse FEN string into board state.
        FEN reads top-to-bottom: first rank in string is row 9 (black's back rank).
        """
        parts = fen.strip().split()
        board_str = parts[0]
        self.turn = parts[1] if len(parts) > 1 else 'w'

        self._grid = [[None] * 9 for _ in range(10)]
        ranks = board_str.split('/')
        for rank_idx, rank_str in enumerate(ranks):
            row = 9 - rank_idx  # top rank = row 9
            col = 0
            for ch in rank_str:
                if ch.isdigit():
                    col += int(ch)
                else:
                    self._grid[row][col] = ch
                    col += 1

    def to_fen(self) -> str:
        """Convert board state to FEN string."""
        ranks = []
        for row in range(9, -1, -1):  # row 9 first
            rank_str = ''
            empty = 0
            for col in range(9):
                piece = self._grid[row][col]
                if piece is None:
                    empty += 1
                else:
                    if empty > 0:
                        rank_str += str(empty)
                        empty = 0
                    rank_str += piece
            if empty > 0:
                rank_str += str(empty)
            ranks.append(rank_str)
        return '/'.join(ranks) + ' ' + self.turn

    def to_text(self) -> str:
        """Generate text board diagram for display to LLM."""
        lines = []
        lines.append("  a b c d e f g h i")
        lines.append("  +-+-+-+-+-+-+-+-+")
        for row in range(9, -1, -1):
            row_str = f"{row} "
            for col in range(9):
                piece = self._grid[row][col]
                if piece is None:
                    row_str += '. '
                else:
                    row_str += piece + ' '
            row_str += f" {row}"
            lines.append(row_str)
            if row == 5:
                lines.append("  = = = 楚河汉界 = = =")
        lines.append("  +-+-+-+-+-+-+-+-+")
        lines.append("  a b c d e f g h i")
        side = "Red" if self.turn == 'w' else "Black"
        lines.append(f"\nSide to move: {side}")
        return '\n'.join(lines)

    # --- Piece access ---

    def get_piece(self, col, row):
        if 0 <= col <= 8 and 0 <= row <= 9:
            return self._grid[row][col]
        return None

    def _set_piece(self, col, row, piece):
        self._grid[row][col] = piece

    @staticmethod
    def is_red(piece):
        return piece is not None and piece in RED_PIECES

    @staticmethod
    def is_black(piece):
        return piece is not None and piece in BLACK_PIECES

    @staticmethod
    def piece_color(piece):
        if piece is None:
            return None
        return 'w' if piece in RED_PIECES else 'b'

    @staticmethod
    def _side_numeral(side, value):
        digits = RED_DIGITS if side == 'w' else BLACK_DIGITS
        if 0 <= value < len(digits):
            return digits[value]
        return str(value)

    @staticmethod
    def _file_number_for_side(side, col):
        return 9 - col if side == 'w' else col + 1

    @staticmethod
    def _is_forward_for_side(side, from_row, to_row):
        return to_row > from_row if side == 'w' else to_row < from_row

    def _same_piece_positions(self, piece):
        positions = []
        for row in range(10):
            for col in range(9):
                if self._grid[row][col] == piece:
                    positions.append((col, row))
        return positions

    def _position_prefix(self, piece, positions, current_pos):
        side = self.piece_color(piece)
        ordered = sorted(positions, key=lambda pos: pos[1], reverse=(side == 'w'))
        index = ordered.index(current_pos)
        prefixes = POSITION_PREFIXES.get(len(ordered))
        if prefixes:
            return prefixes[index]
        return self._side_numeral(side, index + 1)

    def _move_prefix_zh(self, piece, col, row):
        same_file_positions = [
            pos for pos in self._same_piece_positions(piece)
            if pos[0] == col
        ]
        piece_name = PIECE_NAMES_ZH[piece]
        if len(same_file_positions) > 1:
            return f"{self._position_prefix(piece, same_file_positions, (col, row))}{piece_name}"

        side = self.piece_color(piece)
        file_num = self._file_number_for_side(side, col)
        return f"{piece_name}{self._side_numeral(side, file_num)}"

    def to_chinese_move(self, move_iccs: str):
        """Convert an ICCS move into Chinese notation."""
        cf, rf, ct, rt = iccs_to_coords(move_iccs)
        piece = self.get_piece(cf, rf)
        if piece is None:
            raise ValueError(f"No piece at source square for move: {move_iccs}")

        side = self.piece_color(piece)
        piece_type = piece.upper()
        prefix = self._move_prefix_zh(piece, cf, rf)

        if ct == cf:
            action = "进" if self._is_forward_for_side(side, rf, rt) else "退"
            if piece_type in {'A', 'B', 'N'}:
                target = self._side_numeral(side, self._file_number_for_side(side, ct))
            else:
                target = self._side_numeral(side, abs(rt - rf))
        elif rt == rf:
            action = "平"
            target = self._side_numeral(side, self._file_number_for_side(side, ct))
        else:
            action = "进" if self._is_forward_for_side(side, rf, rt) else "退"
            target = self._side_numeral(side, self._file_number_for_side(side, ct))

        return f"{prefix}{action}{target}"

    def _is_own(self, piece):
        """Check if piece belongs to the side to move."""
        return self.piece_color(piece) == self.turn

    def _is_enemy(self, piece):
        """Check if piece belongs to the opponent."""
        color = self.piece_color(piece)
        return color is not None and color != self.turn

    # --- Move generation per piece type ---

    def _in_bounds(self, col, row):
        return 0 <= col <= 8 and 0 <= row <= 9

    def _king_moves(self, col, row):
        """King moves: 1 step orthogonal within palace."""
        color = self.piece_color(self._grid[row][col])
        if color == 'w':
            palace_cols, palace_rows = (3, 4, 5), (0, 1, 2)
        else:
            palace_cols, palace_rows = (3, 4, 5), (7, 8, 9)

        moves = []
        for dc, dr in [(0, 1), (0, -1), (1, 0), (-1, 0)]:
            nc, nr = col + dc, row + dr
            if nc in palace_cols and nr in palace_rows:
                target = self.get_piece(nc, nr)
                if not self._is_own(target):
                    moves.append((nc, nr))
        return moves

    def _advisor_moves(self, col, row):
        """Advisor moves: 1 step diagonal within palace."""
        color = self.piece_color(self._grid[row][col])
        if color == 'w':
            palace_cols, palace_rows = (3, 4, 5), (0, 1, 2)
        else:
            palace_cols, palace_rows = (3, 4, 5), (7, 8, 9)

        moves = []
        for dc, dr in [(1, 1), (1, -1), (-1, 1), (-1, -1)]:
            nc, nr = col + dc, row + dr
            if nc in palace_cols and nr in palace_rows:
                target = self.get_piece(nc, nr)
                if not self._is_own(target):
                    moves.append((nc, nr))
        return moves

    def _bishop_moves(self, col, row):
        """Bishop/Elephant moves: 2 steps diagonal, cannot cross river, blocked by eye."""
        color = self.piece_color(self._grid[row][col])
        # Red stays rows 0-4, black stays rows 5-9
        if color == 'w':
            row_range = range(0, 5)
        else:
            row_range = range(5, 10)

        moves = []
        for dc, dr in [(2, 2), (2, -2), (-2, 2), (-2, -2)]:
            nc, nr = col + dc, row + dr
            # Eye position (blocking square)
            ec, er = col + dc // 2, row + dr // 2
            if self._in_bounds(nc, nr) and nr in row_range:
                if self.get_piece(ec, er) is None:  # eye not blocked
                    target = self.get_piece(nc, nr)
                    if not self._is_own(target):
                        moves.append((nc, nr))
        return moves

    def _knight_moves(self, col, row):
        """Knight moves: L-shape with leg block check."""
        moves = []
        # (leg_dc, leg_dr, final_dc, final_dr)
        knight_offsets = [
            (0, 1, 1, 2), (0, 1, -1, 2),    # up
            (0, -1, 1, -2), (0, -1, -1, -2),  # down
            (1, 0, 2, 1), (1, 0, 2, -1),      # right
            (-1, 0, -2, 1), (-1, 0, -2, -1),  # left
        ]
        for ldc, ldr, fdc, fdr in knight_offsets:
            # Check leg
            leg_c, leg_r = col + ldc, row + ldr
            if not self._in_bounds(leg_c, leg_r):
                continue
            if self.get_piece(leg_c, leg_r) is not None:
                continue  # leg blocked
            nc, nr = col + fdc, row + fdr
            if self._in_bounds(nc, nr):
                target = self.get_piece(nc, nr)
                if not self._is_own(target):
                    moves.append((nc, nr))
        return moves

    def _rook_moves(self, col, row):
        """Rook moves: any distance orthogonally."""
        moves = []
        for dc, dr in [(0, 1), (0, -1), (1, 0), (-1, 0)]:
            nc, nr = col + dc, row + dr
            while self._in_bounds(nc, nr):
                target = self.get_piece(nc, nr)
                if target is None:
                    moves.append((nc, nr))
                elif self._is_enemy(target):
                    moves.append((nc, nr))
                    break
                else:
                    break  # own piece
                nc += dc
                nr += dr
        return moves

    def _cannon_moves(self, col, row):
        """Cannon moves: like rook for non-capture; needs exactly 1 screen to capture."""
        moves = []
        for dc, dr in [(0, 1), (0, -1), (1, 0), (-1, 0)]:
            nc, nr = col + dc, row + dr
            # Phase 1: move without capture (no pieces in the way)
            while self._in_bounds(nc, nr):
                target = self.get_piece(nc, nr)
                if target is None:
                    moves.append((nc, nr))
                else:
                    break  # found screen
                nc += dc
                nr += dr

            # Phase 2: skip over screen, then look for capture target
            nc += dc
            nr += dr
            while self._in_bounds(nc, nr):
                target = self.get_piece(nc, nr)
                if target is not None:
                    if self._is_enemy(target):
                        moves.append((nc, nr))
                    break  # stop after first piece behind screen
                nc += dc
                nr += dr
        return moves

    def _pawn_moves(self, col, row):
        """Pawn moves: forward only before river; forward or sideways after crossing."""
        color = self.piece_color(self._grid[row][col])
        moves = []

        if color == 'w':
            # Red pawn moves up (increasing row)
            forward = (0, 1)
            crossed_river = row >= 5
        else:
            # Black pawn moves down (decreasing row)
            forward = (0, -1)
            crossed_river = row <= 4

        # Forward move
        nc, nr = col + forward[0], row + forward[1]
        if self._in_bounds(nc, nr):
            target = self.get_piece(nc, nr)
            if not self._is_own(target):
                moves.append((nc, nr))

        # Sideways moves (only after crossing river)
        if crossed_river:
            for dc in [1, -1]:
                nc = col + dc
                if self._in_bounds(nc, row):
                    target = self.get_piece(nc, row)
                    if not self._is_own(target):
                        moves.append((nc, row))

        return moves

    def _pseudo_moves_for(self, col, row):
        """Generate pseudo-legal moves for the piece at (col, row)."""
        piece = self.get_piece(col, row)
        if piece is None:
            return []

        p = piece.upper()
        if p == 'K':
            return self._king_moves(col, row)
        elif p == 'A':
            return self._advisor_moves(col, row)
        elif p == 'B':
            return self._bishop_moves(col, row)
        elif p == 'N':
            return self._knight_moves(col, row)
        elif p == 'R':
            return self._rook_moves(col, row)
        elif p == 'C':
            return self._cannon_moves(col, row)
        elif p == 'P':
            return self._pawn_moves(col, row)
        return []

    # --- Check detection ---

    def _find_king(self, side):
        """Find king position for the given side."""
        king = 'K' if side == 'w' else 'k'
        for row in range(10):
            for col in range(9):
                if self._grid[row][col] == king:
                    return col, row
        return None

    def _flying_king_exposed(self):
        """Check if the two kings face each other on the same column with no pieces between.
        This is illegal in Xiangqi."""
        rk = self._find_king('w')
        bk = self._find_king('b')
        if rk is None or bk is None:
            return False
        if rk[0] != bk[0]:
            return False  # different columns
        col = rk[0]
        min_row = min(rk[1], bk[1])
        max_row = max(rk[1], bk[1])
        for r in range(min_row + 1, max_row):
            if self._grid[r][col] is not None:
                return False  # piece between them
        return True  # kings face each other

    def _is_attacked_by(self, col, row, attacker_side):
        """Check if (col, row) is attacked by any piece of attacker_side."""
        # Temporarily set turn to attacker_side to use _pseudo_moves_for
        saved_turn = self.turn
        self.turn = attacker_side

        attacked = False
        for r in range(10):
            for c in range(9):
                piece = self._grid[r][c]
                if piece is not None and self.piece_color(piece) == attacker_side:
                    targets = self._pseudo_moves_for(c, r)
                    if (col, row) in targets:
                        attacked = True
                        break
            if attacked:
                break

        self.turn = saved_turn
        return attacked

    def _is_in_check(self, side):
        """Check if the given side's king is in check."""
        king_pos = self._find_king(side)
        if king_pos is None:
            return True  # king captured (shouldn't happen in legal play)
        attacker = 'b' if side == 'w' else 'w'
        return self._is_attacked_by(king_pos[0], king_pos[1], attacker)

    def _would_leave_in_check(self, cf, rf, ct, rt):
        """Test if making a move would leave the moving side's king in check."""
        # Make the move temporarily
        piece = self._grid[rf][cf]
        captured = self._grid[rt][ct]
        self._grid[rf][cf] = None
        self._grid[rt][ct] = piece

        side = self.piece_color(piece)
        in_check = self._is_in_check(side) or self._flying_king_exposed()

        # Undo
        self._grid[rf][cf] = piece
        self._grid[rt][ct] = captured
        return in_check

    # --- Legal moves ---

    def get_legal_moves(self):
        """Get all legal moves for the current side in ICCS format."""
        moves = []
        for row in range(10):
            for col in range(9):
                piece = self._grid[row][col]
                if piece is not None and self.piece_color(piece) == self.turn:
                    for tc, tr in self._pseudo_moves_for(col, row):
                        if not self._would_leave_in_check(col, row, tc, tr):
                            moves.append(coords_to_iccs(col, row, tc, tr))
        return moves

    def is_valid_move(self, move_iccs: str) -> bool:
        """Check if a move in ICCS format is legal."""
        return move_iccs in self.get_legal_moves()

    # --- Move execution ---

    def make_move(self, move_iccs: str):
        """Execute a move. Returns dict with move info. Raises ValueError if illegal."""
        if not self.is_valid_move(move_iccs):
            raise ValueError(f"Illegal move: {move_iccs}")

        cf, rf, ct, rt = iccs_to_coords(move_iccs)
        piece = self._grid[rf][cf]
        captured = self._grid[rt][ct]
        move_zh = self.to_chinese_move(move_iccs)

        fen_before = self.to_fen()

        self.move_history.append({
            'move': move_iccs,
            'move_zh': move_zh,
            'piece': piece,
            'captured': captured,
            'from': (cf, rf),
            'to': (ct, rt),
            'fen_before': fen_before,
        })

        self._grid[rf][cf] = None
        self._grid[rt][ct] = piece
        self.turn = 'b' if self.turn == 'w' else 'w'

        return {
            'move': move_iccs,
            'move_zh': move_zh,
            'piece': piece,
            'captured': captured,
            'fen_after': self.to_fen(),
        }

    def undo_move(self):
        """Undo the last move."""
        if not self.move_history:
            return
        last = self.move_history.pop()
        cf, rf = last['from']
        ct, rt = last['to']
        self._grid[rf][cf] = last['piece']
        self._grid[rt][ct] = last['captured']
        self.turn = 'b' if self.turn == 'w' else 'w'

    # --- Game over detection ---

    def is_checkmate(self):
        """Current side has no legal moves and is in check."""
        if not self.get_legal_moves():
            return self._is_in_check(self.turn)
        return False

    def is_stalemate(self):
        """Current side has no legal moves but is NOT in check."""
        if not self.get_legal_moves():
            return not self._is_in_check(self.turn)
        return False

    def is_game_over(self):
        """Check if game is over. Returns (is_over, winner, reason)."""
        legal = self.get_legal_moves()
        if not legal:
            if self._is_in_check(self.turn):
                winner = 'black' if self.turn == 'w' else 'red'
                return True, winner, f"checkmate - {winner} wins"
            else:
                # In Xiangqi, stalemate = the stalemated side loses
                winner = 'black' if self.turn == 'w' else 'red'
                return True, winner, f"stalemate - {winner} wins"

        # Check if a king is missing (captured - edge case)
        if self._find_king('w') is None:
            return True, 'black', "black wins - red king captured"
        if self._find_king('b') is None:
            return True, 'red', "red wins - black king captured"

        # Draw by 30 full moves (60 plies) without any capture.
        if len(self.move_history) >= 60:
            recent_moves = self.move_history[-60:]
            if all(move.get('captured') is None for move in recent_moves):
                return True, 'draw', "draw - 30 full moves without capture"

        return False, None, ""

    def copy(self):
        """Create a deep copy of the board."""
        b = Board()
        b._grid = [row[:] for row in self._grid]
        b.turn = self.turn
        b.move_history = list(self.move_history)
        return b

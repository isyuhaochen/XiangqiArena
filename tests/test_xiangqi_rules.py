import os
import sys
import unittest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from xiangqi import Board


KINGS_ADVISORS_BISHOPS_ONLY_FEN = "2bakab2/9/9/9/9/9/9/9/9/2BAKAB2 w"
ROOK_STILL_ON_BOARD_FEN = "2bakab2/9/9/9/4R4/9/9/9/9/2BAKAB2 b"


class XiangqiRuleTests(unittest.TestCase):
    def test_draw_when_only_kings_advisors_and_bishops_remain(self):
        board = Board(KINGS_ADVISORS_BISHOPS_ONLY_FEN)

        is_over, winner, reason = board.is_game_over()

        self.assertTrue(is_over)
        self.assertEqual(winner, "draw")
        self.assertEqual(reason, "draw - only kings, advisors, and bishops remain")

    def test_not_draw_when_other_material_still_exists(self):
        board = Board(ROOK_STILL_ON_BOARD_FEN)

        is_over, winner, reason = board.is_game_over()

        self.assertFalse(is_over)
        self.assertIsNone(winner)
        self.assertEqual(reason, "")


if __name__ == "__main__":
    unittest.main()

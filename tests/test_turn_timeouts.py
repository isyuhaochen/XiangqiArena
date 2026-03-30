import asyncio
import os
import sys
import types
import unittest
from unittest.mock import patch

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

if "openai" not in sys.modules:
    openai_stub = types.ModuleType("openai")

    class DummyAPIConnectionError(Exception):
        pass

    class DummyAPIStatusError(Exception):
        status_code = 500

    class DummyAsyncOpenAI:
        pass

    openai_stub.APIConnectionError = DummyAPIConnectionError
    openai_stub.APIStatusError = DummyAPIStatusError
    openai_stub.AsyncOpenAI = DummyAsyncOpenAI
    sys.modules["openai"] = openai_stub

import server


DEFAULT_FEN = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w"


class SlowLLMPlayer:
    def __init__(self, *args, **kwargs):
        pass

    async def request_move(self, board, side):
        yield {"type": "thinking", "content": "still thinking"}
        await asyncio.sleep(1)
        yield {"type": "move", "move": "a0a1"}


class SlowEngine:
    async def bestmove(self, fen):
        await asyncio.sleep(1)
        return "a0a1"


class TurnTimeoutTests(unittest.IsolatedAsyncioTestCase):
    def _make_game(self, red_config: server.PlayerConfig) -> server.GameSession:
        game = server.GameSession(
            "test",
            DEFAULT_FEN,
            red_config,
            server.PlayerConfig(type="random"),
        )
        game.timer_config = server.TimerConfig(enabled=True, initial_time=1, increment=0)
        game.timer_red = 0.05
        game.timer_black = 0.05
        return game

    async def _assert_red_times_out(self, game: server.GameSession):
        await server._game_loop_inner(game)
        self.assertEqual(game.status, "finished")
        self.assertEqual(game.winner, "black")
        self.assertIn("ran out of time", game.reason)
        self.assertEqual(game.timer_red, 0)

    async def test_human_turn_timeout(self):
        await self._assert_red_times_out(self._make_game(server.PlayerConfig(type="human")))

    async def test_random_turn_timeout(self):
        await self._assert_red_times_out(self._make_game(server.PlayerConfig(type="random")))

    async def test_llm_turn_timeout(self):
        game = self._make_game(
            server.PlayerConfig(
                type="llm",
                api_base="https://example.invalid/v1",
                api_key="test-key",
                model="test-model",
            )
        )
        with patch.object(server, "LLMPlayer", SlowLLMPlayer):
            await self._assert_red_times_out(game)

    async def test_pikafish_turn_timeout(self):
        game = self._make_game(
            server.PlayerConfig(
                type="pikafish",
                engine_path="pikafish\\pikafish-bmi2.exe",
                engine_mode="movetime",
                engine_movetime=1000,
            )
        )

        async def fake_get_player_engine(game, side_name, config):
            return SlowEngine()

        with patch.object(server, "_get_player_engine", fake_get_player_engine):
            await self._assert_red_times_out(game)


if __name__ == "__main__":
    unittest.main()

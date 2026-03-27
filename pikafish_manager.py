"""
Pikafish UCI engine manager for async position evaluation.
Manages a Pikafish subprocess and provides non-blocking evaluation.
"""

import asyncio
import os
import re
from typing import Optional, Callable

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_ENGINE_PATH = os.path.join(BASE_DIR, "pikafish", "pikafish-bmi2.exe")


def _parse_score_from_info(line: str) -> Optional[dict]:
    """Parse score from a UCI info line.

    Returns {"type": "cp", "value": int} or {"type": "mate", "value": int}, or None.
    """
    # Match "score cp <N>" or "score mate <N>"
    m = re.search(r'\bscore\s+(cp|mate)\s+(-?\d+)', line)
    if m:
        return {"type": m.group(1), "value": int(m.group(2))}
    return None


class PikafishEvaluator:
    """Manages a Pikafish UCI subprocess for async position evaluation."""

    def __init__(self, engine_path: str = DEFAULT_ENGINE_PATH,
                 movetime: Optional[int] = 2000,
                 depth: Optional[int] = None,
                 score_type: str = "PawnValueNormalized"):
        self.engine_path = engine_path
        self.movetime = movetime
        self.depth = depth
        self.score_type = score_type
        self._process: Optional[asyncio.subprocess.Process] = None
        self._lock = asyncio.Lock()
        self._generation = 0
        self._analyzing = False
        self._alive = False

    async def start(self):
        """Start the engine subprocess and initialize UCI protocol."""
        self._process = await asyncio.create_subprocess_exec(
            self.engine_path,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        self._alive = True
        await self._send("uci")
        await self._read_until("uciok")
        print(f"  [Pikafish] Setting ScoreType = {self.score_type}")
        await self._send(f"setoption name ScoreType value {self.score_type}")
        await self._send("isready")
        await self._read_until("readyok")

    async def evaluate(self, fen: str, move_number: int,
                       callback: Callable[[int, dict], None]):
        """Evaluate a position asynchronously.

        Cancels any ongoing analysis before starting.
        Calls callback(move_number, score_dict) when done.
        Score is normalized to red's perspective (positive = good for red).
        """
        if not self._alive:
            return

        async with self._lock:
            self._generation += 1
            gen = self._generation

            # Stop any ongoing analysis
            if self._analyzing:
                await self._send("stop")
                await self._read_until("bestmove")
                self._analyzing = False

            # Send position and start analysis
            await self._send(f"position fen {fen}")

            if self.depth is not None:
                await self._send(f"go depth {self.depth}")
            else:
                await self._send(f"go movetime {self.movetime or 2000}")

            self._analyzing = True

            # Read info lines until bestmove
            last_score = None
            while True:
                line = await self._readline()
                if line is None:
                    # Process died
                    self._alive = False
                    return

                if gen != self._generation:
                    # A newer evaluation was requested; discard this one
                    return

                score = _parse_score_from_info(line)
                if score is not None:
                    last_score = score

                if line.startswith("bestmove"):
                    self._analyzing = False
                    break

            # Normalize score to red's perspective
            if last_score and gen == self._generation:
                normalized = self._normalize_score(last_score, fen)
                callback(move_number, normalized)

    async def stop_analysis(self):
        """Stop any ongoing analysis."""
        if not self._alive:
            return
        async with self._lock:
            if self._analyzing:
                await self._send("stop")
                await self._read_until("bestmove")
                self._analyzing = False

    async def shutdown(self):
        """Gracefully shut down the engine subprocess."""
        if not self._process or not self._alive:
            return
        self._alive = False
        try:
            self._process.stdin.write(b"quit\n")
            await self._process.stdin.drain()
        except Exception:
            pass
        try:
            await asyncio.wait_for(self._process.wait(), timeout=3.0)
        except asyncio.TimeoutError:
            self._process.kill()
            try:
                await self._process.wait()
            except Exception:
                pass

    async def _send(self, command: str):
        """Send a command to the engine."""
        if not self._process or not self._alive:
            return
        try:
            self._process.stdin.write((command + "\n").encode())
            await self._process.stdin.drain()
        except Exception:
            self._alive = False

    async def _readline(self) -> Optional[str]:
        """Read a line from engine stdout."""
        if not self._process or not self._alive:
            return None
        try:
            line = await asyncio.wait_for(
                self._process.stdout.readline(), timeout=30.0
            )
            if not line:
                return None
            return line.decode().strip()
        except asyncio.TimeoutError:
            return None
        except Exception:
            return None

    async def _read_until(self, keyword: str):
        """Read lines until one starts with the keyword."""
        while True:
            line = await self._readline()
            if line is None:
                self._alive = False
                return
            if line.startswith(keyword):
                return

    @staticmethod
    def _normalize_score(score: dict, fen: str) -> dict:
        """Normalize score to red's perspective (positive = good for red).

        Pikafish reports from side-to-move's perspective.
        In our FEN format, 'w' = red, 'b' = black.
        """
        parts = fen.split()
        side_to_move = parts[1] if len(parts) > 1 else 'w'
        result = dict(score)
        if side_to_move == 'b':
            result['value'] = -result['value']
        return result

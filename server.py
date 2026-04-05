"""
FastAPI backend for BattleChess - LLM Xiangqi Arena.
Manages game sessions, proxies LLM interactions, serves frontend.
Supports human, random, LLM, and Pikafish player types.
"""

import asyncio
import uuid
import json
import time
import random
import re
from contextlib import asynccontextmanager
from typing import Optional

import os
import yaml

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from xiangqi import Board
from llm_client import LLMPlayer
from prompt_registry import get_default_prompt_name, get_prompt_profile, list_prompt_profiles, resolve_prompt_name
from pikafish_manager import (
    DEFAULT_ENGINE_FILENAME,
    DEFAULT_ENGINE_PATH,
    PikafishEvaluator,
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
CONFIG_PATH = os.path.join(BASE_DIR, "config.yaml")
LOG_DIR = os.path.join(BASE_DIR, "logs")
os.makedirs(LOG_DIR, exist_ok=True)
DEFAULT_ENGINE_RELATIVE_PATH = os.path.join("pikafish", DEFAULT_ENGINE_FILENAME)


# --- Config loading ---

def load_app_config() -> dict:
    """Load config.yaml and return a normalized dict."""
    if not os.path.exists(CONFIG_PATH):
        return {}
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def load_model_presets() -> list[dict]:
    """Load model presets from config.yaml."""
    data = load_app_config()
    if "models" not in data:
        return []
    try:
        models = data["models"]
        if not isinstance(models, list):
            return []
        result = []
        for m in models:
            if isinstance(m, dict) and "name" in m:
                result.append({
                    "name": m["name"],
                    "api_base": m.get("api_base", ""),
                    "api_key": m.get("api_key", ""),
                    "model": m.get("model", m["name"]),
                    "prompt_name": resolve_prompt_name(m.get("prompt_name"), m.get("prompt_lang")),
                    "enable_thinking": m.get("enable_thinking", True),
                    "max_completion_tokens": m.get("max_completion_tokens", m.get("max_output_tokens", 8192)),
                })
        return result
    except Exception:
        return []


def _normalize_engine_path(path: Optional[str], default_path: str = DEFAULT_ENGINE_PATH) -> str:
    candidate = (path or "").strip() or default_path
    candidate = os.path.expandvars(os.path.expanduser(candidate))
    if not os.path.isabs(candidate):
        candidate = os.path.join(BASE_DIR, candidate)
    candidate = os.path.normpath(candidate)
    if os.path.isdir(candidate):
        candidate = os.path.join(candidate, DEFAULT_ENGINE_FILENAME)
    return os.path.normpath(candidate)


def _display_engine_path(path: Optional[str], default_path: str = DEFAULT_ENGINE_RELATIVE_PATH) -> str:
    candidate = (path or "").strip() or default_path
    candidate = os.path.expandvars(os.path.expanduser(candidate))
    if os.path.isabs(candidate):
        try:
            rel = os.path.relpath(candidate, BASE_DIR)
            if not rel.startswith(".."):
                candidate = rel
        except ValueError:
            pass
    return os.path.normpath(candidate)


def get_default_player_pikafish_path() -> str:
    return _display_engine_path(DEFAULT_ENGINE_RELATIVE_PATH)


def get_default_eval_pikafish_path() -> str:
    data = load_app_config()
    pikafish_cfg = data.get("pikafish", {})
    if not isinstance(pikafish_cfg, dict):
        pikafish_cfg = {}
    return _display_engine_path(pikafish_cfg.get("eval_engine_path"), DEFAULT_ENGINE_RELATIVE_PATH)


# --- Models ---

def _player_label(config) -> str:
    """Human-readable label for a player config (no API keys)."""
    if config.type == "human":
        return "Human"
    elif config.type == "random":
        return "Random"
    elif config.type == "pikafish":
        return "Pikafish"
    elif config.type == "llm":
        name = config.preset or config.model or "unknown"
        return f"LLM ({name})"
    return config.type


def _player_filename_label(config) -> str:
    """Short player label suitable for filenames."""
    if config.type == "human":
        return "Human"
    if config.type == "random":
        return "Random"
    if config.type == "pikafish":
        return "Pikafish"
    if config.type == "llm":
        name = config.preset or config.model or "unknown"
        return f"LLM-{name}"
    return config.type or "unknown"


def _sanitize_filename_part(text: str) -> str:
    """Make a Windows-safe filename fragment."""
    cleaned = re.sub(r'[<>:"/\\|?*\x00-\x1f]+', "_", text.strip())
    cleaned = re.sub(r"\s+", "_", cleaned)
    cleaned = re.sub(r"_+", "_", cleaned).strip(" ._")
    return cleaned[:80] or "unknown"


def _append_indented_block(lines: list[str], header: str, content: str):
    """Append a possibly multi-line block with indentation."""
    lines.append(header)
    if not content:
        lines.append("    (empty)")
        return
    for part in str(content).splitlines():
        lines.append(f"    {part}")


def _format_move_text(move_data: dict) -> str:
    move = move_data.get("move", "")
    move_zh = move_data.get("move_zh")
    return f"{move} ({move_zh})" if move_zh else move


def _format_result_text(game) -> str:
    if game.winner == "draw":
        return game.reason or "draw"
    if game.winner:
        return f"{game.winner} wins - {game.reason}"
    return game.reason or "unfinished"


def _merged_stream_events(events: list[dict]) -> list[dict]:
    merged = []
    for event in events:
        if (
            merged
            and event.get("type") in {"thinking", "reasoning"}
            and merged[-1].get("type") == event.get("type")
            and merged[-1].get("side") == event.get("side")
        ):
            merged[-1]["content"] = f"{merged[-1].get('content', '')}{event.get('content', '')}"
            continue
        merged.append(dict(event))

    for event in merged:
        if event.get("type") in {"thinking", "reasoning"}:
            text = str(event.get("content", "")).replace("\r\n", "\n").strip("\n")
            text = re.sub(r"\n{3,}", "\n\n", text)
            event["content"] = text
    return merged


def _append_event_log(lines: list[str], events: list[dict]):
    """Append streamed thinking/tool events to the saved log."""
    lines.append("Detailed Event Log:")

    for event in _merged_stream_events(events):
        event_type = event.get("type")
        side = event.get("side", "-")

        if event_type == "turn":
            lines.append(f"  [{side}] turn")
        elif event_type == "waiting_human":
            lines.append(f"  [{side}] waiting_human")
        elif event_type == "thinking":
            if event.get("content", ""):
                _append_indented_block(lines, f"  [{side}] thinking:", event.get("content", ""))
        elif event_type == "reasoning":
            if event.get("content", ""):
                _append_indented_block(lines, f"  [{side}] reasoning:", event.get("content", ""))
        elif event_type == "tool_call":
            args_text = json.dumps(event.get("args", {}), ensure_ascii=False)
            lines.append(f"  [{side}] tool_call: {event.get('tool', '')}({args_text})")
        elif event_type == "tool_result":
            _append_indented_block(lines, f"  [{side}] tool_result: {event.get('tool', '')}", event.get("result", ""))
        elif event_type == "move":
            captured = f" x{event['captured']}" if event.get("captured") else ""
            lines.append(f"  [{side}] move: #{event.get('number')} {_format_move_text(event)}{captured}")
        elif event_type == "game_over":
            lines.append(f"  [system] game_over: winner={event.get('winner')} reason={event.get('reason')}")


def _mask_secret(secret: Optional[str]) -> Optional[str]:
    if not secret:
        return None
    if len(secret) <= 8:
        return "*" * len(secret)
    return f"{secret[:4]}...{secret[-4:]}"


def _player_config_summary(config) -> dict:
    summary = {
        "type": config.type,
    }
    if config.type == "llm":
        summary.update({
            "preset": config.preset,
            "api_base": config.api_base,
            "model": config.model,
            "prompt_name": _resolved_prompt_name(config),
            "enable_thinking": config.enable_thinking,
            "max_completion_tokens": _resolved_max_completion_tokens(config),
            "api_key_masked": _mask_secret(config.api_key),
        })
    elif config.type == "pikafish":
        summary.update({
            "engine": "Pikafish WASM (browser)",
            "engine_mode": _resolved_player_engine_mode(config),
            "engine_movetime": _resolved_player_engine_movetime(config),
            "engine_depth": _resolved_player_engine_depth(config),
        })
    return {k: v for k, v in summary.items() if v is not None}


def _append_player_configs(lines: list[str], game):
    lines.append("Player Configs:")
    red_config_text = json.dumps(_player_config_summary(game.red_config), ensure_ascii=False, indent=2)
    black_config_text = json.dumps(_player_config_summary(game.black_config), ensure_ascii=False, indent=2)
    _append_indented_block(lines, "  Red Config:", red_config_text)
    _append_indented_block(lines, "  Black Config:", black_config_text)


def write_game_log(game):
    """Write one game record per file under logs/."""
    from datetime import datetime
    now = datetime.now()
    ts = now.strftime("%Y-%m-%d %H:%M:%S")
    ts_filename = now.strftime("%Y%m%d-%H%M%S")
    red_label = _player_label(game.red_config)
    black_label = _player_label(game.black_config)
    red_filename = _sanitize_filename_part(_player_filename_label(game.red_config))
    black_filename = _sanitize_filename_part(_player_filename_label(game.black_config))

    lines = []
    lines.append(f"{'='*60}")
    lines.append(f"Game: {game.id} | {ts}")
    lines.append(f"Red: {red_label}  vs  Black: {black_label}")
    _append_player_configs(lines, game)
    lines.append(f"Initial FEN: {game.initial_fen}")
    lines.append(f"Result: {_format_result_text(game)}")
    lines.append(f"Moves ({len(game.move_history)}):")
    for m in game.move_history:
        captured = f" x{m['captured']}" if m.get('captured') else ""
        lines.append(f"  #{m['number']} {m['side']}: {_format_move_text(m)}{captured}")
    lines.append(f"Final FEN: {game.board.to_fen()}")
    lines.append("")
    _append_event_log(lines, game.events)
    lines.append("")

    filename = f"red-{red_filename}_vs_black-{black_filename}_{ts_filename}_{game.id}.log"
    log_path = os.path.join(LOG_DIR, filename)
    with open(log_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


# ---------------------------------------------------------------------------
# Log file parser (for history replay)
# ---------------------------------------------------------------------------

_RE_GAME_LINE = re.compile(r"^Game:\s+(\S+)\s+\|\s+(.+)$")
_RE_PLAYERS_LINE = re.compile(r"^Red:\s+(.+?)\s{2,}vs\s{2,}Black:\s+(.+)$")
_RE_INITIAL_FEN = re.compile(r"^Initial FEN:\s+(.+)$")
_RE_RESULT = re.compile(r"^Result:\s+(.+)$")
_RE_MOVES_HEADER = re.compile(r"^Moves\s+\((\d+)\):")
_RE_MOVE_LINE = re.compile(
    r"^\s*#(\d+)\s+(red|black):\s+(\S+)"
    r"(?:\s+\(([^)]+)\))?"
    r"(?:\s+x(\S+))?$"
)


def parse_game_log(filepath: str, include_moves: bool = True) -> dict:
    """Parse a .log file and return structured game data."""
    with open(filepath, "r", encoding="utf-8") as f:
        raw_lines = f.readlines()

    result = {
        "filename": os.path.basename(filepath),
        "game_id": "",
        "timestamp": "",
        "red_label": "",
        "black_label": "",
        "initial_fen": "",
        "result": "",
        "move_count": 0,
    }

    in_moves = False
    raw_moves = []

    for line in raw_lines:
        line = line.rstrip("\n")

        m = _RE_GAME_LINE.match(line)
        if m:
            result["game_id"] = m.group(1)
            result["timestamp"] = m.group(2).strip()
            continue

        m = _RE_PLAYERS_LINE.match(line)
        if m:
            result["red_label"] = m.group(1).strip()
            result["black_label"] = m.group(2).strip()
            continue

        m = _RE_INITIAL_FEN.match(line)
        if m:
            result["initial_fen"] = m.group(1).strip()
            continue

        m = _RE_RESULT.match(line)
        if m:
            result["result"] = m.group(1).strip()
            continue

        m = _RE_MOVES_HEADER.match(line)
        if m:
            result["move_count"] = int(m.group(1))
            in_moves = True
            continue

        if in_moves:
            m = _RE_MOVE_LINE.match(line)
            if m:
                raw_moves.append({
                    "number": int(m.group(1)),
                    "side": m.group(2),
                    "move": m.group(3),
                    "move_zh": m.group(4) or None,
                    "captured": m.group(5) or None,
                })
            else:
                # End of moves section
                in_moves = False

    if not include_moves:
        return result

    # Replay moves to compute FEN after each step
    moves_with_fen = []
    if result["initial_fen"]:
        try:
            board = Board(result["initial_fen"])
            for rm in raw_moves:
                try:
                    move_result = board.make_move(rm["move"])
                    rm["fen"] = move_result.get("fen_after", board.to_fen())
                except Exception:
                    rm["fen"] = board.to_fen()
                moves_with_fen.append(rm)
        except Exception:
            # If board init fails, include moves without FEN
            for rm in raw_moves:
                rm["fen"] = ""
                moves_with_fen.append(rm)

    result["moves"] = moves_with_fen
    return result


class PlayerConfig(BaseModel):
    type: str = "human"  # human | random | llm | pikafish
    preset: Optional[str] = None
    api_base: Optional[str] = None
    api_key: Optional[str] = None
    model: Optional[str] = None
    prompt_name: Optional[str] = None
    prompt_lang: Optional[str] = None  # legacy fallback
    enable_thinking: Optional[bool] = None
    max_completion_tokens: Optional[int] = None
    max_output_tokens: Optional[int] = None
    engine_path: Optional[str] = None
    engine_mode: Optional[str] = None
    engine_movetime: Optional[int] = None
    engine_depth: Optional[int] = None


def _resolved_max_completion_tokens(config: PlayerConfig) -> int:
    return config.max_completion_tokens or config.max_output_tokens or 8192


def _resolved_prompt_name(config: PlayerConfig) -> str:
    return resolve_prompt_name(config.prompt_name, config.prompt_lang)


def _resolved_player_engine_path(config: PlayerConfig) -> str:
    return _normalize_engine_path(config.engine_path, DEFAULT_ENGINE_RELATIVE_PATH)


def _display_player_engine_path(config: PlayerConfig) -> str:
    return _display_engine_path(config.engine_path, DEFAULT_ENGINE_RELATIVE_PATH)


def _resolved_player_engine_mode(config: PlayerConfig) -> str:
    return config.engine_mode if config.engine_mode in {"movetime", "depth"} else "movetime"


def _resolved_player_engine_movetime(config: PlayerConfig) -> int:
    value = config.engine_movetime or 1000
    return max(100, value)


def _resolved_player_engine_depth(config: PlayerConfig) -> int:
    value = config.engine_depth or 20
    return max(1, value)


def _validate_prompt_config(config: PlayerConfig):
    if config.type != "llm":
        return
    try:
        get_prompt_profile(_resolved_prompt_name(config))
    except ValueError as e:
        raise HTTPException(400, str(e))


class PikafishConfig(BaseModel):
    enabled: bool = False
    engine_path: Optional[str] = None
    mode: str = "movetime"    # "movetime" | "depth"
    movetime: int = 1000
    depth: int = 20
    score_type: str = "Elo"  # "Elo" | "PawnValueNormalized" | "Raw"


class TimerConfig(BaseModel):
    enabled: bool = False
    initial_time: int = 1800  # seconds (30 minutes)
    increment: int = 10       # seconds per move


class CreateGameRequest(BaseModel):
    fen: str = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w"
    red: PlayerConfig
    black: PlayerConfig
    pikafish: PikafishConfig = PikafishConfig()
    timer: TimerConfig = TimerConfig()


class HumanMoveRequest(BaseModel):
    move: str


class SeekGameRequest(BaseModel):
    ply: int


class GameSession:
    def __init__(self, game_id: str, fen: str, red: PlayerConfig, black: PlayerConfig):
        self.id = game_id
        self.board = Board(fen)
        self.initial_fen = fen
        self.red_config = red
        self.black_config = black
        self.status = "waiting"  # waiting | playing | paused | finished
        self.winner: Optional[str] = None
        self.reason: Optional[str] = None
        self.move_history = []
        self.events = []
        self.event_queues: list[asyncio.Queue] = []
        self.next_event_id = 1
        self.task: Optional[asyncio.Task] = None
        self.pause_event = asyncio.Event()
        self.pause_event.set()
        # For human move input
        self.human_move_event = asyncio.Event()
        self.human_move: Optional[str] = None
        # Pikafish engine evaluator
        self.pikafish: Optional[PikafishEvaluator] = None
        self.pikafish_config: Optional[PikafishConfig] = None
        self.eval_queue: asyncio.Queue[tuple[int, str]] = asyncio.Queue()
        self.eval_task: Optional[asyncio.Task] = None
        self.eval_pending: set[int] = set()
        self.player_engines: dict[str, PikafishEvaluator] = {}
        # Timer
        self.timer_config: Optional[TimerConfig] = None
        self.timer_red: float = 0.0    # remaining seconds
        self.timer_black: float = 0.0
        self.timer_turn_start: float = 0.0  # time.time() when current turn started

    def broadcast(self, event_type: str, data: dict):
        event = {"type": event_type, "event_id": self.next_event_id, **data}
        self.next_event_id += 1
        self.events.append(event)
        for q in self.event_queues:
            q.put_nowait(event)


# --- Global state ---

games: dict[str, GameSession] = {}


def _build_move_record(move_number: int, side_name: str, result: dict) -> dict:
    return {
        "number": move_number,
        "side": side_name,
        "move": result["move"],
        "move_zh": result.get("move_zh"),
        "piece": result["piece"],
        "captured": result["captured"],
        "fen": result["fen_after"],
        "timestamp": time.time(),
    }


def _finish_game(game: GameSession, winner: str, reason: str):
    game.status = "finished"
    game.winner = winner
    game.reason = reason
    game.broadcast("game_over", {"winner": winner, "reason": reason})


def _broadcast_timer(game: GameSession):
    """Broadcast current timer state to all clients."""
    if not game.timer_config or not game.timer_config.enabled:
        return
    game.broadcast("timer", {
        "red": round(game.timer_red, 1),
        "black": round(game.timer_black, 1),
    })


def _remaining_turn_time(game: GameSession, side: str) -> Optional[float]:
    """Return remaining wall-clock seconds for the current turn."""
    if not game.timer_config or not game.timer_config.enabled:
        return None

    remaining = game.timer_red if side == 'w' else game.timer_black
    elapsed = max(0.0, time.time() - game.timer_turn_start)
    return max(0.0, remaining - elapsed)


def _finish_game_on_timeout(game: GameSession, side: str, side_name: str):
    winner = "black" if side == 'w' else "red"
    if side == 'w':
        game.timer_red = 0
    else:
        game.timer_black = 0
    _broadcast_timer(game)
    _finish_game(game, winner, f"{side_name} ran out of time (超时判负)")


async def _run_with_turn_timeout(
    game: GameSession,
    side: str,
    side_name: str,
    action,
):
    """Run one turn action with a hard deadline based on the game clock."""
    remaining = _remaining_turn_time(game, side)
    if remaining is None:
        return await action
    if remaining <= 0:
        _finish_game_on_timeout(game, side, side_name)
        return None

    try:
        return await asyncio.wait_for(action, timeout=remaining)
    except asyncio.TimeoutError:
        _finish_game_on_timeout(game, side, side_name)
        return None


async def _wait_for_human_move(game: GameSession, side_name: str) -> Optional[str]:
    game.human_move_event.clear()
    game.human_move = None
    game.broadcast("waiting_human", {"side": side_name})
    await game.human_move_event.wait()
    return game.human_move


async def _choose_random_move(game: GameSession, side_name: str) -> Optional[str]:
    await asyncio.sleep(0.3)  # Small delay for visual effect
    legal_moves = game.board.get_legal_moves()
    if not legal_moves:
        return None
    move_iccs = random.choice(legal_moves)
    game.broadcast("thinking", {"side": side_name, "content": f"Random move: {move_iccs}"})
    return move_iccs


async def _request_llm_move(game: GameSession, side: str, side_name: str, config: PlayerConfig) -> Optional[str]:
    player = LLMPlayer(
        api_base=config.api_base,
        api_key=config.api_key,
        model=config.model,
        prompt_name=_resolved_prompt_name(config),
        enable_thinking=True if config.enable_thinking is None else config.enable_thinking,
        max_completion_tokens=_resolved_max_completion_tokens(config),
    )

    async for event in player.request_move(game.board, side):
        if game.status != "playing":
            return None

        if event["type"] == "reasoning":
            game.broadcast("reasoning", {"side": side_name, "content": event["content"]})
        elif event["type"] == "thinking":
            game.broadcast("thinking", {"side": side_name, "content": event["content"]})
        elif event["type"] == "tool_call":
            game.broadcast("tool_call", {
                "side": side_name,
                "tool": event["name"],
                "args": event.get("args", {}),
            })
        elif event["type"] == "tool_result":
            game.broadcast("tool_result", {
                "side": side_name,
                "tool": event["name"],
                "result": event["result"],
            })
        elif event["type"] == "move":
            return event["move"]
        elif event["type"] == "error":
            _finish_game(game, "black" if side == 'w' else "red", f"{side_name} error: {event['message']}")
            return None

    return None


async def _request_pikafish_move(game: GameSession, side_name: str, config: PlayerConfig) -> Optional[str]:
    player_engine = await _get_player_engine(game, side_name, config)
    mode = _resolved_player_engine_mode(config)
    limit_text = (
        f"movetime={_resolved_player_engine_movetime(config)}ms"
        if mode == "movetime"
        else f"depth={_resolved_player_engine_depth(config)}"
    )
    game.broadcast(
        "thinking",
        {
            "side": side_name,
            "content": (
                f"Pikafish ({os.path.basename(_resolved_player_engine_path(config))}) "
                f"[{_display_player_engine_path(config)}] "
                f"analyzing, {limit_text}"
            ),
        },
    )

    move_iccs = await player_engine.bestmove(game.board.to_fen())
    if move_iccs:
        game.broadcast("thinking", {"side": side_name, "content": f"Pikafish move: {move_iccs}"})
    return move_iccs


# --- Pikafish evaluation helper ---

async def _pikafish_evaluate(game: GameSession, fen: str, move_number: int):
    """Run Pikafish evaluation and broadcast the result."""
    try:
        score_type = game.pikafish_config.score_type if game.pikafish_config else "Elo"

        def on_result(move_num, score):
            for move_record in game.move_history:
                if move_record.get("number") == move_num:
                    move_record["eval"] = score
                    move_record["score_type"] = score_type
                    break
            game.broadcast("eval", {"move_number": move_num, "score": score, "score_type": score_type})

        await game.pikafish.evaluate(fen, move_number, on_result)
    except Exception:
        pass


async def _eval_worker(game: GameSession):
    try:
        while True:
            move_number, fen = await game.eval_queue.get()
            try:
                if game.pikafish and game.pikafish_config and game.pikafish_config.enabled:
                    await _pikafish_evaluate(game, fen, move_number)
            finally:
                game.eval_pending.discard(move_number)
                game.eval_queue.task_done()
    except asyncio.CancelledError:
        pass
    finally:
        game.eval_task = None


async def _start_eval_worker(game: GameSession):
    if not game.pikafish or not game.pikafish_config or not game.pikafish_config.enabled:
        return
    if game.eval_task and not game.eval_task.done():
        return
    game.eval_task = asyncio.create_task(_eval_worker(game))


def _is_terminal_fen(fen: str) -> bool:
    try:
        board = Board(fen)
        is_over, _, _ = board.is_game_over()
        return is_over
    except Exception:
        return False


async def _queue_pikafish_eval(game: GameSession, fen: str, move_number: int):
    if not game.pikafish or not game.pikafish_config or not game.pikafish_config.enabled:
        return
    if _is_terminal_fen(fen):
        return
    if move_number in game.eval_pending:
        return
    for move_record in game.move_history:
        if move_record.get("number") == move_number and move_record.get("eval") is not None:
            return
    game.eval_pending.add(move_number)
    await game.eval_queue.put((move_number, fen))
    await _start_eval_worker(game)


async def _queue_missing_evals(game: GameSession):
    if not game.pikafish or not game.pikafish_config or not game.pikafish_config.enabled:
        return
    for move_record in game.move_history:
        if move_record.get("eval") is None:
            await _queue_pikafish_eval(game, move_record["fen"], move_record["number"])


async def _stop_eval_worker(game: GameSession):
    if game.eval_task and not game.eval_task.done():
        game.eval_task.cancel()
        try:
            await game.eval_task
        except asyncio.CancelledError:
            pass
    game.eval_task = None
    game.eval_queue = asyncio.Queue()
    game.eval_pending.clear()


async def _shutdown_player_engines(game: GameSession):
    for engine in game.player_engines.values():
        try:
            await engine.shutdown()
        except Exception:
            pass
    game.player_engines.clear()


async def _get_player_engine(game: GameSession, side_name: str, config: PlayerConfig) -> PikafishEvaluator:
    engine = game.player_engines.get(side_name)
    if engine:
        return engine

    engine = PikafishEvaluator(
        engine_path=_resolved_player_engine_path(config),
        movetime=_resolved_player_engine_movetime(config) if _resolved_player_engine_mode(config) == "movetime" else None,
        depth=_resolved_player_engine_depth(config) if _resolved_player_engine_mode(config) == "depth" else None,
        score_type="Raw",
    )
    await engine.start()
    game.player_engines[side_name] = engine
    return engine


async def _start_eval_engine(game: GameSession):
    if not game.pikafish_config or not game.pikafish_config.enabled or game.pikafish:
        return
    try:
        cfg = game.pikafish_config
        eval_engine_path = _resolved_eval_engine_path(cfg)
        eval_engine_path_display = _display_engine_path(cfg.engine_path, get_default_eval_pikafish_path())
        print(
            f"  [Pikafish] Starting evaluator: engine={eval_engine_path_display}, "
            f"mode={cfg.mode}, movetime={cfg.movetime}, depth={cfg.depth}, score_type={cfg.score_type}"
        )
        evaluator = PikafishEvaluator(
            engine_path=eval_engine_path,
            movetime=cfg.movetime if cfg.mode == "movetime" else None,
            depth=cfg.depth if cfg.mode == "depth" else None,
            score_type=cfg.score_type,
        )
        await evaluator.start()
        game.pikafish = evaluator
        await _start_eval_worker(game)
        await _queue_missing_evals(game)
    except Exception:
        pass


# --- Game loop ---

async def game_loop(game: GameSession):
    """Main game loop: alternates between players based on their type."""
    try:
        await _game_loop_inner(game)
    finally:
        if game.status == "finished" and game.pikafish:
            try:
                await game.eval_queue.join()
            except Exception:
                pass
        if game.status == "finished":
            game.broadcast("status", {"status": "finished"})
        if game.status == "finished" and game.move_history:
            try:
                write_game_log(game)
            except Exception:
                pass
        if game.status == "finished" and game.pikafish:
            await _stop_eval_worker(game)
            try:
                await game.pikafish.shutdown()
            except Exception:
                pass
            game.pikafish = None
        await _shutdown_player_engines(game)
        if game.status == "finished":
            asyncio.get_event_loop().call_later(
                300, lambda gid=game.id: games.pop(gid, None)
            )


async def _game_loop_inner(game: GameSession):
    game.status = "playing"
    game.broadcast("status", {"status": "playing"})

    move_number = len(game.move_history)

    while game.status == "playing":
        await game.pause_event.wait()
        if game.status != "playing":
            break

        side = game.board.turn
        side_name = "red" if side == 'w' else "black"
        config = game.red_config if side == 'w' else game.black_config

        game.broadcast("turn", {"side": side_name, "fen": game.board.to_fen()})

        # Start timer for this turn
        if game.timer_config and game.timer_config.enabled:
            game.timer_turn_start = time.time()
            _broadcast_timer(game)

        move_made = False
        latest_move_record = None

        try:
            move_iccs = None
            if config.type == "human":
                move_iccs = await _run_with_turn_timeout(
                    game, side, side_name, _wait_for_human_move(game, side_name)
                )

            elif config.type == "random":
                move_iccs = await _run_with_turn_timeout(
                    game, side, side_name, _choose_random_move(game, side_name)
                )

            elif config.type == "llm":
                move_iccs = await _run_with_turn_timeout(
                    game, side, side_name, _request_llm_move(game, side, side_name, config)
                )

            elif config.type == "pikafish":
                # Browser-side WASM Pikafish: server waits for the browser to
                # compute and submit the move via /human-move endpoint.
                move_iccs = await _run_with_turn_timeout(
                    game, side, side_name, _wait_for_human_move(game, side_name)
                )
                if game.status != "playing":
                    return
                if not move_iccs:
                    _finish_game(game, "black" if side == 'w' else "red", f"{side_name} Pikafish failed to return a move")
                    return

            if game.status != "playing":
                return

            if move_iccs:
                try:
                    result = game.board.make_move(move_iccs)
                except ValueError as e:
                    _finish_game(game, "black" if side == 'w' else "red", f"Invalid move by {side_name}: {e}")
                    return
                move_number += 1
                move_record = _build_move_record(move_number, side_name, result)
                game.move_history.append(move_record)
                game.broadcast("move", move_record)
                latest_move_record = move_record
                move_made = True

        except asyncio.CancelledError:
            raise
        except Exception as e:
            _finish_game(game, "black" if side == 'w' else "red", f"{side_name} exception: {str(e)[:200]}")
            return

        if not move_made:
            _finish_game(game, "black" if side == 'w' else "red", f"{side_name} failed to make a move")
            return

        # Update timer after move
        if game.timer_config and game.timer_config.enabled:
            elapsed = time.time() - game.timer_turn_start
            if side == 'w':
                game.timer_red -= elapsed
                if game.timer_red <= 0:
                    game.timer_red = 0
                    _broadcast_timer(game)
                    _finish_game(game, "black", f"{side_name} ran out of time (超时判负)")
                    return
                game.timer_red += game.timer_config.increment
            else:
                game.timer_black -= elapsed
                if game.timer_black <= 0:
                    game.timer_black = 0
                    _broadcast_timer(game)
                    _finish_game(game, "red", f"{side_name} ran out of time (超时判负)")
                    return
                game.timer_black += game.timer_config.increment
            _broadcast_timer(game)

        # Check game over
        is_over, winner, reason = game.board.is_game_over()
        if is_over:
            _finish_game(game, winner, reason)
            return

        if game.pikafish and latest_move_record:
            await _queue_pikafish_eval(game, latest_move_record["fen"], latest_move_record["number"])

        await asyncio.sleep(0.3)


# --- FastAPI app ---

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    for g in games.values():
        if g.task and not g.task.done():
            g.task.cancel()
        await _stop_eval_worker(g)
        if g.pikafish:
            try:
                await g.pikafish.shutdown()
            except Exception:
                pass
        await _shutdown_player_engines(g)


app = FastAPI(title="BattleChess", lifespan=lifespan)


# --- Cross-Origin headers for multi-threaded WASM (SharedArrayBuffer) ---

@app.middleware("http")
async def add_coop_coep_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    response.headers["Cross-Origin-Embedder-Policy"] = "require-corp"
    response.headers["Cross-Origin-Resource-Policy"] = "cross-origin"
    return response


# --- API endpoints ---

@app.get("/api/presets")
async def get_presets():
    """Return model presets from config.yaml (safe fields only, no keys exposed)."""
    presets = load_model_presets()
    return {
        "presets": [
            {
                "name": p["name"],
                "prompt_name": p.get("prompt_name", get_default_prompt_name()),
                "enable_thinking": p.get("enable_thinking", True),
                "max_completion_tokens": p.get("max_completion_tokens", 8192),
            }
            for p in presets
        ],
        "default_pikafish_path": get_default_player_pikafish_path(),
        "default_eval_pikafish_path": get_default_eval_pikafish_path(),
    }


@app.get("/api/prompts")
async def get_prompts():
    prompts = list_prompt_profiles()
    return {
        "default_prompt_name": get_default_prompt_name(),
        "prompts": [
            {
                "name": prompt["name"],
                "display_name": prompt.get("display_name", prompt["name"]),
                "description": prompt.get("description", ""),
            }
            for prompt in prompts
        ],
    }


def resolve_preset(config: PlayerConfig) -> PlayerConfig:
    """If config uses a preset name, fill in api_base/api_key/model from config.yaml."""
    if config.type != "llm" or not config.preset:
        return config
    presets = load_model_presets()
    for p in presets:
        if p["name"] == config.preset:
            return PlayerConfig(
                type="llm",
                preset=config.preset,
                api_base=p["api_base"],
                api_key=p["api_key"],
                model=p["model"],
                prompt_name=resolve_prompt_name(
                    config.prompt_name or p.get("prompt_name"),
                    config.prompt_lang,
                ),
                enable_thinking=(
                    config.enable_thinking
                    if config.enable_thinking is not None
                    else p.get("enable_thinking", True)
                ),
                max_completion_tokens=(
                    config.max_completion_tokens
                    or config.max_output_tokens
                    or p.get("max_completion_tokens")
                    or p.get("max_output_tokens", 8192)
                ),
            )
    raise HTTPException(400, f"Preset '{config.preset}' not found in config.yaml")


def _validate_player_type(config: PlayerConfig):
    if config.type not in {"human", "random", "llm", "pikafish"}:
        raise HTTPException(400, f"Unsupported player type: {config.type}")


def _validate_pikafish_player_config(config: PlayerConfig):
    if config.type != "pikafish":
        return
    if config.engine_mode and config.engine_mode not in {"movetime", "depth"}:
        raise HTTPException(400, f"Invalid Pikafish player mode: {config.engine_mode}")
    # Browser-side WASM: no local engine path required


def _resolved_eval_engine_path(config: PikafishConfig) -> str:
    return _normalize_engine_path(config.engine_path, DEFAULT_ENGINE_RELATIVE_PATH)


def _validate_eval_pikafish_config(config: PikafishConfig):
    if not config.enabled:
        return
    if config.mode not in {"movetime", "depth"}:
        raise HTTPException(400, f"Invalid evaluation Pikafish mode: {config.mode}")
    # Browser-side WASM: no local engine path required


@app.post("/api/game/create")
async def create_game(req: CreateGameRequest):
    try:
        test_board = Board(req.fen)
        test_board.to_fen()
    except Exception as e:
        raise HTTPException(400, f"Invalid FEN: {e}")

    red = resolve_preset(req.red)
    black = resolve_preset(req.black)
    _validate_player_type(red)
    _validate_player_type(black)
    _validate_prompt_config(red)
    _validate_prompt_config(black)
    _validate_pikafish_player_config(red)
    _validate_pikafish_player_config(black)
    _validate_eval_pikafish_config(req.pikafish)

    game_id = str(uuid.uuid4())[:8]
    game = GameSession(game_id, req.fen, red, black)
    game.pikafish_config = req.pikafish
    if req.timer.enabled:
        game.timer_config = req.timer
        game.timer_red = float(req.timer.initial_time)
        game.timer_black = float(req.timer.initial_time)
    games[game_id] = game
    return {"game_id": game_id, "fen": req.fen}


@app.get("/api/game/{game_id}/state")
async def get_game_state(game_id: str):
    game = games.get(game_id)
    if not game:
        raise HTTPException(404, "Game not found")
    return {
        "game_id": game.id,
        "fen": game.board.to_fen(),
        "turn": "red" if game.board.turn == 'w' else "black",
        "status": game.status,
        "winner": game.winner,
        "reason": game.reason,
        "move_history": game.move_history,
    }


@app.post("/api/game/{game_id}/start")
async def start_game(game_id: str):
    game = games.get(game_id)
    if not game:
        raise HTTPException(404, "Game not found")
    if game.status == "playing":
        raise HTTPException(400, "Game already playing")
    if game.status == "finished":
        raise HTTPException(400, "Game already finished, create a new one")

    game.task = asyncio.create_task(game_loop(game))
    # Server-side eval engine disabled - eval runs in browser via WASM.
    # await _start_eval_engine(game)

    return {"status": "started"}


@app.post("/api/game/{game_id}/pause")
async def pause_game(game_id: str):
    game = games.get(game_id)
    if not game:
        raise HTTPException(404, "Game not found")
    if game.status != "playing":
        raise HTTPException(400, "Game is not playing")
    game.pause_event.clear()
    game.status = "paused"
    if game.task and not game.task.done():
        game.task.cancel()
        try:
            await game.task
        except asyncio.CancelledError:
            pass
    game.task = None
    game.broadcast("status", {"status": "paused"})
    return {"status": "paused"}


@app.post("/api/game/{game_id}/resume")
async def resume_game(game_id: str):
    game = games.get(game_id)
    if not game:
        raise HTTPException(404, "Game not found")
    if game.status != "paused":
        raise HTTPException(400, "Game is not paused")
    game.status = "playing"
    game.pause_event.set()
    if not game.task or game.task.done():
        game.task = asyncio.create_task(game_loop(game))
    # Server-side eval engine disabled - eval runs in browser via WASM.
    # await _start_eval_engine(game)
    await _queue_missing_evals(game)
    return {"status": "resumed"}


@app.post("/api/game/{game_id}/seek")
async def seek_game(game_id: str, req: SeekGameRequest):
    game = games.get(game_id)
    if not game:
        raise HTTPException(404, "Game not found")
    if game.status != "paused":
        raise HTTPException(400, "Game must be paused before seeking")

    target_ply = req.ply
    if target_ply < 0 or target_ply > len(game.move_history):
        raise HTTPException(400, f"Invalid ply: {target_ply}")

    board = Board(game.initial_fen)
    kept_history = [dict(m) for m in game.move_history[:target_ply]]
    for move_record in kept_history:
        try:
            board.make_move(move_record["move"])
        except ValueError as e:
            raise HTTPException(500, f"Failed to replay move history: {e}")

    game.board = board
    game.move_history = kept_history
    game.winner = None
    game.reason = None
    game.events = []
    game.next_event_id = 1
    game.human_move = None
    game.human_move_event = asyncio.Event()
    await _stop_eval_worker(game)

    # Stop any ongoing Pikafish analysis
    if game.pikafish:
        try:
            await game.pikafish.stop_analysis()
        except Exception:
            pass
        await _start_eval_worker(game)
        await _queue_missing_evals(game)

    response = {
        "status": "seeked",
        "ply": target_ply,
        "fen": game.board.to_fen(),
        "turn": "red" if game.board.turn == 'w' else "black",
        "move_history": game.move_history,
    }
    game.broadcast("seek", response)
    return response


@app.post("/api/game/{game_id}/reset")
async def reset_game(game_id: str):
    game = games.get(game_id)
    if not game:
        raise HTTPException(404, "Game not found")
    if game.task and not game.task.done():
        game.task.cancel()
    await _stop_eval_worker(game)
    if game.pikafish:
        try:
            await game.pikafish.shutdown()
        except Exception:
            pass
        game.pikafish = None
    await _shutdown_player_engines(game)
    game.board = Board(game.initial_fen)
    game.status = "waiting"
    game.winner = None
    game.reason = None
    game.move_history.clear()
    game.events.clear()
    game.next_event_id = 1
    game.pause_event.set()
    game.human_move_event.set()  # Unblock any waiting human move
    game.broadcast("status", {"status": "reset"})
    del games[game_id]
    return {"status": "reset"}


@app.post("/api/game/{game_id}/human-move")
async def human_move(game_id: str, req: HumanMoveRequest):
    game = games.get(game_id)
    if not game:
        raise HTTPException(404, "Game not found")
    if game.status != "playing":
        raise HTTPException(400, "Game is not playing")

    # Validate the move
    move = req.move.strip().lower()
    if not game.board.is_valid_move(move):
        raise HTTPException(400, f"Illegal move: {move}")

    game.human_move = move
    game.human_move_event.set()
    return {"status": "ok", "move": move}


@app.get("/api/game/{game_id}/legal-moves")
async def get_legal_moves(game_id: str, col: int = Query(...), row: int = Query(...)):
    game = games.get(game_id)
    if not game:
        raise HTTPException(404, "Game not found")

    # Get all legal moves and filter to those starting from (col, row)
    all_moves = game.board.get_legal_moves()
    prefix = f"{chr(col + ord('a'))}{row}"
    matching = [m for m in all_moves if m[:2] == prefix]
    return {"moves": matching}


@app.get("/api/game/{game_id}/stream")
async def stream_events(game_id: str, request: Request):
    game = games.get(game_id)
    if not game:
        raise HTTPException(404, "Game not found")

    queue = asyncio.Queue()
    game.event_queues.append(queue)
    last_event_id_header = request.headers.get("last-event-id") or request.headers.get("Last-Event-ID")
    try:
        last_event_id = int(last_event_id_header) if last_event_id_header else 0
    except ValueError:
        last_event_id = 0

    def _format_sse_event(event: dict) -> str:
        return (
            f"id: {event.get('event_id', 0)}\n"
            f"event: {event['type']}\n"
            f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        )

    async def event_generator():
        try:
            for event in game.events:
                if event.get("event_id", 0) > last_event_id:
                    yield _format_sse_event(event)
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=30)
                    yield _format_sse_event(event)
                except asyncio.TimeoutError:
                    yield f"event: ping\ndata: {{}}\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            if queue in game.event_queues:
                game.event_queues.remove(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# --- Game log history APIs ---

@app.get("/api/games")
async def list_active_games():
    """List all active game sessions (not yet cleaned up)."""
    result = []
    for gid, g in games.items():
        result.append({
            "id": gid,
            "status": g.status,
            "red_label": _player_label(g.red_config),
            "black_label": _player_label(g.black_config),
            "move_count": len(g.move_history),
            "winner": g.winner,
            "reason": g.reason,
        })
    return {"games": result}

@app.get("/api/logs")
async def list_game_logs():
    """List all game log files with metadata (no moves)."""
    logs = []
    try:
        for fname in os.listdir(LOG_DIR):
            if not fname.endswith(".log"):
                continue
            fpath = os.path.join(LOG_DIR, fname)
            if not os.path.isfile(fpath):
                continue
            try:
                entry = parse_game_log(fpath, include_moves=False)
                logs.append(entry)
            except Exception:
                continue
    except FileNotFoundError:
        pass
    logs.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    return {"logs": logs}


@app.get("/api/logs/{filename}")
async def get_game_log(filename: str):
    """Parse and return a single game log with all moves and FENs."""
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    fpath = os.path.join(LOG_DIR, filename)
    if not os.path.isfile(fpath):
        raise HTTPException(status_code=404, detail="Log not found")
    try:
        return parse_game_log(fpath, include_moves=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/validate-fen")
async def validate_fen(body: dict):
    fen = body.get("fen", "")
    try:
        board = Board(fen)
        return {"valid": True, "board_text": board.to_text(), "fen": board.to_fen()}
    except Exception as e:
        return {"valid": False, "error": str(e)}


# --- Static files ---

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
async def index():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))


@app.get("/leaderboard")
async def leaderboard():
    return FileResponse(os.path.join(STATIC_DIR, "leaderboard.html"))


if __name__ == "__main__":
    import socket
    import uvicorn

    host, port = "127.0.0.1", 8000

    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.bind((host, port))
        sock.close()
    except OSError:
        print(f"\n  [ERROR] Port {port} is already in use.")
        print(f"  Please close the other process or use a different port.\n")
        exit(1)

    print("\n  BattleChess - Xiangqi Arena")
    print("  ================================")
    print(f"  http://localhost:{port}")
    print("  Press Ctrl+C to stop\n")
    uvicorn.run(app, host=host, port=port)

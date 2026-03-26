"""
FastAPI backend for BattleChess - LLM Xiangqi Arena.
Manages game sessions, proxies LLM interactions, serves frontend.
Supports human, random, and LLM player types.
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

from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from xiangqi import Board
from llm_client import LLMPlayer
from prompt_registry import get_default_prompt_name, get_prompt_profile, list_prompt_profiles, resolve_prompt_name

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
CONFIG_PATH = os.path.join(BASE_DIR, "config.yaml")
LOG_DIR = os.path.join(BASE_DIR, "logs")
os.makedirs(LOG_DIR, exist_ok=True)


# --- Config loading ---

def load_model_presets() -> list[dict]:
    """Load model presets from config.yaml."""
    if not os.path.exists(CONFIG_PATH):
        return []
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
        if not data or "models" not in data:
            return []
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


# --- Models ---

def _player_label(config) -> str:
    """Human-readable label for a player config (no API keys)."""
    if config.type == "human":
        return "Human"
    elif config.type == "random":
        return "Random"
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
            lines.append(f"  [{side}] move: #{event.get('number')} {event.get('move', '')}{captured}")
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
    lines.append(f"Result: {game.winner} wins - {game.reason}")
    lines.append(f"Moves ({len(game.move_history)}):")
    for m in game.move_history:
        captured = f" x{m['captured']}" if m.get('captured') else ""
        lines.append(f"  #{m['number']} {m['side']}: {m['move']}{captured}")
    lines.append(f"Final FEN: {game.board.to_fen()}")
    lines.append("")
    _append_event_log(lines, game.events)
    lines.append("")

    filename = f"red-{red_filename}_vs_black-{black_filename}_{ts_filename}_{game.id}.log"
    log_path = os.path.join(LOG_DIR, filename)
    with open(log_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


class PlayerConfig(BaseModel):
    type: str = "human"  # human | random | llm
    preset: Optional[str] = None
    api_base: Optional[str] = None
    api_key: Optional[str] = None
    model: Optional[str] = None
    prompt_name: Optional[str] = None
    prompt_lang: Optional[str] = None  # legacy fallback
    enable_thinking: Optional[bool] = None
    max_completion_tokens: Optional[int] = None
    max_output_tokens: Optional[int] = None


def _resolved_max_completion_tokens(config: PlayerConfig) -> int:
    return config.max_completion_tokens or config.max_output_tokens or 8192


def _resolved_prompt_name(config: PlayerConfig) -> str:
    return resolve_prompt_name(config.prompt_name, config.prompt_lang)


def _validate_prompt_config(config: PlayerConfig):
    if config.type != "llm":
        return
    try:
        get_prompt_profile(_resolved_prompt_name(config))
    except ValueError as e:
        raise HTTPException(400, str(e))


class CreateGameRequest(BaseModel):
    fen: str = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w"
    red: PlayerConfig
    black: PlayerConfig


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
        self.task: Optional[asyncio.Task] = None
        self.pause_event = asyncio.Event()
        self.pause_event.set()
        # For human move input
        self.human_move_event = asyncio.Event()
        self.human_move: Optional[str] = None

    def broadcast(self, event_type: str, data: dict):
        event = {"type": event_type, **data}
        self.events.append(event)
        for q in self.event_queues:
            q.put_nowait(event)


# --- Global state ---

games: dict[str, GameSession] = {}


# --- Game loop ---

async def game_loop(game: GameSession):
    """Main game loop: alternates between players based on their type."""
    try:
        await _game_loop_inner(game)
    finally:
        if game.status == "finished" and game.move_history:
            try:
                write_game_log(game)
            except Exception:
                pass


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

        move_made = False

        try:
            if config.type == "human":
                # Wait for human input
                game.human_move_event.clear()
                game.human_move = None
                game.broadcast("waiting_human", {"side": side_name})

                # Wait with periodic check for game status changes
                while not game.human_move_event.is_set():
                    try:
                        await asyncio.wait_for(game.human_move_event.wait(), timeout=1.0)
                    except asyncio.TimeoutError:
                        if game.status != "playing":
                            return
                        continue

                if game.status != "playing":
                    return

                move_iccs = game.human_move
                if move_iccs:
                    result = game.board.make_move(move_iccs)
                    move_number += 1
                    move_record = {
                        "number": move_number,
                        "side": side_name,
                        "move": move_iccs,
                        "piece": result["piece"],
                        "captured": result["captured"],
                        "fen": result["fen_after"],
                        "timestamp": time.time(),
                    }
                    game.move_history.append(move_record)
                    game.broadcast("move", move_record)
                    move_made = True

            elif config.type == "random":
                # Random move from legal moves
                await asyncio.sleep(0.3)  # Small delay for visual effect
                legal_moves = game.board.get_legal_moves()
                if legal_moves:
                    move_iccs = random.choice(legal_moves)
                    game.broadcast("thinking", {"side": side_name, "content": f"Random move: {move_iccs}"})
                    result = game.board.make_move(move_iccs)
                    move_number += 1
                    move_record = {
                        "number": move_number,
                        "side": side_name,
                        "move": move_iccs,
                        "piece": result["piece"],
                        "captured": result["captured"],
                        "fen": result["fen_after"],
                        "timestamp": time.time(),
                    }
                    game.move_history.append(move_record)
                    game.broadcast("move", move_record)
                    move_made = True

            elif config.type == "llm":
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
                        return

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
                        move_iccs = event["move"]
                        try:
                            result = game.board.make_move(move_iccs)
                            move_number += 1
                            move_record = {
                                "number": move_number,
                                "side": side_name,
                                "move": move_iccs,
                                "piece": result["piece"],
                                "captured": result["captured"],
                                "fen": result["fen_after"],
                                "timestamp": time.time(),
                            }
                            game.move_history.append(move_record)
                            game.broadcast("move", move_record)
                            move_made = True
                        except ValueError as e:
                            game.status = "finished"
                            game.winner = "black" if side == 'w' else "red"
                            game.reason = f"Invalid move by {side_name}: {e}"
                            game.broadcast("game_over", {"winner": game.winner, "reason": game.reason})
                            return
                    elif event["type"] == "error":
                        game.status = "finished"
                        game.winner = "black" if side == 'w' else "red"
                        game.reason = f"{side_name} error: {event['message']}"
                        game.broadcast("game_over", {"winner": game.winner, "reason": game.reason})
                        return

        except Exception as e:
            game.status = "finished"
            game.winner = "black" if side == 'w' else "red"
            game.reason = f"{side_name} exception: {str(e)[:200]}"
            game.broadcast("game_over", {"winner": game.winner, "reason": game.reason})
            return

        if not move_made:
            game.status = "finished"
            game.winner = "black" if side == 'w' else "red"
            game.reason = f"{side_name} failed to make a move"
            game.broadcast("game_over", {"winner": game.winner, "reason": game.reason})
            return

        # Check game over
        is_over, reason = game.board.is_game_over()
        if is_over:
            game.status = "finished"
            game.winner = "red" if "red" in reason else "black"
            game.reason = reason
            game.broadcast("game_over", {"winner": game.winner, "reason": game.reason})
            return

        await asyncio.sleep(0.3)


# --- FastAPI app ---

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    for g in games.values():
        if g.task and not g.task.done():
            g.task.cancel()


app = FastAPI(title="BattleChess", lifespan=lifespan)


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
        ]
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


@app.post("/api/game/create")
async def create_game(req: CreateGameRequest):
    try:
        test_board = Board(req.fen)
        test_board.to_fen()
    except Exception as e:
        raise HTTPException(400, f"Invalid FEN: {e}")

    red = resolve_preset(req.red)
    black = resolve_preset(req.black)
    _validate_prompt_config(red)
    _validate_prompt_config(black)

    game_id = str(uuid.uuid4())[:8]
    game = GameSession(game_id, req.fen, red, black)
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
    game.human_move = None
    game.human_move_event = asyncio.Event()

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
    game.board = Board(game.initial_fen)
    game.status = "waiting"
    game.winner = None
    game.reason = None
    game.move_history.clear()
    game.events.clear()
    game.pause_event.set()
    game.human_move_event.set()  # Unblock any waiting human move
    game.broadcast("status", {"status": "reset"})
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
async def stream_events(game_id: str):
    game = games.get(game_id)
    if not game:
        raise HTTPException(404, "Game not found")

    queue = asyncio.Queue()
    game.event_queues.append(queue)

    async def event_generator():
        try:
            for event in game.events:
                yield f"event: {event['type']}\ndata: {json.dumps(event, ensure_ascii=False)}\n\n"
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=30)
                    yield f"event: {event['type']}\ndata: {json.dumps(event, ensure_ascii=False)}\n\n"
                    if event.get("type") == "game_over":
                        break
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

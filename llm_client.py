"""
LLM client with OpenAI SDK for Xiangqi.
Supports OpenAI-compatible endpoints via configurable base_url.
"""

import json
import re

from openai import APIConnectionError, APIStatusError, AsyncOpenAI

from prompt_registry import get_prompt_profile
from xiangqi import Board, PIECE_NAMES_ZH


TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "make_move",
            "description": "Submit your chosen move. The move must be a legal move in ICCS format (4 characters: source_col source_row dest_col dest_row, e.g., h2e2).",
            "parameters": {
                "type": "object",
                "properties": {
                    "move": {
                        "type": "string",
                        "description": "The move in ICCS format, e.g., 'h2e2', 'b0c2'",
                    }
                },
                "required": ["move"],
            },
        },
    }
]


ICCS_PATTERN = re.compile(r"[a-i][0-9][a-i][0-9]")


def _get_piece_positions(board: Board) -> str:
    """Return piece positions grouped by side."""
    red_pieces = []
    black_pieces = []

    for row in range(10):
        for col in range(9):
            piece = board.get_piece(col, row)
            if not piece:
                continue
            coord = f"{chr(col + ord('a'))}{row}"
            zh = PIECE_NAMES_ZH.get(piece, piece)
            entry = f"{coord}: {piece} ({zh})"
            if piece.isupper():
                red_pieces.append(entry)
            else:
                black_pieces.append(entry)

    return "\n".join([
        "Red: " + ", ".join(red_pieces),
        "Black: " + ", ".join(black_pieces),
    ])


def _get_last_opponent_move(board: Board) -> str:
    if not board.move_history:
        return ""
    return board.move_history[-1].get("move", "")


def _build_prompt_params(board: Board, side: str, prompt_name: str | None = None) -> tuple[dict, dict]:
    side_name = "Red" if side == "w" else "Black"
    side_name_zh = "红方" if side == "w" else "黑方"
    legal_moves = board.get_legal_moves()
    prompt_profile = get_prompt_profile(prompt_name)
    legal_moves_text = ", ".join(legal_moves) if legal_moves else prompt_profile.get("empty_legal_moves_text", "(none)")

    params = dict(
        side_name=side_name,
        side_name_zh=side_name_zh,
        fen=board.to_fen(),
        last_opponent_move=_get_last_opponent_move(board),
        piece_positions=_get_piece_positions(board),
        legal_moves=legal_moves_text,
        legal_move_count=len(legal_moves),
    )
    return prompt_profile, params


def build_system_prompt(board: Board, side: str, prompt_name: str | None = None) -> str:
    prompt_profile, params = _build_prompt_params(board, side, prompt_name)
    return prompt_profile["system_prompt"].format(**params)


def _turn_prompt(board: Board, side: str, prompt_name: str | None = None) -> str:
    prompt_profile, params = _build_prompt_params(board, side, prompt_name)
    return prompt_profile["turn_prompt"].format(**params)


def _tool_retry_prompt(board: Board, side: str, prompt_name: str | None = None) -> str:
    prompt_profile, params = _build_prompt_params(board, side, prompt_name)
    return prompt_profile["tool_retry_prompt"].format(**params)


def _supports_thinking_control(api_base: str, model: str) -> bool:
    api_base_lower = (api_base or "").lower()
    model_lower = (model or "").lower()
    return "xf-yun.com" in api_base_lower or model_lower.startswith("spark")


def _extra_body_for_provider(api_base: str, model: str, enable_thinking: bool) -> dict | None:
    if _supports_thinking_control(api_base, model):
        return {"thinking": {"type": "enabled" if enable_thinking else "disabled"}}
    return None


def execute_tool(board: Board, tool_name: str, args: dict) -> str:
    """Execute a tool call against the board and return the result string."""
    if tool_name == "make_move":
        move = args.get("move", "").strip().lower()
        if not ICCS_PATTERN.fullmatch(move):
            return f"Invalid move format: '{move}'. Must be 4 characters in ICCS format (e.g., h2e2)."
        if not board.is_valid_move(move):
            legal = board.get_legal_moves()
            suffix = "..." if len(legal) > 20 else ""
            return f"Illegal move: '{move}'. Legal moves are: {', '.join(legal[:20])}{suffix}"
        return f"OK: Move {move} is valid and will be played."

    return f"Unknown tool: {tool_name}"


class LLMPlayer:
    """OpenAI SDK based LLM player with streaming tool calling support."""

    def __init__(
        self,
        api_base: str,
        api_key: str,
        model: str,
        timeout: float = 120.0,
        max_tool_rounds: int = 10,
        prompt_name: str = "zh",
        enable_thinking: bool = True,
        max_completion_tokens: int = 8192,
    ):
        self.api_base = api_base.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.timeout = timeout
        self.max_tool_rounds = max_tool_rounds
        self.prompt_name = prompt_name
        self.enable_thinking = enable_thinking
        self.max_completion_tokens = max_completion_tokens

    async def _call_api_stream(self, messages: list, use_tools: bool = True):
        """
        Streaming API call through the OpenAI SDK.
        Yields (event_type, data) tuples:
          ("content_delta", str)
          ("content_done", str)
          ("tool_calls_done", list)
          ("finish_reason", str)
        """
        request_args = {
            "model": self.model,
            "messages": messages,
            "stream": True,
            "max_completion_tokens": self.max_completion_tokens,
        }
        if use_tools:
            request_args["tools"] = TOOL_DEFINITIONS
            request_args["tool_choice"] = "auto"

        extra_body = _extra_body_for_provider(self.api_base, self.model, self.enable_thinking)
        if extra_body:
            request_args["extra_body"] = extra_body

        accumulated_content = ""
        tool_calls_acc = {}
        finish_reason = None

        async with AsyncOpenAI(
            api_key=self.api_key,
            base_url=self.api_base,
            timeout=self.timeout,
        ) as client:
            stream = await client.chat.completions.create(**request_args)
            async for chunk in stream:
                choices = getattr(chunk, "choices", None) or []
                if not choices:
                    continue

                choice = choices[0]
                delta = getattr(choice, "delta", None)
                if not delta:
                    continue

                fr = getattr(choice, "finish_reason", None)
                if fr:
                    finish_reason = fr

                model_extra = getattr(delta, "model_extra", None) or {}
                reasoning_piece = getattr(delta, "reasoning_content", None) or model_extra.get("reasoning_content")
                if reasoning_piece:
                    yield ("reasoning_delta", reasoning_piece)

                content_piece = getattr(delta, "content", None)
                if content_piece:
                    accumulated_content += content_piece
                    yield ("content_delta", content_piece)

                tc_deltas = getattr(delta, "tool_calls", None) or []
                for tcd in tc_deltas:
                    idx = getattr(tcd, "index", 0) or 0
                    if idx not in tool_calls_acc:
                        tool_calls_acc[idx] = {
                            "id": getattr(tcd, "id", None) or f"call_{idx}",
                            "name": "",
                            "arguments": "",
                        }

                    tc_id = getattr(tcd, "id", None)
                    if tc_id:
                        tool_calls_acc[idx]["id"] = tc_id

                    func = getattr(tcd, "function", None)
                    if func and getattr(func, "name", None):
                        tool_calls_acc[idx]["name"] += func.name
                    if func and getattr(func, "arguments", None):
                        tool_calls_acc[idx]["arguments"] += func.arguments

        if accumulated_content:
            yield ("content_done", accumulated_content)

        if tool_calls_acc:
            tc_list = []
            for idx in sorted(tool_calls_acc.keys()):
                tc = tool_calls_acc[idx]
                tc_list.append(
                    {
                        "id": tc["id"],
                        "type": "function",
                        "function": {
                            "name": tc["name"],
                            "arguments": tc["arguments"],
                        },
                    }
                )
            yield ("tool_calls_done", tc_list)

        yield ("finish_reason", finish_reason or "stop")

    async def request_move(self, board: Board, side: str):
        """
        Async generator that yields events as the LLM interaction proceeds.
        Events: {type: "thinking"|"tool_call"|"tool_result"|"move"|"error", ...}
        """
        system_prompt = build_system_prompt(board, side, self.prompt_name)
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": _turn_prompt(board, side, self.prompt_name)},
        ]

        for round_num in range(self.max_tool_rounds):
            accumulated_content = ""
            tool_calls = None
            finish_reason = "stop"

            try:
                async for event_type, data in self._call_api_stream(messages):
                    if event_type == "reasoning_delta":
                        yield {"type": "reasoning", "content": data}
                    elif event_type == "content_delta":
                        yield {"type": "thinking", "content": data}
                    elif event_type == "content_done":
                        accumulated_content = data
                    elif event_type == "tool_calls_done":
                        tool_calls = data
                    elif event_type == "finish_reason":
                        finish_reason = data
            except APIStatusError as e:
                yield {
                    "type": "error",
                    "message": f"API HTTP error: {e.status_code} - {str(e)[:200]}",
                }
                return
            except APIConnectionError as e:
                yield {"type": "error", "message": f"API connection error: {str(e)[:200]}"}
                return
            except Exception as e:
                yield {"type": "error", "message": f"API error: {str(e)[:200]}"}
                return

            assistant_msg = {"role": "assistant"}
            if accumulated_content:
                assistant_msg["content"] = accumulated_content
            if tool_calls:
                assistant_msg["tool_calls"] = tool_calls

            if tool_calls:
                messages.append(assistant_msg)

                for tc in tool_calls:
                    func = tc.get("function", {})
                    tool_name = func.get("name", "")
                    try:
                        tool_args = json.loads(func.get("arguments", "{}"))
                    except json.JSONDecodeError:
                        tool_args = {}

                    tc_id = tc.get("id", f"call_{round_num}")
                    yield {"type": "tool_call", "name": tool_name, "args": tool_args}

                    tool_result = execute_tool(board, tool_name, tool_args)
                    yield {"type": "tool_result", "name": tool_name, "result": tool_result}

                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": tc_id,
                            "content": tool_result,
                        }
                    )

                    if tool_name == "make_move" and tool_result.startswith("OK:"):
                        move = tool_args.get("move", "").strip().lower()
                        yield {"type": "move", "move": move}
                        return

                continue

            if accumulated_content:
                move = self._extract_move_from_text(accumulated_content, board)
                if move:
                    yield {"type": "move", "move": move}
                    return

            if finish_reason == "stop":
                messages.append(assistant_msg)
                messages.append(
                    {
                        "role": "user",
                        "content": _tool_retry_prompt(board, side, self.prompt_name),
                    }
                )
                continue

        yield {"type": "error", "message": f"Failed to get a valid move after {self.max_tool_rounds} rounds."}

    def _extract_move_from_text(self, text: str, board: Board):
        """Fallback: try to extract an ICCS move from raw text."""
        for move in ICCS_PATTERN.findall(text):
            if board.is_valid_move(move):
                return move
        return None

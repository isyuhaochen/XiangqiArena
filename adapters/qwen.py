"""Adapter for Qwen / DashScope models."""

from .base import BaseAdapter


class QwenAdapter(BaseAdapter):
    def extra_body(self, enable_thinking: bool) -> dict | None:
        return {"enable_thinking": enable_thinking}

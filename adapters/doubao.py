"""Adapter for Doubao / Volcengine Ark models."""

from .base import BaseAdapter


class DoubaoAdapter(BaseAdapter):
    def extra_body(self, enable_thinking: bool) -> dict | None:
        return {"thinking": {"type": "enabled" if enable_thinking else "disabled"}}

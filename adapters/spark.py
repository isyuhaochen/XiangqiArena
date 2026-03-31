"""Adapter for Spark / XF-Yun models."""

from .base import BaseAdapter


class SparkAdapter(BaseAdapter):
    def extra_body(self, enable_thinking: bool) -> dict | None:
        return {"thinking": {"type": "enabled" if enable_thinking else "disabled"}}

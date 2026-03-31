"""Adapter for OpenRouter models."""

from .base import BaseAdapter


class OpenRouterAdapter(BaseAdapter):
    def extract_reasoning(self, delta) -> str | None:
        # OpenRouter may put reasoning in delta.reasoning
        reasoning = getattr(delta, "reasoning", None)
        if reasoning:
            return reasoning
        return super().extract_reasoning(delta)

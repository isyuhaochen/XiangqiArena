"""Model adapter registry. Maps (api_base, model) to the appropriate adapter."""

from .base import BaseAdapter
from .default import DefaultAdapter
from .doubao import DoubaoAdapter
from .gemini import GeminiAdapter
from .openrouter import OpenRouterAdapter
from .qwen import QwenAdapter
from .spark import SparkAdapter

_REGISTRY: list[tuple[callable, type[BaseAdapter]]] = [
    (lambda api, model: "xf-yun.com" in api, SparkAdapter),
    (lambda api, model: model.startswith("spark"), SparkAdapter),
    (lambda api, model: "volces.com" in api, DoubaoAdapter),
    (lambda api, model: model.startswith("doubao"), DoubaoAdapter),
    (lambda api, model: "dashscope" in api, QwenAdapter),
    (lambda api, model: "openrouter.ai" in api, OpenRouterAdapter),
    (lambda api, model: model.startswith("gemini"), GeminiAdapter),
]


def get_adapter(api_base: str, model: str) -> BaseAdapter:
    """Return the appropriate adapter for a given (api_base, model) pair."""
    api_lower = (api_base or "").lower()
    model_lower = (model or "").lower()
    for predicate, adapter_cls in _REGISTRY:
        if predicate(api_lower, model_lower):
            return adapter_cls()
    return DefaultAdapter()

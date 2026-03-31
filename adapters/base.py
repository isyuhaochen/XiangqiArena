"""Base adapter for OpenAI-compatible model providers."""


class BaseAdapter:
    """Thin adapter for provider-specific API differences.
    Override only what differs from the OpenAI-compatible default."""

    def extra_body(self, enable_thinking: bool) -> dict | None:
        """Return extra_body dict for the API request, or None."""
        return None

    def extract_reasoning(self, delta) -> str | None:
        """Extract reasoning/thinking content from a streaming delta chunk."""
        reasoning = getattr(delta, "reasoning_content", None)
        if reasoning:
            return reasoning
        model_extra = getattr(delta, "model_extra", None) or {}
        return model_extra.get("reasoning_content")

    def patch_request_args(self, request_args: dict) -> dict:
        """Modify request_args before sending. Default: no changes."""
        return request_args

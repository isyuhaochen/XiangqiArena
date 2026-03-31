"""Tests for all model adapters — registry matching, think/no-think modes, reasoning extraction."""

import sys
import os
import unittest
from types import SimpleNamespace

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from adapters import get_adapter
from adapters.base import BaseAdapter
from adapters.default import DefaultAdapter
from adapters.doubao import DoubaoAdapter
from adapters.gemini import GeminiAdapter
from adapters.openrouter import OpenRouterAdapter
from adapters.qwen import QwenAdapter
from adapters.spark import SparkAdapter


# ---------------------------------------------------------------------------
# Registry matching
# ---------------------------------------------------------------------------
class TestAdapterRegistry(unittest.TestCase):
    """get_adapter should return the correct adapter for each provider."""

    # (api_base, model, expected_class)
    CASES = [
        # Spark — match by api_base
        ("https://spark-api-open.xf-yun.com/x2/", "spark-x", SparkAdapter),
        # Spark — match by model prefix
        ("https://other.com/v1", "spark-lite", SparkAdapter),
        # Doubao — match by api_base
        ("https://ark.cn-beijing.volces.com/api/v3/", "doubao-seed-1-6-thinking-250715", DoubaoAdapter),
        # Doubao — match by model prefix
        ("https://other.com/v1", "doubao-pro", DoubaoAdapter),
        # Qwen — match by api_base
        ("https://dashscope.aliyuncs.com/compatible-mode/v1", "qwen3-max-2026-01-23", QwenAdapter),
        # Qwen on non-DashScope host falls back to default
        ("http://localhost:11434/v1", "qwen2.5:7b", DefaultAdapter),
        # Qwen on OpenRouter should NOT match QwenAdapter
        ("https://openrouter.ai/api/v1/", "qwen/qwen3.6-plus-preview:free", OpenRouterAdapter),
        # OpenRouter — match by api_base
        ("https://openrouter.ai/api/v1/", "meta-llama/llama-3", OpenRouterAdapter),
        # Gemini — match by model prefix
        ("http://104.238.222.71:3006/v1", "gemini-3-pro-preview", GeminiAdapter),
        ("https://other.com/v1", "gemini-2.5-flash", GeminiAdapter),
        # Default — unknown provider
        ("https://api.openai.com/v1", "gpt-4o", DefaultAdapter),
        ("http://localhost:11434/v1", "llama3:8b", DefaultAdapter),
    ]

    def test_registry_matching(self):
        for api_base, model, expected_cls in self.CASES:
            with self.subTest(api_base=api_base, model=model):
                adapter = get_adapter(api_base, model)
                self.assertIsInstance(
                    adapter, expected_cls,
                    f"({api_base}, {model}) => {type(adapter).__name__}, expected {expected_cls.__name__}",
                )

    def test_empty_inputs_return_default(self):
        self.assertIsInstance(get_adapter("", ""), DefaultAdapter)
        self.assertIsInstance(get_adapter(None, None), DefaultAdapter)


# ---------------------------------------------------------------------------
# extra_body: think mode ON / OFF
# ---------------------------------------------------------------------------
class TestExtraBodyThinkMode(unittest.TestCase):
    """Each adapter returns correct extra_body for enable_thinking True/False."""

    def test_spark_think_on(self):
        body = SparkAdapter().extra_body(True)
        self.assertEqual(body, {"thinking": {"type": "enabled"}})

    def test_spark_think_off(self):
        body = SparkAdapter().extra_body(False)
        self.assertEqual(body, {"thinking": {"type": "disabled"}})

    def test_doubao_think_on(self):
        body = DoubaoAdapter().extra_body(True)
        self.assertEqual(body, {"thinking": {"type": "enabled"}})

    def test_doubao_think_off(self):
        body = DoubaoAdapter().extra_body(False)
        self.assertEqual(body, {"thinking": {"type": "disabled"}})

    def test_qwen_think_on(self):
        body = QwenAdapter().extra_body(True)
        self.assertEqual(body, {"enable_thinking": True})

    def test_qwen_think_off(self):
        body = QwenAdapter().extra_body(False)
        self.assertEqual(body, {"enable_thinking": False})

    def test_gemini_think_on(self):
        body = GeminiAdapter().extra_body(True)
        self.assertIsNone(body)

    def test_gemini_think_off(self):
        body = GeminiAdapter().extra_body(False)
        self.assertIsNone(body)

    def test_openrouter_think_on(self):
        body = OpenRouterAdapter().extra_body(True)
        self.assertIsNone(body)

    def test_openrouter_think_off(self):
        body = OpenRouterAdapter().extra_body(False)
        self.assertIsNone(body)

    def test_default_think_on(self):
        body = DefaultAdapter().extra_body(True)
        self.assertIsNone(body)

    def test_default_think_off(self):
        body = DefaultAdapter().extra_body(False)
        self.assertIsNone(body)


# ---------------------------------------------------------------------------
# extract_reasoning: different delta formats
# ---------------------------------------------------------------------------
def _make_delta(**kwargs):
    """Build a fake streaming delta object."""
    model_extra = kwargs.pop("model_extra", None)
    delta = SimpleNamespace(**kwargs)
    if model_extra is not None:
        delta.model_extra = model_extra
    return delta


class TestExtractReasoning(unittest.TestCase):

    # -- Base / Default --
    def test_base_reasoning_content_attr(self):
        delta = _make_delta(reasoning_content="thinking hard")
        self.assertEqual(BaseAdapter().extract_reasoning(delta), "thinking hard")

    def test_base_reasoning_content_model_extra(self):
        delta = _make_delta(model_extra={"reasoning_content": "deep thought"})
        self.assertEqual(BaseAdapter().extract_reasoning(delta), "deep thought")

    def test_base_no_reasoning(self):
        delta = _make_delta(content="hello")
        self.assertIsNone(BaseAdapter().extract_reasoning(delta))

    # -- Spark --
    def test_spark_reasoning(self):
        delta = _make_delta(reasoning_content="spark thinks")
        self.assertEqual(SparkAdapter().extract_reasoning(delta), "spark thinks")

    # -- Doubao --
    def test_doubao_reasoning(self):
        delta = _make_delta(reasoning_content="doubao thinks")
        self.assertEqual(DoubaoAdapter().extract_reasoning(delta), "doubao thinks")

    # -- Qwen --
    def test_qwen_reasoning(self):
        delta = _make_delta(reasoning_content="qwen thinks")
        self.assertEqual(QwenAdapter().extract_reasoning(delta), "qwen thinks")

    # -- Gemini: same as base --
    def test_gemini_reasoning(self):
        delta = _make_delta(reasoning_content="gemini thinks")
        self.assertEqual(GeminiAdapter().extract_reasoning(delta), "gemini thinks")

    # -- OpenRouter: prefers delta.reasoning, falls back to reasoning_content --
    def test_openrouter_reasoning_field(self):
        delta = _make_delta(reasoning="openrouter reasoning")
        self.assertEqual(OpenRouterAdapter().extract_reasoning(delta), "openrouter reasoning")

    def test_openrouter_fallback_to_reasoning_content(self):
        delta = _make_delta(reasoning_content="fallback reasoning")
        self.assertEqual(OpenRouterAdapter().extract_reasoning(delta), "fallback reasoning")

    def test_openrouter_no_reasoning(self):
        delta = _make_delta(content="just content")
        self.assertIsNone(OpenRouterAdapter().extract_reasoning(delta))


# ---------------------------------------------------------------------------
# patch_request_args
# ---------------------------------------------------------------------------
class TestPatchRequestArgs(unittest.TestCase):

    def test_base_patch_is_noop(self):
        args = {"model": "test", "max_completion_tokens": 4096}
        self.assertEqual(BaseAdapter().patch_request_args(args), args)

    def test_spark_patch_is_noop(self):
        args = {"model": "spark-x", "extra_body": {"thinking": {"type": "enabled"}}}
        self.assertEqual(SparkAdapter().patch_request_args(args), args)

    def test_qwen_patch_is_noop(self):
        args = {"model": "qwen3-max", "extra_body": {"enable_thinking": True}}
        self.assertEqual(QwenAdapter().patch_request_args(args), args)


# ---------------------------------------------------------------------------
# End-to-end: simulate the full flow in _call_api_stream
# ---------------------------------------------------------------------------
class TestFullFlowSimulation(unittest.TestCase):
    """Simulate how llm_client.py builds request_args using each adapter."""

    def _simulate_request_build(self, api_base, model, enable_thinking, max_completion_tokens=8192):
        adapter = get_adapter(api_base, model)
        request_args = {
            "model": model,
            "messages": [],
            "stream": True,
            "max_completion_tokens": max_completion_tokens,
        }
        extra_body = adapter.extra_body(enable_thinking)
        if extra_body:
            request_args["extra_body"] = extra_body
        request_args = adapter.patch_request_args(request_args)
        return request_args

    # -- Spark --
    def test_spark_think_on_full(self):
        args = self._simulate_request_build(
            "https://spark-api-open.xf-yun.com/x2/", "spark-x", True
        )
        self.assertEqual(args["extra_body"], {"thinking": {"type": "enabled"}})

    def test_spark_think_off_full(self):
        args = self._simulate_request_build(
            "https://spark-api-open.xf-yun.com/x2/", "spark-x", False
        )
        self.assertEqual(args["extra_body"], {"thinking": {"type": "disabled"}})

    # -- Doubao --
    def test_doubao_think_on_full(self):
        args = self._simulate_request_build(
            "https://ark.cn-beijing.volces.com/api/v3/", "doubao-seed-1-6-thinking", True
        )
        self.assertEqual(args["extra_body"], {"thinking": {"type": "enabled"}})

    def test_doubao_think_off_full(self):
        args = self._simulate_request_build(
            "https://ark.cn-beijing.volces.com/api/v3/", "doubao-seed-1-6-thinking", False
        )
        self.assertEqual(args["extra_body"], {"thinking": {"type": "disabled"}})

    # -- Qwen --
    def test_qwen_think_on_full(self):
        args = self._simulate_request_build(
            "https://dashscope.aliyuncs.com/compatible-mode/v1", "qwen3-max", True
        )
        self.assertEqual(args["extra_body"], {"enable_thinking": True})

    def test_qwen_think_off_full(self):
        args = self._simulate_request_build(
            "https://dashscope.aliyuncs.com/compatible-mode/v1", "qwen3-max", False
        )
        self.assertEqual(args["extra_body"], {"enable_thinking": False})

    # -- Gemini --
    def test_gemini_think_on_full(self):
        args = self._simulate_request_build(
            "http://104.238.222.71:3006/v1", "gemini-3-pro-preview", True
        )
        self.assertNotIn("extra_body", args)

    def test_gemini_think_off_full(self):
        args = self._simulate_request_build(
            "http://104.238.222.71:3006/v1", "gemini-3-pro-preview", False
        )
        self.assertNotIn("extra_body", args)

    # -- OpenRouter --
    def test_openrouter_think_on_full(self):
        args = self._simulate_request_build(
            "https://openrouter.ai/api/v1/", "qwen/qwen3.6-plus", True
        )
        self.assertNotIn("extra_body", args)

    def test_openrouter_think_off_full(self):
        args = self._simulate_request_build(
            "https://openrouter.ai/api/v1/", "qwen/qwen3.6-plus", False
        )
        self.assertNotIn("extra_body", args)

    # -- Default --
    def test_default_think_on_full(self):
        args = self._simulate_request_build(
            "https://api.openai.com/v1", "gpt-4o", True
        )
        self.assertNotIn("extra_body", args)

    def test_default_think_off_full(self):
        args = self._simulate_request_build(
            "https://api.openai.com/v1", "gpt-4o", False
        )
        self.assertNotIn("extra_body", args)


if __name__ == "__main__":
    unittest.main()

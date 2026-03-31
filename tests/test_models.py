"""Quick smoke test: send 'hello' to every model in config.yaml with think ON and OFF."""

import asyncio
import sys
import os
import yaml

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from adapters import get_adapter
from openai import AsyncOpenAI


async def test_openai_compat(name, api_base, api_key, model, adapter, enable_thinking, max_tokens=2048):
    """Test a model via the OpenAI SDK path."""
    extra_body = adapter.extra_body(enable_thinking)
    request_args = {
        "model": model,
        "messages": [{"role": "user", "content": "hello"}],
        "stream": True,
        "max_completion_tokens": max_tokens,
    }
    if extra_body:
        request_args["extra_body"] = extra_body
    request_args = adapter.patch_request_args(request_args)

    reasoning_parts = []
    content_parts = []

    async with AsyncOpenAI(api_key=api_key, base_url=api_base.rstrip("/"), timeout=30) as client:
        stream = await client.chat.completions.create(**request_args)
        async for chunk in stream:
            choices = getattr(chunk, "choices", None) or []
            if not choices:
                continue
            delta = getattr(choices[0], "delta", None)
            if not delta:
                continue

            # reasoning
            r = getattr(delta, "reasoning_content", None)
            if not r:
                me = getattr(delta, "model_extra", None) or {}
                r = me.get("reasoning_content")
            if r:
                reasoning_parts.append(r)

            # content
            c = getattr(delta, "content", None)
            if c:
                content_parts.append(c)

    return "".join(reasoning_parts), "".join(content_parts)


async def test_claude_native(name, api_base, api_key, model, adapter, enable_thinking, max_tokens=2048):
    """Test a Claude model via the native Anthropic API path."""
    messages = [{"role": "user", "content": "hello"}]
    stream = await adapter.call_stream(
        messages=messages,
        model=model,
        tools=None,
        max_completion_tokens=max_tokens,
        enable_thinking=enable_thinking,
        api_base=api_base,
        api_key=api_key,
        timeout=30,
    )

    reasoning_parts = []
    content_parts = []

    async for event_type, data in stream:
        if event_type == "reasoning_delta":
            reasoning_parts.append(data)
        elif event_type == "content_delta":
            content_parts.append(data)

    return "".join(reasoning_parts), "".join(content_parts)


async def run_test(entry, enable_thinking):
    name = entry["name"]
    api_base = entry["api_base"]
    api_key = entry["api_key"]
    model = entry["model"]
    adapter = get_adapter(api_base, model)
    adapter_name = type(adapter).__name__
    mode = "think=ON" if enable_thinking else "think=OFF"

    print(f"\n{'='*60}")
    print(f"  {name} | {model} | {adapter_name} | {mode}")
    print(f"{'='*60}")

    try:
        reasoning, content = await test_openai_compat(
            name, api_base, api_key, model, adapter, enable_thinking
        )

        if reasoning:
            preview = reasoning[:200] + ("..." if len(reasoning) > 200 else "")
            print(f"  [REASONING] ({len(reasoning)} chars): {preview}")
        else:
            print(f"  [REASONING] (none)")

        if content:
            preview = content[:300] + ("..." if len(content) > 300 else "")
            print(f"  [CONTENT]   ({len(content)} chars): {preview}")
        else:
            print(f"  [CONTENT]   (none)")

        # Verdict
        if not enable_thinking and reasoning:
            print(f"  ** WARNING: thinking OFF but got reasoning output! **")
        print(f"  RESULT: OK")

    except Exception as e:
        print(f"  ERROR: {type(e).__name__}: {str(e)[:300]}")


async def main():
    config_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.yaml")
    with open(config_path, encoding="utf-8") as f:
        config = yaml.safe_load(f)

    models = config.get("models", [])
    if not models:
        print("No models in config.yaml")
        return

    print(f"Found {len(models)} models. Testing each with think=ON and think=OFF...\n")

    for entry in models:
        await run_test(entry, enable_thinking=True)
        await run_test(entry, enable_thinking=False)


if __name__ == "__main__":
    asyncio.run(main())

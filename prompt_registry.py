"""
Prompt profile loading for Xiangqi Arena.
Each prompt lives in prompts/<name>.yaml and provides the system/user templates.
"""

from __future__ import annotations

import os
from typing import Optional

import yaml


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROMPTS_DIR = os.path.join(BASE_DIR, "prompts")
LEGACY_PROMPT_NAME_MAP = {
    "zh": "zh",
    "en": "en",
}


def _load_prompt_file(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    if not isinstance(data, dict):
        raise ValueError(f"Prompt file must contain a mapping: {path}")
    return data


def list_prompt_profiles() -> list[dict]:
    profiles = []
    if not os.path.isdir(PROMPTS_DIR):
        return profiles

    for filename in sorted(os.listdir(PROMPTS_DIR)):
        if not filename.lower().endswith((".yaml", ".yml")):
            continue
        path = os.path.join(PROMPTS_DIR, filename)
        data = _load_prompt_file(path)
        name = str(data.get("name") or os.path.splitext(filename)[0]).strip()
        if not name:
            continue

        required_fields = ("system_prompt", "turn_prompt", "tool_retry_prompt")
        missing = [field for field in required_fields if not str(data.get(field, "")).strip()]
        if missing:
            raise ValueError(f"Prompt '{name}' is missing required fields: {', '.join(missing)}")

        profiles.append({
            "name": name,
            "display_name": str(data.get("display_name") or name),
            "description": str(data.get("description") or ""),
            "system_prompt": str(data["system_prompt"]),
            "turn_prompt": str(data["turn_prompt"]),
            "tool_retry_prompt": str(data["tool_retry_prompt"]),
            "empty_legal_moves_text": str(data.get("empty_legal_moves_text") or "(none)"),
            "is_default": bool(data.get("default", False)),
        })

    return profiles


def get_default_prompt_name() -> str:
    profiles = list_prompt_profiles()
    for profile in profiles:
        if profile.get("is_default"):
            return profile["name"]
    for profile in profiles:
        if profile["name"] == "zh":
            return profile["name"]
    return profiles[0]["name"] if profiles else "zh"


def resolve_prompt_name(prompt_name: Optional[str] = None, prompt_lang: Optional[str] = None) -> str:
    if prompt_name:
        return prompt_name
    if prompt_lang:
        return LEGACY_PROMPT_NAME_MAP.get(prompt_lang, prompt_lang)
    return get_default_prompt_name()


def get_prompt_profile(prompt_name: Optional[str] = None, prompt_lang: Optional[str] = None) -> dict:
    resolved_name = resolve_prompt_name(prompt_name, prompt_lang)
    profiles = list_prompt_profiles()
    for profile in profiles:
        if profile["name"] == resolved_name:
            return profile
    available = ", ".join(profile["name"] for profile in profiles) or "(none)"
    raise ValueError(f"Prompt '{resolved_name}' not found. Available prompts: {available}")

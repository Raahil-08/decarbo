"""LLM Provider interface and implementations per PRD §15.1."""

import asyncio
from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any, Protocol

from pydantic import BaseModel

from app.config import Settings, get_settings


@dataclass
class Message:
    role: str  # "user" | "assistant" | "system"
    content: str


@dataclass
class ContentPart:
    type: str  # "text" | "image" | "document"
    text: str | None = None
    media_type: str | None = None  # e.g. "image/png", "application/pdf"
    data: str | None = None  # base64 encoded data


@dataclass
class ToolSpec:
    name: str
    description: str
    input_schema: dict[str, Any]


@dataclass
class ChatEvent:
    event_type: str  # "text_delta" | "tool_use" | "tool_result" | "done" | "error"
    content: str | None = None
    tool_name: str | None = None
    tool_input: dict[str, Any] | None = None
    tool_output: dict[str, Any] | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


class LLMProvider(Protocol):
    """Provider interface per PRD §15.1."""

    async def extract(
        self,
        *,
        task: str,
        system: str,
        content: list[ContentPart],
        schema: type[BaseModel],
        model: str,
    ) -> BaseModel: ...

    async def stream_text(
        self,
        *,
        system: str,
        messages: list[Message],
        model: str,
    ) -> AsyncIterator[str]: ...

    async def chat_with_tools(
        self,
        *,
        system: str,
        messages: list[Message],
        tools: list[ToolSpec],
        executor: Callable[[str, dict[str, Any]], Awaitable[dict[str, Any]]],
        model: str,
    ) -> AsyncIterator[ChatEvent]: ...


class AnthropicProvider:
    """Production LLM provider using Anthropic Python SDK."""

    def __init__(self, api_key: str):
        import anthropic

        self.client = anthropic.AsyncAnthropic(api_key=api_key)

    async def extract(
        self,
        *,
        task: str,
        system: str,
        content: list[ContentPart],
        schema: type[BaseModel],
        model: str,
    ) -> BaseModel:
        tool_name = f"extract_{task}"
        tool_spec = {
            "name": tool_name,
            "description": f"Extract structured data for {task}",
            "input_schema": schema.model_json_schema(),
        }

        # Build message contents
        user_contents: list[dict[str, Any]] = []
        for part in content:
            if part.type == "text" and part.text:
                user_contents.append({"type": "text", "text": part.text})
            elif part.type == "image" and part.data and part.media_type:
                user_contents.append({
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": part.media_type,
                        "data": part.data,
                    },
                })
            elif part.type == "document" and part.data:
                user_contents.append({
                    "type": "document",
                    "source": {
                        "type": "base64",
                        "media_type": part.media_type or "application/pdf",
                        "data": part.data,
                    },
                })

        response = await self.client.messages.create(
            model=model,
            max_tokens=4096,
            system=system,
            messages=[{"role": "user", "content": user_contents}],
            tools=[tool_spec],
            tool_choice={"type": "tool", "name": tool_name},
        )

        for block in response.content:
            if block.type == "tool_use" and block.name == tool_name:
                return schema.model_validate(block.input)

        raise ValueError(f"Model did not return tool call for {tool_name}")

    async def stream_text(
        self,
        *,
        system: str,
        messages: list[Message],
        model: str,
    ) -> AsyncIterator[str]:
        api_messages = [{"role": m.role, "content": m.content} for m in messages]

        async with self.client.messages.stream(
            model=model,
            max_tokens=2048,
            system=system,
            messages=api_messages,
        ) as stream:
            async for text in stream.text_stream:
                yield text

    async def chat_with_tools(
        self,
        *,
        system: str,
        messages: list[Message],
        tools: list[ToolSpec],
        executor: Callable[[str, dict[str, Any]], Awaitable[dict[str, Any]]],
        model: str,
    ) -> AsyncIterator[ChatEvent]:
        # P1 feature - placeholder adhering to protocol
        yield ChatEvent(event_type="done", content="Chat not yet active")


class MockProvider:
    """Mock LLM Provider for deterministic testing and offline mode."""

    def __init__(self, canned_text: str = "", canned_stream: list[str] | None = None):
        self.canned_text = canned_text
        self.canned_stream = canned_stream or (
            [canned_text] if canned_text else ["Plan ", "explanation ", "mock ", "text."]
        )

    async def extract(
        self,
        *,
        task: str,
        system: str,
        content: list[ContentPart],
        schema: type[BaseModel],
        model: str,
    ) -> BaseModel:
        # Construct a default mock instance of the requested schema
        return schema.model_validate({})

    async def stream_text(
        self,
        *,
        system: str,
        messages: list[Message],
        model: str,
    ) -> AsyncIterator[str]:
        for chunk in self.canned_stream:
            yield chunk
            await asyncio.sleep(0.01)

    async def chat_with_tools(
        self,
        *,
        system: str,
        messages: list[Message],
        tools: list[ToolSpec],
        executor: Callable[[str, dict[str, Any]], Awaitable[dict[str, Any]]],
        model: str,
    ) -> AsyncIterator[ChatEvent]:
        yield ChatEvent(event_type="text_delta", content="Mock chat response.")
        yield ChatEvent(event_type="done")


def get_llm_provider(settings: Settings | None = None) -> LLMProvider:
    """Return configured LLM provider instance."""
    s = settings or get_settings()
    if not s.llm_enabled or not s.anthropic_api_key:
        return MockProvider()

    if s.LLM_PROVIDER == "anthropic":
        return AnthropicProvider(api_key=s.anthropic_api_key)

    return MockProvider()

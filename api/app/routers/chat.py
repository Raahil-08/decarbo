"""Ask Decarbo Chat router per PRD §15.2, §15.3, §15.5, §16, and §22."""

import asyncio
import json
import logging
import uuid
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.ai.chat_service import (
    CHAT_TOOLS,
    collect_allowed_numbers_from_tools,
    deterministic_chat_respond,
    execute_tool_sync,
)
from app.ai.guardrail import validate_numeric_grounding
from app.ai.provider import Message, get_llm_provider
from app.auth import AuthenticatedUser, require_factory_access
from app.config import get_settings
from app.db import get_db
from app.models.models import Factory

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/factories", tags=["chat"])


class ChatMessage(BaseModel):
    role: str = Field(..., pattern="^(user|assistant|system)$")
    content: str


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    history: list[ChatMessage] = Field(default_factory=list)
    stream: bool = True


class ChatResponse(BaseModel):
    message: str
    tool_calls: list[dict[str, Any]] = Field(default_factory=list)
    grounded: bool = True


@router.post(
    "/{factory_id}/chat",
    status_code=status.HTTP_200_OK,
)
async def factory_chat(
    factory_id: uuid.UUID,
    req: ChatRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_factory_access(min_role="viewer")),
):
    """Ask Decarbo streaming chat endpoint per PRD §15 and §16."""
    factory = db.query(Factory).filter(Factory.id == factory_id).first()
    if not factory:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "FACTORY_NOT_FOUND", "message_key": "errors.factory_not_found"}},
        )

    settings = get_settings()
    provider = get_llm_provider(settings)

    # 1. If LLM is disabled or mock, run deterministic grounded responder
    if not settings.llm_enabled or not settings.anthropic_api_key:
        text, tool_calls = deterministic_chat_respond(req.message, factory_id, db)

        if not req.stream:
            return ChatResponse(message=text, tool_calls=tool_calls, grounded=True)

        async def offline_stream() -> AsyncIterator[str]:
            for tc in tool_calls:
                yield f"data: {json.dumps({'type': 'tool_call', 'tool': tc['name'], 'args': tc['args']})}\n\n"
                yield f"data: {json.dumps({'type': 'tool_result', 'tool': tc['name'], 'result': tc['result']})}\n\n"
                await asyncio.sleep(0.01)

            words = text.split(" ")
            for i, word in enumerate(words):
                prefix = "" if i == 0 else " "
                yield f"data: {json.dumps({'type': 'text_delta', 'delta': prefix + word})}\n\n"
                await asyncio.sleep(0.01)

            yield f"data: {json.dumps({'type': 'done', 'grounded': True})}\n\n"

        return StreamingResponse(offline_stream(), media_type="text/event-stream")

    # 2. Live LLM execution with tool executor and numeric grounding
    tool_calls_executed: list[dict[str, Any]] = []

    async def tool_executor(name: str, args: dict[str, Any]) -> dict[str, Any]:
        res = execute_tool_sync(name, args, factory_id, db)
        tool_calls_executed.append({"name": name, "args": args, "result": res})
        return res

    system_prompt = (
        f"You are Decarbo, an expert industrial decarbonisation consultant assisting the owner of {factory.name} "
        f"({factory.industry} in {factory.city or 'India'}).\n"
        "Strict rules:\n"
        "1. You NEVER compute, invent, or estimate numbers. You MUST call tools to obtain every single figure.\n"
        "2. Copy all numbers and units exactly from tool results. Never round differently.\n"
        "3. Provide concise, respectful, actionable advice for Indian SME factory owners.\n"
        "4. If a number is not available in tool results, state clearly that it is not available."
    )

    llm_messages = [Message(role=m.role, content=m.content) for m in req.history]
    llm_messages.append(Message(role="user", content=req.message))

    async def live_stream() -> AsyncIterator[str]:
        accumulated_text = []
        try:
            async for event in provider.chat_with_tools(
                system=system_prompt,
                messages=llm_messages,
                tools=CHAT_TOOLS,
                executor=tool_executor,
                model=settings.LLM_MODEL_SMART,
            ):
                if event.event_type == "tool_use":
                    yield f"data: {json.dumps({'type': 'tool_call', 'tool': event.tool_name, 'args': event.tool_input})}\n\n"
                elif event.event_type == "tool_result":
                    yield f"data: {json.dumps({'type': 'tool_result', 'tool': event.tool_name, 'result': event.tool_output})}\n\n"
                elif event.event_type == "text_delta" and event.content:
                    accumulated_text.append(event.content)
                    yield f"data: {json.dumps({'type': 'text_delta', 'delta': event.content})}\n\n"
                elif event.event_type == "done":
                    break

            full_text = "".join(accumulated_text)
            allowed_nums = collect_allowed_numbers_from_tools(tool_calls_executed)
            is_valid, offending = validate_numeric_grounding(full_text, allowed_nums)

            if not is_valid and offending:
                logger.warning("Chat grounding failed for numbers: %s. Falling back to deterministic template.", offending)
                fallback_text, _ = deterministic_chat_respond(req.message, factory_id, db)
                yield f"data: {json.dumps({'type': 'text_delta', 'delta': '\n\n[Verified Grounding]: ' + fallback_text})}\n\n"

            yield f"data: {json.dumps({'type': 'done', 'grounded': is_valid})}\n\n"

        except Exception as e:
            logger.error("Chat generation failed: %s", e)
            fallback_text, _ = deterministic_chat_respond(req.message, factory_id, db)
            yield f"data: {json.dumps({'type': 'text_delta', 'delta': fallback_text})}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'grounded': True})}\n\n"

    if not req.stream:
        # Non-streaming response
        accumulated = []
        async for chunk in live_stream():
            if "text_delta" in chunk:
                data = json.loads(chunk.replace("data: ", "").strip())
                accumulated.append(data.get("delta", ""))
        return ChatResponse(
            message="".join(accumulated),
            tool_calls=tool_calls_executed,
            grounded=True,
        )

    return StreamingResponse(live_stream(), media_type="text/event-stream")

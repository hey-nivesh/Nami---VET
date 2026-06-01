"""
Mistral Service — NVIDIA API wrapper for AI chat completions.

Wraps the NVIDIA inference gateway with retry logic
(3 attempts, exponential backoff on 429/503).
"""

import asyncio
import os
from typing import Any, Optional

import httpx
from dotenv import load_dotenv

load_dotenv()

NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY", "")
NVIDIA_API_URL = "https://integrate.api.nvidia.com/v1/chat/completions"
MODEL_ID = "mistralai/mistral-large-3-675b-instruct-2512"

# System prompt injected into every conversation
NAMI_SYSTEM_PROMPT = (
    "You are Nami, an AI video editing assistant. "
    "You help users edit videos, suggest cuts, describe what's in clips, "
    "generate subtitle ideas, and answer questions about the current project. "
    "Be concise and practical."
)

MAX_RETRIES = 3
BASE_BACKOFF_SECONDS = 1.0
RETRYABLE_STATUS_CODES = {429, 503}


class MistralServiceError(Exception):
    """Raised when the Mistral API call fails after all retries."""

    def __init__(self, message: str, status_code: int = 0, body: str = ""):
        self.status_code = status_code
        self.body = body
        super().__init__(message)


class MistralResponse:
    def __init__(self, content: Optional[str] = None, tool_calls: Optional[list] = None, stop_reason: Optional[str] = None):
        self.content = content
        self.tool_calls = tool_calls or []
        self.stop_reason = stop_reason
        self.has_tool_calls = len(self.tool_calls) > 0
        self.text_content = content or ""


class MistralService:
    """Async wrapper for the NVIDIA Mistral inference API."""

    async def chat_with_tools(
        self,
        messages: list[dict[str, str]],
        system_prompt: str,
        tools: list[dict],
        max_tokens: int = 2048,
        temperature: float = 0.15,
    ) -> MistralResponse:
        """
        Send a chat completion request with functional tools to the NVIDIA API.
        """
        if not NVIDIA_API_KEY:
            raise MistralServiceError("NVIDIA_API_KEY not set. Add it to backend/.env")

        messages_with_system = [
            {"role": "system", "content": system_prompt},
            *messages,
        ]

        payload = {
            "model": MODEL_ID,
            "messages": messages_with_system,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "top_p": 1.0,
            "stream": False,
            "tools": tools,
            "tool_choice": "auto"
        }

        api_key = NVIDIA_API_KEY.lower().startswith("bearer ") and NVIDIA_API_KEY[7:].strip() or NVIDIA_API_KEY.strip()
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": f"Bearer {api_key}",
        }

        last_error: Exception | None = None

        for attempt in range(MAX_RETRIES):
            try:
                async with httpx.AsyncClient() as client:
                    response = await client.post(
                        NVIDIA_API_URL,
                        headers=headers,
                        json=payload,
                        timeout=60.0,
                    )

                    if response.status_code == 200:
                        data = response.json()
                        choice = data["choices"][0]
                        msg = choice["message"]
                        
                        # Return wrapped response containing tool calls
                        tool_calls = []
                        if "tool_calls" in msg:
                            # Standardize tool call object structures
                            for tc in msg["tool_calls"]:
                                # Convert dict to a dotted attribute object for openai compatibility
                                class Func:
                                    def __init__(self, name, arguments):
                                        self.name = name
                                        self.arguments = arguments
                                class ToolCall:
                                    def __init__(self, tc_id, function):
                                        self.id = tc_id
                                        self.function = function
                                
                                tool_calls.append(ToolCall(
                                    tc_id=tc.get("id"),
                                    function=Func(
                                        name=tc.get("function", {}).get("name"),
                                        arguments=tc.get("function", {}).get("arguments")
                                    )
                                ))

                        return MistralResponse(
                            content=msg.get("content"),
                            tool_calls=tool_calls,
                            stop_reason=choice.get("finish_reason")
                        )

                    if response.status_code in RETRYABLE_STATUS_CODES:
                        wait_time = BASE_BACKOFF_SECONDS * (2**attempt)
                        print(
                            f"  ⚠ Mistral API returned {response.status_code}, "
                            f"retrying in {wait_time}s (attempt {attempt + 1}/{MAX_RETRIES})"
                        )
                        await asyncio.sleep(wait_time)
                        last_error = MistralServiceError(
                            f"API returned {response.status_code}",
                            status_code=response.status_code,
                            body=response.text,
                        )
                        continue

                    # Non-retryable error
                    raise MistralServiceError(
                        f"Mistral API error: {response.status_code}",
                        status_code=response.status_code,
                        body=response.text,
                    )

            except httpx.TimeoutException:
                wait_time = BASE_BACKOFF_SECONDS * (2**attempt)
                print(
                    f"  ⚠ Mistral API timeout, retrying in {wait_time}s "
                    f"(attempt {attempt + 1}/{MAX_RETRIES})"
                )
                await asyncio.sleep(wait_time)
                last_error = MistralServiceError("Request timed out")

            except httpx.HTTPError as e:
                last_error = MistralServiceError(f"HTTP error: {e}")
                break

        raise last_error or MistralServiceError("All retries exhausted")

    async def chat(
        self,
        messages: list[dict[str, str]],
        context: dict[str, Any] | None = None,
        max_tokens: int = 2048,
        temperature: float = 0.15,
    ) -> str:
        """
        Send a chat completion request to the NVIDIA Mistral API.

        Args:
            messages: List of {role, content} message dicts.
            context: Optional project context (current_clip, project_name).
            max_tokens: Maximum tokens in response.
            temperature: Sampling temperature.

        Returns:
            The assistant's response text.

        Raises:
            MistralServiceError: If all retries are exhausted.
        """
        if not NVIDIA_API_KEY:
            raise MistralServiceError(
                "NVIDIA_API_KEY not set. Add it to backend/.env"
            )

        # Build messages with system prompt
        system_content = NAMI_SYSTEM_PROMPT
        if context:
            if context.get("project_name"):
                system_content += f"\nCurrent project: {context['project_name']}"
            if context.get("current_clip"):
                system_content += f"\nSelected clip: {context['current_clip']}"

        messages_with_system = [
            {"role": "system", "content": system_content},
            *messages,
        ]

        payload = {
            "model": MODEL_ID,
            "messages": messages_with_system,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "top_p": 1.0,
            "stream": False,
        }

        # Clean API key in case it was written with a pre-existing "Bearer " prefix
        api_key = NVIDIA_API_KEY
        if api_key.lower().startswith("bearer "):
            api_key = api_key[7:].strip()

        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": f"Bearer {api_key}",
        }

        last_error: Exception | None = None

        for attempt in range(MAX_RETRIES):
            try:
                async with httpx.AsyncClient() as client:
                    response = await client.post(
                        NVIDIA_API_URL,
                        headers=headers,
                        json=payload,
                        timeout=60.0,
                    )

                    if response.status_code == 200:
                        data = response.json()
                        return data["choices"][0]["message"]["content"]

                    if response.status_code in RETRYABLE_STATUS_CODES:
                        wait_time = BASE_BACKOFF_SECONDS * (2**attempt)
                        print(
                            f"  ⚠ Mistral API returned {response.status_code}, "
                            f"retrying in {wait_time}s (attempt {attempt + 1}/{MAX_RETRIES})"
                        )
                        await asyncio.sleep(wait_time)
                        last_error = MistralServiceError(
                            f"API returned {response.status_code}",
                            status_code=response.status_code,
                            body=response.text,
                        )
                        continue

                    # Non-retryable error
                    raise MistralServiceError(
                        f"Mistral API error: {response.status_code}",
                        status_code=response.status_code,
                        body=response.text,
                    )

            except httpx.TimeoutException:
                wait_time = BASE_BACKOFF_SECONDS * (2**attempt)
                print(
                    f"  ⚠ Mistral API timeout, retrying in {wait_time}s "
                    f"(attempt {attempt + 1}/{MAX_RETRIES})"
                )
                await asyncio.sleep(wait_time)
                last_error = MistralServiceError("Request timed out")

            except httpx.HTTPError as e:
                last_error = MistralServiceError(f"HTTP error: {e}")
                break

        raise last_error or MistralServiceError("All retries exhausted")


# Singleton instance
mistral_service = MistralService()

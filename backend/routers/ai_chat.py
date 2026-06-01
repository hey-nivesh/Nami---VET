"""
AI Chat Router — REST endpoint for AI Agent loop with Mistral tool calling.
"""

import json
from typing import Any, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from services.mistral_service import mistral_service, MistralServiceError
from services.agent_executor import execute_tool, resolve_clip

router = APIRouter(prefix="/api/v1/ai", tags=["ai"])

# ── Pydantic Models ──────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str = Field(..., description="Message role: 'user', 'assistant' or 'tool'")
    content: str = Field(..., min_length=1, description="Message content")
    name: Optional[str] = None
    tool_call_id: Optional[str] = None


class ChatContext(BaseModel):
    current_clip: Optional[str] = None
    project_name: Optional[str] = None
    project_id: Optional[str] = None
    user_id: Optional[str] = None


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(..., min_length=1, description="Conversation messages")
    context: Optional[ChatContext] = None


class ChatResponse(BaseModel):
    success: bool
    message: str
    role: str = "assistant"
    steps: Optional[list[dict]] = None


# ── AI System Prompt & Agent Tools ──────────────────────────

SYSTEM_PROMPT = (
    "You are Nami, an advanced AI video editing assistant. You have full agentic capabilities "
    "to modify the project's timeline and clips using a variety of specialized tools.\n\n"
    "When a user asks you to make changes (like trimming, splitting, speeding up, adding visual effects, "
    "transcribing subtitles, adjusting audio, etc.), always call the appropriate tools. "
    "If you need information about what is on the timeline, always call `get_project_info` first "
    "before deciding other steps. Be concise and practical."
)

AGENT_TOOLS = [
  {
    "type": "function",
    "function": {
      "name": "trim_clip",
      "description": "Trim a video clip to new in/out points. Use when user says 'trim', 'cut to X seconds', 'shorten', 'remove the first/last N seconds'",
      "parameters": {
        "type": "object",
        "properties": {
          "clip_id": {"type": "string", "description": "ID of the clip to trim. Use 'first', 'last', 'selected', or the actual clip ID"},
          "new_in_point": {"type": "number", "description": "New start point in seconds (from source start). Omit to keep current."},
          "new_out_point": {"type": "number", "description": "New end point in seconds (from source start). Omit to keep current."},
          "trim_from_start_seconds": {"type": "number", "description": "Alternative: remove this many seconds from the start"},
          "trim_from_end_seconds": {"type": "number", "description": "Alternative: remove this many seconds from the end"}
        },
        "required": ["clip_id"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "split_clip",
      "description": "Split a clip at a specific time. Use when user says 'split', 'cut at', 'divide'",
      "parameters": {
        "type": "object",
        "properties": {
          "clip_id": {"type": "string"},
          "split_at_seconds": {"type": "number", "description": "Global timeline time to split at"}
        },
        "required": ["clip_id", "split_at_seconds"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "merge_clips",
      "description": "Merge/concatenate multiple clips into one. Use when user says 'merge', 'join', 'combine clips'",
      "parameters": {
        "type": "object",
        "properties": {
          "clip_ids": {"type": "array", "items": {"type": "string"}, "description": "Ordered list of clip IDs to merge. Use 'all' to merge all clips."}
        },
        "required": ["clip_ids"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "add_transition",
      "description": "Add a transition between two adjacent clips",
      "parameters": {
        "type": "object",
        "properties": {
          "between_clip_ids": {"type": "array", "items": {"type": "string"}, "description": "Two clip IDs. Use 'all_clips' to add between every pair."},
          "transition_type": {"type": "string", "enum": ["crossfade", "fade_black", "fade_white", "wipe_left", "wipe_right", "zoom_in", "zoom_out"]},
          "duration_seconds": {"type": "number", "default": 0.5}
        },
        "required": ["between_clip_ids", "transition_type"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "add_filter",
      "description": "Apply a visual filter/effect to one or more clips",
      "parameters": {
        "type": "object",
        "properties": {
          "clip_id": {"type": "string", "description": "Clip ID, or 'all' for all clips, or 'selected'"},
          "filter_type": {"type": "string", "enum": ["brightness", "contrast", "saturation", "blur", "sharpen", "vignette", "grain", "black_and_white", "warmth", "tint", "exposure", "chromatic_aberration"]},
          "parameters": {"type": "object", "description": "Filter-specific parameters. E.g. {amount: 50} for brightness"}
        },
        "required": ["clip_id", "filter_type"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "remove_filter",
      "description": "Remove a filter from a clip",
      "parameters": {
        "type": "object",
        "properties": {
          "clip_id": {"type": "string"},
          "filter_type": {"type": "string", "description": "Filter to remove, or 'all' to clear all filters"}
        },
        "required": ["clip_id", "filter_type"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "add_text_overlay",
      "description": "Add a text overlay to the video at a specific time range",
      "parameters": {
        "type": "object",
        "properties": {
          "text": {"type": "string"},
          "start_time": {"type": "number"},
          "end_time": {"type": "number"},
          "position": {"type": "string", "enum": ["top_left", "top_center", "top_right", "center", "bottom_left", "bottom_center", "bottom_right"], "default": "bottom_center"},
          "font_size": {"type": "number", "default": 48},
          "color": {"type": "string", "default": "#FFFFFF"},
          "animation": {"type": "string", "enum": ["none", "fade_in", "slide_up", "typewriter"], "default": "fade_in"}
        },
        "required": ["text", "start_time", "end_time"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "generate_subtitles",
      "description": "Auto-generate subtitles for a clip using speech recognition",
      "parameters": {
        "type": "object",
        "properties": {
          "clip_id": {"type": "string", "description": "Clip to transcribe, or 'all'"},
          "language": {"type": "string", "default": "en"}
        },
        "required": ["clip_id"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "remove_silence",
      "description": "Automatically detect and remove silent sections from clips",
      "parameters": {
        "type": "object",
        "properties": {
          "clip_id": {"type": "string", "description": "Clip ID or 'all'"},
          "threshold_db": {"type": "number", "default": -40, "description": "Volume threshold below which is considered silence"},
          "min_silence_ms": {"type": "number", "default": 500, "description": "Minimum silence duration to remove (milliseconds)"}
        },
        "required": ["clip_id"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "set_clip_speed",
      "description": "Change the playback speed of a clip",
      "parameters": {
        "type": "object",
        "properties": {
          "clip_id": {"type": "string"},
          "speed_factor": {"type": "number", "description": "1.0=normal, 2.0=2x fast, 0.5=half speed"},
          "reverse": {"type": "boolean", "default": False}
        },
        "required": ["clip_id", "speed_factor"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "adjust_audio",
      "description": "Adjust audio properties of a clip",
      "parameters": {
        "type": "object",
        "properties": {
          "clip_id": {"type": "string"},
          "volume": {"type": "number", "description": "Volume factor: 1.0=original, 0=mute, 2.0=double"},
          "fade_in": {"type": "number", "description": "Fade in duration in seconds"},
          "fade_out": {"type": "number", "description": "Fade out duration in seconds"},
          "mute": {"type": "boolean"}
        },
        "required": ["clip_id"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "move_clip",
      "description": "Move a clip to a different position on the timeline",
      "parameters": {
        "type": "object",
        "properties": {
          "clip_id": {"type": "string"},
          "new_timeline_start": {"type": "number", "description": "New start time in seconds on the timeline"}
        },
        "required": ["clip_id", "new_timeline_start"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "delete_clip",
      "description": "Delete a clip from the timeline",
      "parameters": {
        "type": "object",
        "properties": {
          "clip_id": {"type": "string", "description": "Clip ID, 'selected', or 'all'"},
          "ripple": {"type": "boolean", "default": True, "description": "Whether to ripple-delete (close the gap)"}
        },
        "required": ["clip_id"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "export_video",
      "description": "Export/render the final video",
      "parameters": {
        "type": "object",
        "properties": {
          "output_path": {"type": "string"},
          "format": {"type": "string", "enum": ["mp4", "mov", "webm"], "default": "mp4"},
          "resolution": {"type": "string", "enum": ["4k", "1080p", "720p", "480p"], "default": "1080p"},
          "quality": {"type": "string", "enum": ["high", "medium", "web"], "default": "high"}
        }
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "undo",
      "description": "Undo the last editing action",
      "parameters": {"type": "object", "properties": {}}
    }
  },
  {
    "type": "function",
    "function": {
      "name": "get_project_info",
      "description": "Get current state of the timeline and all clips. Always call this first when you need to know clip IDs, durations, or what's on the timeline.",
      "parameters": {"type": "object", "properties": {}}
    }
  }
]


async def run_agent(messages: list[dict], project_context: dict, project_id: str, user_id: str):
    """
    Agentic loop: model calls tools, tools execute, results fed back,
    model continues until no more tool calls.
    """
    conversation = messages.copy()
    
    # Inject project context as a system guideline
    context_str = f"Current project state: {json.dumps(project_context)}"
    system_prompt_with_context = f"{SYSTEM_PROMPT}\n\n{context_str}"
    
    max_iterations = 10  # prevent infinite loops
    iteration = 0
    execution_steps = []
    
    while iteration < max_iterations:
        iteration += 1
        
        # Call Mistral via NVIDIA API with functional tools
        response = await mistral_service.chat_with_tools(
            messages=conversation,
            system_prompt=system_prompt_with_context,
            tools=AGENT_TOOLS
        )
        
        # Check if model wants to call tools
        if response.has_tool_calls:
            tool_calls = response.tool_calls
            
            # Record assistant's request in conversations list
            tool_call_dicts = []
            for tc in tool_calls:
                tool_call_dicts.append({
                    "id": tc.id,
                    "type": "function",
                    "function": {
                        "name": tc.function.name,
                        "arguments": tc.function.arguments
                    }
                })

            conversation.append({
                "role": "assistant",
                "content": response.content,
                "tool_calls": tool_call_dicts
            })
            
            # Execute each tool call sequentially
            tool_results = []
            for tool_call in tool_calls:
                tool_args = json.loads(tool_call.function.arguments)
                
                step_info = {"tool": tool_call.function.name, "args": tool_args, "status": "running"}
                execution_steps.append(step_info)

                try:
                    result = await execute_tool(
                        tool_name=tool_call.function.name,
                        tool_args=tool_args,
                        project_id=project_id,
                        user_id=user_id,
                        context=project_context
                    )
                    step_info["status"] = "success"
                    step_info["result"] = result.get("message", "Success")
                except Exception as e:
                    result = {"success": False, "error": str(e)}
                    step_info["status"] = "failed"
                    step_info["result"] = str(e)
                
                tool_results.append({
                    "tool_call_id": tool_call.id,
                    "role": "tool",
                    "name": tool_call.function.name,
                    "content": json.dumps(result)
                })
            
            # Feed tool execution responses back to conversation model
            conversation.extend(tool_results)
            # Loop runs again for subsequent tool choices or final summary text
            
        else:
            # Model is finished calling functions, return final answer and history steps list
            return response.text_content, execution_steps
            
    return "I completed the requested editing operations.", execution_steps


# ── Endpoint ─────────────────────────────────────────────────

@router.post("/chat", response_model=ChatResponse)
async def ai_chat(req: ChatRequest):
    """
    Send a message to the Nami AI assistant.
    Spawns tool-using agent cycles to modify the timeline in real-time.
    """
    try:
        messages_dicts = []
        for m in req.messages:
            msg = {"role": m.role, "content": m.content}
            if m.name:
                msg["name"] = m.name
            if m.tool_call_id:
                msg["tool_call_id"] = m.tool_call_id
            messages_dicts.append(msg)

        context_dict: dict[str, Any] = {}
        project_id = ""
        user_id = ""

        if req.context:
            context_dict = {
                "current_clip": req.context.current_clip,
                "project_name": req.context.project_name,
            }
            project_id = req.context.project_id or ""
            user_id = req.context.user_id or ""

        # Run full agentic tool executions router loop
        response_text, steps = await run_agent(
            messages=messages_dicts,
            project_context=context_dict,
            project_id=project_id,
            user_id=user_id
        )

        return ChatResponse(
            success=True,
            message=response_text,
            role="assistant",
            steps=steps
        )
    except MistralServiceError as e:
        raise HTTPException(
            status_code=502 if e.status_code >= 500 else 400,
            detail=f"AI service error: {e}",
        ) from e
    except Exception as e:
        raise HTTPException(500, f"Unexpected agent error: {e}") from e

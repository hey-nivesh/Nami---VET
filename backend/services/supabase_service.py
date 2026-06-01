"""
Supabase REST client service — provides PostgREST API wrappers over HTTP using httpx.
"""

import os
from typing import Any, Optional
import httpx
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")


class SupabaseService:
    def __init__(self):
        self.headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        }

    async def get_timeline(self, project_id: str) -> dict:
        """Fetch current project timeline json."""
        url = f"{SUPABASE_URL}/rest/v1/project_timelines?project_id=eq.{project_id}"
        async with httpx.AsyncClient() as client:
            res = await client.get(url, headers=self.headers)
            if res.status_code == 200:
                data = res.json()
                if data:
                    return data[0].get("timeline_json", {})
        return {"tracks": [], "duration": 0, "playhead": 0}

    async def update_timeline(self, project_id: str, timeline_json: dict) -> bool:
        """Update/save project timeline json."""
        url = f"{SUPABASE_URL}/rest/v1/project_timelines?project_id=eq.{project_id}"
        payload = {
            "timeline_json": timeline_json
        }
        async with httpx.AsyncClient() as client:
            res = await client.patch(url, headers=self.headers, json=payload)
            return res.status_code in (200, 201, 204)

    async def get_media_asset(self, project_id: str, asset_id: str) -> Optional[dict]:
        """Fetch details for a specific media asset."""
        url = f"{SUPABASE_URL}/rest/v1/media_assets?project_id=eq.{project_id}&id=eq.{asset_id}"
        async with httpx.AsyncClient() as client:
            res = await client.get(url, headers=self.headers)
            if res.status_code == 200:
                data = res.json()
                if data:
                    return data[0]
        return None

    async def get_all_media_assets(self, project_id: str) -> list[dict]:
        """Fetch all media assets for a project."""
        url = f"{SUPABASE_URL}/rest/v1/media_assets?project_id=eq.{project_id}"
        async with httpx.AsyncClient() as client:
            res = await client.get(url, headers=self.headers)
            if res.status_code == 200:
                return res.json()
        return []

    async def save_subtitles(self, project_id: str, clip_id: str, segments: list) -> bool:
        """Save auto-generated subtitle segments."""
        # Clean up existing subtitle segments for this clip
        delete_url = f"{SUPABASE_URL}/rest/v1/subtitle_segments?project_id=eq.{project_id}&media_asset_id=eq.{clip_id}"
        async with httpx.AsyncClient() as client:
            await client.delete(delete_url, headers=self.headers)
            
            # Prepare insert payloads
            payloads = []
            for seg in segments:
                payloads.append({
                    "project_id": project_id,
                    "media_asset_id": clip_id,
                    "start_time": seg.get("start", 0.0),
                    "end_time": seg.get("end", 0.0),
                    "text": seg.get("text", ""),
                })
            
            if payloads:
                insert_url = f"{SUPABASE_URL}/rest/v1/subtitle_segments"
                res = await client.post(insert_url, headers=self.headers, json=payloads)
                return res.status_code in (200, 201, 204)
        return True


# Singleton service instance
supabase_service = SupabaseService()

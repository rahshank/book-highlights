"""Publishing integrations for Ghost and Roam Research."""

from __future__ import annotations

import hashlib
import hmac
import time
from datetime import datetime, timezone

import httpx

from app.config import GHOST_API_URL, GHOST_ADMIN_API_KEY, ROAM_GRAPH_NAME, ROAM_API_TOKEN


def _ghost_jwt() -> str:
    """Create a short-lived JWT for Ghost Admin API.

    Ghost Admin API keys are in the format: {id}:{secret}
    """
    key_id, secret = GHOST_ADMIN_API_KEY.split(":")
    iat = int(time.time())
    # Ghost accepts a simple HS256 JWT
    header = '{"alg":"HS256","kid":"' + key_id + '","typ":"JWT"}'
    payload = '{"iat":' + str(iat) + ',"exp":' + str(iat + 300) + ',"aud":"/admin/"}'

    import base64

    def b64url(data: bytes) -> str:
        return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

    segments = b64url(header.encode()) + "." + b64url(payload.encode())
    secret_bytes = bytes.fromhex(secret)
    sig = hmac.new(secret_bytes, segments.encode(), hashlib.sha256).digest()
    return segments + "." + b64url(sig)


async def publish_to_ghost(title: str, html_content: str) -> dict:
    """Publish highlights as a Ghost post.

    Returns the Ghost post URL on success, or an error dict.
    """
    if not GHOST_API_URL or not GHOST_ADMIN_API_KEY:
        return {"error": "Ghost API not configured. Set GHOST_API_URL and GHOST_ADMIN_API_KEY."}

    token = _ghost_jwt()
    url = f"{GHOST_API_URL.rstrip('/')}/ghost/api/admin/posts/"

    post_data = {
        "posts": [
            {
                "title": title,
                "html": html_content,
                "status": "draft",
            }
        ]
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            url,
            json=post_data,
            headers={"Authorization": f"Ghost {token}"},
            timeout=30,
        )
        if resp.status_code == 201:
            post = resp.json()["posts"][0]
            return {"url": post.get("url", ""), "id": post["id"], "status": "draft"}
        return {"error": f"Ghost API error {resp.status_code}: {resp.text}"}


async def publish_to_roam(title: str, highlights: list[dict]) -> dict:
    """Publish highlights to a Roam Research graph via the Roam backend API.

    Each highlight becomes a bullet under a page named after the book.
    """
    if not ROAM_GRAPH_NAME or not ROAM_API_TOKEN:
        return {"error": "Roam API not configured. Set ROAM_GRAPH_NAME and ROAM_API_TOKEN."}

    url = "https://api.roamresearch.com/api/graph/" + ROAM_GRAPH_NAME + "/write"

    # Build a block structure: page title with child blocks for each highlight
    children = []
    for h in highlights:
        text = h["text"]
        if h.get("note"):
            text += f"\n    **Note:** {h['note']}"
        if h.get("page_number"):
            text += f" (p. {h['page_number']})"
        children.append({"string": text})

    actions = [
        {
            "action": "create-page",
            "page": {"title": title},
        },
        {
            "action": "batch-actions",
            "actions": [
                {
                    "action": "create-block",
                    "location": {"parent-page": title, "order": i},
                    "block": {"string": child["string"]},
                }
                for i, child in enumerate(children)
            ],
        },
    ]

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            url,
            json={"actions": actions},
            headers={
                "Authorization": f"Bearer {ROAM_API_TOKEN}",
                "Content-Type": "application/json",
            },
            timeout=30,
        )
        if resp.status_code == 200:
            return {"status": "ok", "page_title": title}
        return {"error": f"Roam API error {resp.status_code}: {resp.text}"}


def format_highlights_as_html(book_title: str, book_author: str, highlights: list[dict]) -> str:
    """Format highlights into HTML suitable for Ghost or web display."""
    now = datetime.now(timezone.utc).strftime("%B %d, %Y")
    parts = [
        f"<h2>Highlights from <em>{book_title}</em></h2>",
        f"<p><strong>By {book_author}</strong> &mdash; collected {now}</p>",
        "<hr>",
    ]
    for h in highlights:
        parts.append("<blockquote>")
        parts.append(f"<p>{h['text']}</p>")
        parts.append("</blockquote>")
        meta = []
        if h.get("page_number"):
            meta.append(f"Page {h['page_number']}")
        if h.get("location"):
            meta.append(f"Location {h['location']}")
        if h.get("chapter"):
            meta.append(h["chapter"])
        if meta:
            parts.append(f"<p><small>{' &bull; '.join(meta)}</small></p>")
        if h.get("note"):
            parts.append(f"<p><strong>Note:</strong> {h['note']}</p>")
        parts.append("<br>")
    return "\n".join(parts)

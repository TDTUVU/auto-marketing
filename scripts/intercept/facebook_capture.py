"""
Bắt tất cả Facebook/Meta requests và WebSocket messages.

Chạy:
    mitmdump -s facebook_capture.py --listen-port 8080 --no-http2
"""

import json
import os
from datetime import datetime

from mitmproxy import http

OUTPUT_FILE = os.path.join(os.path.dirname(__file__), "captured_requests.json")

FACEBOOK_HOSTS = (
    "www.facebook.com",
    "web.facebook.com",
    "m.facebook.com",
    "gateway.facebook.com",
    "upload.facebook.com",
    "graph.facebook.com",
)

SKIP_PATHS = (
    "/rsrc.php", "/static/", "favicon",
    ".js", ".css", ".png", ".jpg", ".woff", ".woff2", ".ttf",
)

_captured: list[dict] = []


def _load() -> None:
    global _captured
    if os.path.exists(OUTPUT_FILE):
        try:
            with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
                _captured = json.load(f)
        except Exception:
            _captured = []


def _save() -> None:
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(_captured, f, indent=2, ensure_ascii=False)


_load()


def _parse_body(flow: http.HTTPFlow) -> dict:
    body_text = flow.request.get_text() or ""
    ct = flow.request.headers.get("content-type", "")

    if "application/x-www-form-urlencoded" in ct:
        try:
            from urllib.parse import parse_qs
            qs = parse_qs(body_text)
            parsed = {k: v[0] if len(v) == 1 else v for k, v in qs.items()}
            if "variables" in parsed:
                try:
                    parsed["variables"] = json.loads(parsed["variables"])
                except Exception:
                    pass
            return parsed
        except Exception:
            pass
    elif "application/json" in ct:
        try:
            return json.loads(body_text)
        except Exception:
            pass

    return {"raw": body_text[:800]} if body_text else {}


def request(flow: http.HTTPFlow) -> None:
    host = flow.request.host

    if not any(host == h or host.endswith("." + h.split(".", 1)[-1]) for h in FACEBOOK_HOSTS):
        return
    if flow.request.method in ("GET", "OPTIONS", "HEAD"):
        return

    path = flow.request.path
    if any(skip in path for skip in SKIP_PATHS):
        return

    body = _parse_body(flow)
    doc_id = body.get("doc_id", "")
    friendly_name = flow.request.headers.get("x-fb-friendly-name", "")
    ct = flow.request.headers.get("content-type", "").split(";")[0]

    entry = {
        "type": "http",
        "timestamp": datetime.now().isoformat(),
        "host": host,
        "path": path,
        "method": flow.request.method,
        "friendly_name": friendly_name,
        "doc_id": doc_id,
        "content_type": ct,
        "body": body,
    }

    _captured.append(entry)
    _save()

    label = friendly_name or f"{host}{path[:60]}"
    print(f"\n[HTTP {flow.request.method}] {label}")
    if doc_id:
        print(f"  doc_id      : {doc_id}")
    if isinstance(body.get("variables"), dict):
        print(f"  var keys    : {list(body['variables'].keys())}")
    elif "raw" in body:
        print(f"  body preview: {body['raw'][:120]}")


def websocket_message(flow: http.HTTPFlow) -> None:
    """Bắt WebSocket messages (mitmproxy 12.x API)"""
    if not flow.websocket or not flow.websocket.messages:
        return

    msg = flow.websocket.messages[-1]
    # from_client=True: browser → server (tin nhắn gửi đi — quan trọng hơn)
    if not msg.from_client:
        return

    content = msg.content
    is_binary = isinstance(content, bytes)
    preview = content.hex()[:160] if is_binary else str(content)[:160]

    entry = {
        "type": "websocket",
        "timestamp": datetime.now().isoformat(),
        "host": flow.request.host,
        "direction": "SEND",
        "encoding": "binary" if is_binary else "text",
        "preview": preview,
    }

    _captured.append(entry)
    _save()

    print(f"\n[WS SEND] {flow.request.host}")
    print(f"  hex: {preview[:80]}...")

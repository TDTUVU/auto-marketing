"""
Export Facebook cookies + auth tokens từ Firefox sang session JSON.

Dùng:
    python scripts/export_cookies.py
    python scripts/export_cookies.py --account myshop
    python scripts/export_cookies.py --profile 9k9rxb3j.default-release

Output: sessions/<account>.json
"""

import argparse
import http.cookiejar
import json
import os
import re
import shutil
import sqlite3
import sys
import tempfile
import urllib.request
from datetime import datetime
from pathlib import Path

# ── Config ──────────────────────────────────────────────────────────────────

REQUIRED_COOKIES = {"c_user", "xs", "datr"}
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:151.0) "
    "Gecko/20100101 Firefox/151.0"
)
SESSIONS_DIR = Path(__file__).parent.parent / "sessions"

# ── Firefox profile ──────────────────────────────────────────────────────────

def find_firefox_profile(profile_name: str | None = None) -> Path:
    profiles_dir = Path(os.environ["APPDATA"]) / "Mozilla" / "Firefox" / "Profiles"
    if not profiles_dir.exists():
        print("[!] Không tìm thấy Firefox profiles.")
        sys.exit(1)

    profiles = list(profiles_dir.iterdir())
    if not profiles:
        print("[!] Không có profile nào.")
        sys.exit(1)

    if profile_name:
        match = next((p for p in profiles if p.name == profile_name), None)
        if not match:
            print(f"[!] Không tìm thấy profile '{profile_name}'")
            print(f"    Các profiles: {[p.name for p in profiles]}")
            sys.exit(1)
        return match

    preferred = next((p for p in profiles if "default-release" in p.name), None)
    return preferred or profiles[0]

# ── Cookie extraction ────────────────────────────────────────────────────────

def read_firefox_cookies(profile_path: Path) -> list[dict]:
    db_path = profile_path / "cookies.sqlite"
    if not db_path.exists():
        print(f"[!] Không tìm thấy cookies.sqlite. Hãy đăng nhập Facebook trước.")
        sys.exit(1)

    with tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        shutil.copy2(db_path, tmp_path)
        conn = sqlite3.connect(tmp_path)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute("""
            SELECT host, name, value, path, expiry, isSecure, isHttpOnly
            FROM moz_cookies
            WHERE host LIKE '%facebook.com%'
            ORDER BY host, name
        """)
        rows = [dict(r) for r in cur.fetchall()]
        conn.close()
        return rows
    finally:
        os.unlink(tmp_path)

def validate_session(cookies: list[dict]) -> bool:
    names = {c["name"] for c in cookies}
    missing = REQUIRED_COOKIES - names
    if missing:
        print(f"[!] Thiếu cookies: {missing}. Hãy đăng nhập Facebook trong Firefox.")
        return False
    return True

def extract_user_id(cookies: list[dict]) -> str:
    # i_user = tài khoản đang active khi post (dùng cho actor_id)
    # c_user = tài khoản đăng nhập chính
    cookie_map = {c["name"]: c["value"] for c in cookies}
    return cookie_map.get("i_user") or cookie_map.get("c_user") or "unknown"

def to_session_cookies(cookies: list[dict]) -> list[dict]:
    return [
        {
            "name": c["name"],
            "value": c["value"],
            "domain": c["host"],
            "path": c["path"],
            "expires": c["expiry"] if c["expiry"] else -1,
            "httpOnly": bool(c["isHttpOnly"]),
            "secure": bool(c["isSecure"]),
        }
        for c in cookies
    ]

# ── Token fetch ───────────────────────────────────────────────────────────────

def build_cookie_header(cookies: list[dict]) -> str:
    return "; ".join(f"{c['name']}={c['value']}" for c in cookies)

def extract_token(html: str, patterns: list[str]) -> str | None:
    for pattern in patterns:
        m = re.search(pattern, html)
        if m:
            return m.group(1)
    return None

def fetch_fb_tokens(cookies: list[dict]) -> dict:
    """Dùng urllib (Python built-in) để fetch Facebook homepage và lấy tokens."""
    cookie_header = build_cookie_header(cookies)

    req = urllib.request.Request(
        "https://www.facebook.com/",
        headers={
            "User-Agent": USER_AGENT,
            "Cookie": cookie_header,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
            # Không request compression — nhận HTML thuần để parse dễ hơn
            "Accept-Encoding": "identity",
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none",
            "Sec-Fetch-User": "?1",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            html = resp.read().decode("utf-8", errors="replace")
    except Exception as e:
        print(f"    [!] Không fetch được Facebook: {e}")
        return {}

    fb_dtsg = extract_token(html, [
        r'"DTSGInitialData",\[\],\{"token":"([^"]+)"\}',
        r'"DTSGInitData",\[\],\{"token":"([^"]+)"\}',
        r'name="fb_dtsg"[^>]*value="([^"]+)"',
        r'"fb_dtsg","([^"]+)"',
    ])

    lsd = extract_token(html, [
        r'"LSD",\[\],\{"token":"([^"]+)"\}',
        r'"lsd":"([^"]+)"',
    ])

    rev = extract_token(html, [
        r'"client_revision":(\d+)',
        r'"__rev":(\d+)',
    ])

    hsi = extract_token(html, [
        r'"hsi":"([^"]+)"',
        r'"__hsi":"([^"]+)"',
    ])

    # Lấy USER_ID từ HTML — đây là ID đang active, chính xác hơn cookie
    html_user_id = extract_token(html, [
        r'"USER_ID":"(\d+)"',
        r'"userID":"(\d+)"',
        r'"actorID":"(\d+)"',
        r'"viewerID":"(\d+)"',
    ])

    if not fb_dtsg:
        print("    [!] Không lấy được fb_dtsg — có thể session hết hạn hoặc Facebook yêu cầu xác minh.")
        print(f"    HTML length: {len(html)}, preview: {html[:300]}")
    else:
        print(f"    ✓ fb_dtsg : {fb_dtsg[:25]}...")
    if lsd:
        print(f"    ✓ lsd     : {lsd}")
    if rev:
        print(f"    ✓ rev     : {rev}")
    if html_user_id:
        print(f"    ✓ user_id : {html_user_id} (từ HTML)")

    return {
        "fb_dtsg": fb_dtsg or "",
        "lsd": lsd or "",
        "rev": rev or "",
        "hsi": hsi or "",
        "user_id": html_user_id or "",
    }

# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--account", default="default")
    parser.add_argument("--profile", default=None)
    args = parser.parse_args()

    print(f"\n[1] Tìm Firefox profile...")
    profile = find_firefox_profile(args.profile)
    print(f"    Profile: {profile.name}")

    print(f"[2] Đọc cookies...")
    raw_cookies = read_firefox_cookies(profile)
    print(f"    Tìm thấy {len(raw_cookies)} Facebook cookies")

    if not validate_session(raw_cookies):
        sys.exit(1)

    user_id = extract_user_id(raw_cookies)
    print(f"    User ID : {user_id}")

    print(f"[3] Fetch auth tokens từ Facebook...")
    tokens = fetch_fb_tokens(raw_cookies)

    # Ưu tiên user_id từ HTML (active user) hơn cookie c_user/i_user
    active_user_id = tokens.get("user_id") or user_id
    if tokens.get("user_id") and tokens["user_id"] != user_id:
        print(f"    [i] Dùng user_id từ HTML: {active_user_id} (cookie: {user_id})")

    session = {
        "userId": active_user_id,
        "userAgent": USER_AGENT,
        "lastRefreshed": datetime.now().isoformat(),
        "tokens": tokens,
        "cookies": to_session_cookies(raw_cookies),
    }

    SESSIONS_DIR.mkdir(exist_ok=True)
    out_path = SESSIONS_DIR / f"{args.account}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(session, f, indent=2, ensure_ascii=False)

    if tokens.get("fb_dtsg"):
        print(f"\n[✓] Session đầy đủ đã lưu vào: {out_path}")
    else:
        print(f"\n[~] Session lưu nhưng THIẾU tokens — test:post sẽ dùng fallback fetch")
        print(f"    File: {out_path}")

if __name__ == "__main__":
    main()

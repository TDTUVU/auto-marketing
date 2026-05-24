"""
Xem và phân tích requests đã bắt được.

Chạy: python view_captured.py
"""

import json
import os
import sys

OUTPUT_FILE = os.path.join(os.path.dirname(__file__), "captured_requests.json")


def main() -> None:
    if not os.path.exists(OUTPUT_FILE):
        print("Chưa có request nào được bắt. Hãy chạy mitmproxy trước.")
        return

    with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
        data: list[dict] = json.load(f)

    if not data:
        print("File rỗng.")
        return

    print(f"\n=== Tổng cộng {len(data)} requests đã bắt ===\n")

    # Group theo friendly_name
    groups: dict[str, list[dict]] = {}
    for entry in data:
        name = entry.get("friendly_name", "unknown")
        groups.setdefault(name, []).append(entry)

    for name, entries in groups.items():
        print(f"[{name}] — {len(entries)} lần")

    # Nếu có argument, hiển thị chi tiết action đó
    if len(sys.argv) > 1:
        target = sys.argv[1]
        matches = [e for e in data if e.get("friendly_name") == target]
        if not matches:
            print(f"\nKhông tìm thấy '{target}'")
            return
        latest = matches[-1]
        print(f"\n=== Chi tiết mới nhất: {target} ===")
        print(f"Timestamp : {latest['timestamp']}")
        print(f"\n--- BODY ---")
        print(json.dumps(latest.get("body", {}), indent=2, ensure_ascii=False))
        print(f"\n--- HEADERS ---")
        for k, v in latest.get("headers", {}).items():
            if k.lower() == "cookie":
                print(f"  cookie: [ẩn - {len(v)} chars]")
            else:
                print(f"  {k}: {v}")


if __name__ == "__main__":
    main()

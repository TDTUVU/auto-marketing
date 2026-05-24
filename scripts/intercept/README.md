# Bắt Facebook GraphQL Requests với mitmproxy

## Yêu cầu
- Python 3.10+ và mitmproxy đã cài (`pip install mitmproxy`)
- Firefox (khuyến nghị — dễ cài cert hơn Chrome)

---

## Bước 1: Chạy proxy

Mở terminal, chạy:
```
cd E:\IT\automation\scripts\intercept
mitmdump -s facebook_capture.py --listen-port 8080
```

Để terminal này mở trong suốt quá trình bắt request.

---

## Bước 2: Cài certificate mitmproxy vào browser

### Firefox
1. Cấu hình proxy: Settings → Network Settings → Manual proxy
   - HTTP Proxy: `127.0.0.1` Port: `8080`
   - Check "Use this proxy for HTTPS"
2. Truy cập `http://mitm.it` trong Firefox
3. Click "Firefox" → tải file cert → mở file → Install
4. Tích vào "Trust this CA to identify websites" → OK

### Chrome (nếu cần)
1. Cấu hình proxy qua Windows Settings hoặc dùng extension SwitchyOmega
2. Truy cập `http://mitm.it` → tải cert Windows
3. Mở cert → Install → "Local Machine" → "Trusted Root CAs"

---

## Bước 3: Bắt request

1. Vào `https://www.facebook.com` trong browser đã cài proxy
2. Đăng nhập tài khoản
3. Thực hiện các hành động cần bắt:
   - **Đăng bài:** Click "Bạn đang nghĩ gì?" → nhập text → Đăng
   - **Reply comment:** Click "Phản hồi" dưới comment → nhập → Enter
   - **React bài viết:** Click Like/icon cảm xúc
4. Terminal mitmdump sẽ hiển thị `[✓ CAPTURED] ComposerStoryCreateMutation`

---

## Bước 4: Xem kết quả

```bash
# Xem danh sách đã bắt
python view_captured.py

# Xem chi tiết một action
python view_captured.py ComposerStoryCreateMutation
python view_captured.py useCometUFIReplyMutation
```

---

## Bước 5: Điền vào code

Mở `packages/automation/src/facebook/graphql.ts`, cập nhật:

```typescript
const DOC_IDS = {
  createPost: 'GIÁ_TRỊ_doc_id_TỪ_body',
  replyComment: 'GIÁ_TRỊ_doc_id_TỪ_body',
}
```

Và cập nhật `variables` structure theo đúng body đã bắt được.

---

## Lưu ý

- Đừng commit `captured_requests.json` — có chứa cookie/session
- Cookie hết hạn sau vài giờ/ngày, cần bắt lại nếu gặp lỗi 401
- `doc_id` của Facebook thay đổi khi họ deploy code mới (thường 2-4 tuần/lần)

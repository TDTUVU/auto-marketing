# Chạy Worker trên Laptop cá nhân

Mô hình lai: **Web + Redis + Mongo ở cloud (Railway/Atlas)**, chỉ **worker chạy ở laptop nhà**.

## Tại sao

Request-replay gọi GraphQL Facebook bằng cookie (`c_user`/`xs`/`datr`) + `fb_dtsg` được tạo từ **IP residential VN ở nhà**. Chạy worker trên Railway = **datacenter IP US/EU** → FB thấy phiên nhảy IP + reputation thấp → bắn checkpoint/chặn. Chỉ **worker** cần IP sạch; web/Redis/Mongo ở cloud đâu cũng được.

## 3 điều kiện sống còn

1. **`SESSION_ENCRYPT_KEY` phải GIỐNG HỆT Railway.** Cookie lưu trong Mongo (`Account.encryptedSession`), giải mã bằng key này (`lib/session.ts` → `lib/crypto.ts`). Sai key = "Session not found". Cookie ở DB chứ không phải file → không cần copy session.
2. **`REDIS_URL` phải là URL Redis PUBLIC của Railway** (`xxx.proxy.rlwy.net:port`), KHÔNG phải localhost/private. Laptop chia chung queue với web. Lằng nhằng thì dùng Upstash Redis free.
3. **Chỉ MỘT worker tiêu thụ queue.** Phải tắt/xóa worker service trên Railway — nếu không nửa số job chạy bằng IP datacenter → vẫn bị flag.

## Yêu cầu môi trường laptop

- Node.js >= 20, pnpm >= 9
- Git
- Atlas: thêm IP nhà vào **Network Access** (hoặc `0.0.0.0/0` tạm)

## Các bước

```powershell
# 1. Clone + cài
git clone <repo-url> marketing-automation
cd marketing-automation
pnpm install

# 2. Cài Chromium cho Playwright (metricsWorker + comments cần)
pnpm exec playwright install chromium

# 3. Tạo root .env (xem mẫu dưới)
#    Worker đọc từ ROOT .env, KHÔNG phải apps/web/.env.local

# 4. Chạy thử foreground để xem log
pnpm worker
```

Log mong đợi khi OK:
```
[Worker] Redis ping: PONG
[Worker] post-queue — waiting:... delayed:... active:... failed:...
[PostWorker] Worker ready — listening for jobs
[AutoPilot] Scheduler registered (every 15 min)
```

Nếu `Redis connection FAILED` → sai `REDIS_URL`. Nếu job báo "Session not found" → sai `SESSION_ENCRYPT_KEY`.

## Root `.env` mẫu

```bash
# Lấy y hệt từ Railway Variables
REDIS_URL=redis://default:xxx@xxx.proxy.rlwy.net:port
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/marketing?retryWrites=true&w=majority
SESSION_ENCRYPT_KEY=<COPY Y HỆT TỪ RAILWAY>
OPENAI_API_KEY=sk-proj-...

# Tùy chọn
# METRICS_HEADLESS=false   # bật để thấy browser khi debug metrics
# FB_PAGE_INSIGHTS=1
```

## Chạy 24/7 bằng PM2

Terminal/VS Code không bền (đóng app hoặc máy ngủ là worker chết). Dùng PM2:

```powershell
npm i -g pm2 pm2-windows-startup
pm2-startup install
pm2 start "pnpm worker" --name fb-worker
pm2 save
```

Sau đó tắt sleep của Windows + chỉnh đóng nắp laptop = "Do nothing" (Power Options) để chạy liên tục.

Lệnh PM2 hữu ích:
```powershell
pm2 logs fb-worker      # xem log
pm2 restart fb-worker   # restart sau khi git pull / đổi .env
pm2 status
```

## Cập nhật code mới

```powershell
git pull
pnpm install
pm2 restart fb-worker
```

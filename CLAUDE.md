# Social Media Automation Tool — CLAUDE.md

## Tổng quan dự án

Web tool tự động hóa marketing mạng xã hội (bắt đầu với Facebook), cho phép chủ cửa hàng:
- Đăng bài tự động theo lịch từ ảnh/ý tưởng draft
- LLM tự tạo nội dung phù hợp từng platform
- Tự động reply comment
- **Không dùng Official API** — dùng DOM automation + HTTP request interception/replay

---

## Tech Stack

### Frontend
- **Framework:** Next.js 14 (App Router)
- **UI:** Tailwind CSS + shadcn/ui
- **State:** Zustand (client) + TanStack Query (server state)
- **Language:** TypeScript (strict mode)

### Backend
- **Runtime:** Node.js với Next.js API Routes
- **Queue:** BullMQ + Redis (job scheduling)
- **DB:** MongoDB qua Mongoose
- **LLM:** OpenAI API (`openai` SDK), model mặc định `gpt-4o`

### Automation Layer
- **Browser:** Playwright (headless Chromium) + playwright-extra + puppeteer-extra-plugin-stealth
- **HTTP Client:** httpx (Python) hoặc undici (Node) cho request replay
- **Proxy/Intercept:** mitmproxy để bắt GraphQL request của Facebook

### DevOps
- **Package manager:** pnpm
- **Linting:** ESLint + Prettier
- **Commits:** Conventional Commits (`feat:`, `fix:`, `chore:`)

---

## Kiến trúc thư mục

```
automation/
├── apps/
│   └── web/                    # Next.js app
│       ├── app/
│       │   ├── (dashboard)/    # Authenticated pages
│       │   ├── api/            # API routes
│       │   └── layout.tsx
│       ├── components/
│       ├── lib/
│       │   ├── llm/            # Claude API integration
│       │   ├── db/             # Drizzle schema + queries
│       │   └── queue/          # BullMQ jobs
│       └── ...
├── packages/
│   └── automation/             # Automation engine (platform-agnostic)
│       ├── facebook/
│       │   ├── graphql.ts      # GraphQL request replay
│       │   ├── playwright.ts   # DOM automation fallback
│       │   └── session.ts      # Cookie/session manager
│       └── types.ts
├── scripts/
│   └── intercept/              # mitmproxy scripts để bắt request
├── CLAUDE.md
└── pnpm-workspace.yaml
```

---

## Quy tắc code

### TypeScript
- **Luôn dùng strict mode** — không dùng `any`, dùng `unknown` nếu cần
- Định nghĩa types/interfaces trong file riêng hoặc cùng module
- Dùng `zod` để validate input ở API boundaries
- Không dùng `namespace`, ưu tiên ES modules

### React/Next.js
- Server Components là default, chỉ thêm `"use client"` khi thực sự cần
- Fetch data ở Server Component, không fetch ở Client Component trừ khi dynamic
- Không dùng `useEffect` để fetch — dùng TanStack Query hoặc Server Actions
- Mỗi component chỉ làm một việc (Single Responsibility)

### API Routes
- Luôn validate request body bằng zod schema
- Return consistent JSON: `{ data, error, meta }`
- Không expose internal error messages ra ngoài

### Automation Layer
- Mọi action phải có retry logic (max 3 lần, exponential backoff)
- Rate limit: tối đa 10 actions/phút/tài khoản
- Log tất cả actions với timestamp vào DB
- Session/cookie phải được encrypt khi lưu

### LLM (OpenAI API)
- Dùng `response_format: { type: 'json_object' }` khi cần structured output
- Wrap mọi LLM call trong try/catch với fallback
- Lưu prompt + response vào DB để debug

---

## Workflow phát triển

### Trước khi code một feature mới
1. Mô tả feature ngắn gọn trong chat
2. Claude đề xuất approach + files cần tạo/sửa
3. Xác nhận approach trước khi bắt đầu code
4. Không implement quá scope đã thống nhất

### Khi debug automation
1. Luôn test với `headful` mode trước (thấy browser thật)
2. Xác nhận request đúng bằng mitmproxy trước khi chuyển sang headless
3. Kiểm tra logs trong BullMQ dashboard

### Git workflow
- Branch: `feat/ten-feature`, `fix/ten-bug`
- Commit nhỏ, thường xuyên
- Không commit cookie/session/credentials

---

## Constraints & Quyết định kỹ thuật

| Vấn đề | Quyết định | Lý do |
|--------|-----------|-------|
| Không dùng Facebook API | DOM + request replay | Tránh review process, linh hoạt hơn |
| Playwright thay vì Puppeteer | Playwright | Hỗ trợ tốt hơn, stealth tốt hơn |
| BullMQ thay vì cron | BullMQ | Retry, priority queue, monitoring |
| MongoDB | Mongoose | Schema flexible, phù hợp dữ liệu content |
| OpenAI API cho LLM | openai SDK | GPT-4o, json_object mode |

---

## Facebook-specific Notes

### GraphQL Endpoint
```
POST https://www.facebook.com/api/graphql/
Content-Type: application/x-www-form-urlencoded
```

### Key actions cần bắt request
- [ ] Post bài (text + ảnh)
- [ ] Reply comment
- [ ] Like/React
- [ ] Story post
- [ ] Reels post

### Anti-detection checklist
- [ ] Random delay giữa actions (2-8 giây)
- [ ] Playwright stealth plugin
- [ ] User-Agent thật từ browser thật
- [ ] Không chạy nhiều actions cùng lúc trên 1 account
- [ ] Rotate session cookie định kỳ

---

## Môi trường

```bash
# Required env vars
OPENAI_API_KEY=
MONGODB_URI=
REDIS_URL=
SESSION_ENCRYPT_KEY=   # 32-byte hex key để encrypt cookies
```

---

## Các file quan trọng (sẽ cập nhật khi có)

- `packages/automation/facebook/graphql.ts` — Core Facebook automation
- `apps/web/lib/llm/content.ts` — Content generation logic
- `apps/web/lib/queue/jobs.ts` — BullMQ job definitions
- `apps/web/app/api/posts/route.ts` — Post scheduling API

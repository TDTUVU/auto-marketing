import {
  Globe, Clock, ShieldCheck, Plus,
  Eye, Heart, MessageCircle, Repeat2, Bookmark,
  Download, RotateCcw, Trash2, CheckCircle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

// Trang CLONE — chỉ mô phỏng giao diện + chỉ số của trang Tài khoản thật.
// Toàn bộ dữ liệu là tĩnh (mock), các nút chỉ để hiển thị, không xử lý gì.

const account = {
  name: 'Shop Thời Trang ABC (Clone)',
  ageRange: '25-34',
  categories: ['Quần áo', 'Làm đẹp'],
  pageId: '100xxxxxxxxxxxx',
  total: 42,
  published: 37,
  createdAt: '2026-05-12',
}

const posts = [
  {
    content: 'Bộ sưu tập hè 2026 đã lên kệ! Giảm ngay 20% cho 50 khách đầu tiên. Ghé shop ngay hôm nay nhé cả nhà ❤️',
    account: 'Shop Thời Trang ABC (Clone)',
    time: '10/07/2026 20:00',
    images: 2,
    metrics: { views: 12400, likes: 856, comments: 43, shares: 21, saves: 67 },
  },
  {
    content: 'Cách phối đồ đi làm vừa thanh lịch vừa thoải mái cho ngày hè oi bức ☀️ Lưu lại để dùng dần nha!',
    account: 'Shop Thời Trang ABC (Clone)',
    time: '09/07/2026 12:00',
    images: 4,
    metrics: { views: 8900, likes: 512, comments: 28, shares: 15, saves: 103 },
  },
]

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export default function AccountClonePage() {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Tài khoản — Clone</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Bản sao giao diện (dữ liệu mẫu, nút chỉ để hiển thị)</p>
        </div>
        <Button>
          <Plus className="size-4" />
          Thêm tài khoản
        </Button>
      </div>

      {/* Card tài khoản + chỉ số */}
      <div className="bg-white border border-zinc-200 rounded-xl p-4 flex items-center gap-4 mb-6">
        <div className="size-10 rounded-full bg-zinc-100 flex items-center justify-center shrink-0">
          <Globe className="size-4 text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-zinc-900 text-sm">{account.name}</span>
            <span className="text-xs text-zinc-400">Facebook</span>
            <Badge variant="scheduled">{account.ageRange}</Badge>
            {account.categories.map((c) => (
              <Badge key={c}>{c}</Badge>
            ))}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="inline-flex items-center gap-1 text-xs text-green-600">
              <ShieldCheck className="size-3" />
              Session mã hóa
            </span>
            <span className="text-xs text-zinc-400 ml-2">Page: {account.pageId}</span>
          </div>
        </div>
        <div className="flex gap-4 text-center shrink-0">
          <div>
            <p className="text-lg font-semibold text-zinc-900">{account.total}</p>
            <p className="text-xs text-zinc-400">Tổng bài</p>
          </div>
          <div>
            <p className="text-lg font-semibold text-green-600">{account.published}</p>
            <p className="text-xs text-zinc-400">Đã đăng</p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
            <Clock className="size-3" />
            <span>{new Date(account.createdAt).toLocaleDateString('vi-VN')}</span>
          </div>
          {/* Nút Fetch / Reset / Xóa — chỉ hiển thị */}
          <button
            type="button"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-green-600 hover:bg-green-50 transition-colors"
            title="Fetch dữ liệu"
          >
            <Download className="size-4" />
          </button>
          <button
            type="button"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
            title="Reset"
          >
            <RotateCcw className="size-4" />
          </button>
          <button
            type="button"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-colors"
            title="Xóa tài khoản"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>

      {/* Thông tin bài đăng */}
      <h2 className="text-sm font-semibold text-zinc-700 mb-3">Bài đăng gần đây</h2>
      <div className="space-y-3">
        {posts.map((post, idx) => (
          <div key={idx} className="bg-white border border-zinc-200 rounded-xl p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-zinc-900 line-clamp-2 leading-relaxed">{post.content}</p>
                <div className="flex items-center gap-3 mt-2.5 text-xs text-zinc-500">
                  <span>{post.account}</span>
                  <span>·</span>
                  <span>{post.time}</span>
                  <span>·</span>
                  <span>{post.images} ảnh</span>
                </div>
                {/* Chỉ số (mock MetricsBar) */}
                <div className="flex items-center gap-3 mt-2.5 text-xs text-zinc-500">
                  <span className="flex items-center gap-1" title="Lượt xem">
                    <Eye className="size-3.5" />{fmt(post.metrics.views)}
                  </span>
                  <span className="flex items-center gap-1" title="Lượt thích">
                    <Heart className="size-3.5" />{fmt(post.metrics.likes)}
                  </span>
                  <span className="flex items-center gap-1" title="Bình luận">
                    <MessageCircle className="size-3.5" />{fmt(post.metrics.comments)}
                  </span>
                  <span className="flex items-center gap-1" title="Chia sẻ">
                    <Repeat2 className="size-3.5" />{fmt(post.metrics.shares)}
                  </span>
                  <span className="flex items-center gap-1" title="Lưu">
                    <Bookmark className="size-3.5" />{fmt(post.metrics.saves)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="published">
                  <span className="flex items-center gap-1"><CheckCircle className="size-3.5" />Đã đăng</span>
                </Badge>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

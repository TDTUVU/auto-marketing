'use client'

import { useState } from 'react'
import { Eye, Heart, MessageCircle, Repeat2, Bookmark, RefreshCw } from 'lucide-react'

interface Snapshot {
  views?: number
  likes: number
  comments: number
  shares: number
  saves?: number
  capturedAt?: string | Date
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function MetricsBar({ postId, initial }: { postId: string; initial?: Snapshot }) {
  const [metrics, setMetrics] = useState<Snapshot | undefined>(initial)
  const [loading, setLoading] = useState(false)

  // Lấy snapshot mới nhất từ history
  async function fetchLatest(): Promise<Snapshot | undefined> {
    const res = await fetch(`/api/posts/${postId}/metrics`)
    const json = (await res.json()) as { data: Snapshot[] | null; error: string | null }
    if (!res.ok || json.error || !json.data?.length) return undefined
    return json.data[json.data.length - 1]
  }

  async function refresh() {
    setLoading(true)
    const baseline = metrics?.capturedAt ? new Date(metrics.capturedAt).getTime() : 0
    try {
      const res = await fetch(`/api/posts/${postId}/metrics`, { method: 'POST' })
      const json = (await res.json()) as { error: string | null }
      if (!res.ok || json.error) {
        alert(typeof json.error === 'string' ? json.error : 'Lỗi khi yêu cầu metrics')
        return
      }

      // Worker xử lý bất đồng bộ (Playwright ~vài giây) — poll tới khi có snapshot mới
      for (let i = 0; i < 15; i++) {
        await sleep(3000)
        const latest = await fetchLatest()
        const ts = latest?.capturedAt ? new Date(latest.capturedAt).getTime() : 0
        if (latest && ts > baseline) {
          setMetrics(latest)
          return
        }
      }
      alert('Đang xử lý lâu hơn dự kiến — worker có thể đang bận hoặc chưa chạy. Thử lại sau ít phút.')
    } catch {
      alert('Lỗi kết nối khi lấy metrics')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-3 mt-2.5 text-xs text-zinc-500">
      {metrics ? (
        <>
          {metrics.views != null && (
            <span className="flex items-center gap-1" title="Lượt xem">
              <Eye className="size-3.5" />{fmt(metrics.views)}
            </span>
          )}
          <span className="flex items-center gap-1" title="Lượt thích">
            <Heart className="size-3.5" />{fmt(metrics.likes)}
          </span>
          <span className="flex items-center gap-1" title="Bình luận">
            <MessageCircle className="size-3.5" />{fmt(metrics.comments)}
          </span>
          <span className="flex items-center gap-1" title="Chia sẻ / Retweet">
            <Repeat2 className="size-3.5" />{fmt(metrics.shares)}
          </span>
          {metrics.saves != null && (
            <span className="flex items-center gap-1" title="Lưu">
              <Bookmark className="size-3.5" />{fmt(metrics.saves)}
            </span>
          )}
        </>
      ) : (
        <span className="text-zinc-400">{loading ? 'Đang lấy dữ liệu…' : 'Chưa có dữ liệu'}</span>
      )}
      <button
        onClick={refresh}
        disabled={loading}
        title="Cập nhật metrics"
        className="text-zinc-400 hover:text-sky-500 disabled:opacity-40 transition-colors"
      >
        <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
      </button>
    </div>
  )
}

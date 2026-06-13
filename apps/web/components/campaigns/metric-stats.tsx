import { Eye, Heart, MessageCircle, Repeat2, Bookmark, FileText } from 'lucide-react'

export function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

interface Stats {
  views?: number
  likes: number
  comments: number
  shares: number
  saves?: number
  posts?: number
}

/** Hàng chỉ số read-only (dùng cho campaign — khác MetricsBar có nút refresh). */
export function MetricStats({ stats, showZeroViews = false }: { stats: Stats; showZeroViews?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
      {stats.posts != null && (
        <span className="flex items-center gap-1" title="Số bài">
          <FileText className="size-3.5" />{fmt(stats.posts)}
        </span>
      )}
      {stats.views != null && (stats.views > 0 || showZeroViews) && (
        <span className="flex items-center gap-1" title="Lượt xem">
          <Eye className="size-3.5" />{fmt(stats.views)}
        </span>
      )}
      <span className="flex items-center gap-1" title="Lượt thích">
        <Heart className="size-3.5" />{fmt(stats.likes)}
      </span>
      <span className="flex items-center gap-1" title="Bình luận">
        <MessageCircle className="size-3.5" />{fmt(stats.comments)}
      </span>
      <span className="flex items-center gap-1" title="Chia sẻ / Retweet">
        <Repeat2 className="size-3.5" />{fmt(stats.shares)}
      </span>
      {stats.saves != null && stats.saves > 0 && (
        <span className="flex items-center gap-1" title="Lưu">
          <Bookmark className="size-3.5" />{fmt(stats.saves)}
        </span>
      )}
    </div>
  )
}

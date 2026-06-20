'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  computeAllocation,
  suggestWeights,
  type AllocAccount,
  type PlatformPerf,
} from '@/lib/allocation'

const platformLabel: Record<string, string> = {
  facebook: 'Facebook',
  twitter: 'Twitter / X',
  instagram: 'Instagram',
  tiktok: 'TikTok',
}

interface Props {
  campaignId: string
  accounts: AllocAccount[]
  byPlatform: PlatformPerf[]
  allocation?: { totalPostsPerDay: number; platformWeights: Record<string, number> } | null
}

export function AllocationPanel({ campaignId, accounts, byPlatform, allocation }: Props) {
  const router = useRouter()
  const platforms = useMemo(() => [...new Set(accounts.map((a) => a.platform))], [accounts])
  const suggested = useMemo(() => suggestWeights(platforms, byPlatform), [platforms, byPlatform])

  // Default = 2 bài/account (khớp cadence mặc định của AutoPilot), tối thiểu = số platform
  // để mỗi platform nhận được ít nhất 1 bài, tránh preview mở ra đã lệch 1 platform về 0.
  const [total, setTotal] = useState<number>(
    allocation?.totalPostsPerDay || Math.max(accounts.length * 2, platforms.length)
  )
  const [weights, setWeights] = useState<Record<string, number>>(
    allocation?.platformWeights ?? suggested
  )
  const [loading, setLoading] = useState(false)

  const weightSum = platforms.reduce((s, p) => s + (Number(weights[p]) || 0), 0)
  const preview = useMemo(
    () => computeAllocation(total, weights, accounts),
    [total, weights, accounts]
  )

  function pct(p: string): number {
    if (weightSum <= 0) return 0
    return Math.round(((Number(weights[p]) || 0) / weightSum) * 100)
  }

  async function apply() {
    setLoading(true)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/allocation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ totalPostsPerDay: total, platformWeights: weights }),
      })
      const json = (await res.json()) as { error: string | null }
      if (!res.ok || json.error) {
        alert(json.error ?? 'Không áp dụng được phân bổ')
        return
      }
      router.refresh()
    } catch {
      alert('Lỗi kết nối khi áp dụng phân bổ')
    } finally {
      setLoading(false)
    }
  }

  if (accounts.length === 0) return null

  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-5 mb-8">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <SlidersHorizontal className="size-4" />
          Phân bổ tài nguyên đăng bài
        </h2>
        <Button variant="outline" size="sm" onClick={() => setWeights(suggested)} title="Chia theo hiệu suất engagement/bài">
          <Sparkles className="size-4" />
          Dùng gợi ý
        </Button>
      </div>

      {/* Tổng budget */}
      <div className="flex items-center gap-3 mb-4">
        <label className="text-sm text-zinc-600 whitespace-nowrap">Tổng bài / ngày</label>
        <Input
          type="number"
          min={0}
          max={100}
          value={total}
          onChange={(e) => setTotal(Math.max(0, Number(e.target.value) || 0))}
          className="w-24"
        />
      </div>

      {/* Trọng số platform */}
      <div className="space-y-2 mb-5">
        {platforms.map((p) => (
          <div key={p} className="flex items-center gap-3">
            <span className="text-sm font-medium text-zinc-800 w-28">
              {platformLabel[p] ?? p}
            </span>
            <Input
              type="number"
              min={0}
              value={weights[p] ?? 0}
              onChange={(e) =>
                setWeights((w) => ({ ...w, [p]: Math.max(0, Number(e.target.value) || 0) }))
              }
              className="w-24"
            />
            <span className="text-xs text-zinc-400 w-12 text-right">{pct(p)}%</span>
            {suggested[p] != null && (
              <span className="text-xs text-zinc-400">gợi ý {suggested[p]}%</span>
            )}
          </div>
        ))}
      </div>

      {/* Preview per-account */}
      <div className="border-t border-zinc-100 pt-4">
        <p className="text-xs font-medium text-zinc-500 mb-1">Sẽ áp dụng vào AutoPilot:</p>
        <p className="text-xs text-zinc-400 mb-2">Giờ đăng được gợi ý theo ngành hàng của tài khoản — chỉnh tay được ở trang Auto-pilot.</p>
        <div className="space-y-1.5">
          {preview.map((r) => (
            <div key={r.accountId} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-zinc-800 truncate">
                {r.name}
                <span className="text-zinc-400 ml-2 text-xs">{platformLabel[r.platform] ?? r.platform}</span>
              </span>
              <span className="text-zinc-500 text-xs whitespace-nowrap">
                {r.postsPerDay === 0 ? (
                  <span className="text-zinc-400">tắt</span>
                ) : (
                  <>
                    <span className="font-medium text-zinc-700">{r.postsPerDay} bài/ngày</span>
                    {' · '}
                    {r.postTimes.join(', ')}
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end mt-5">
        <Button size="sm" onClick={apply} loading={loading}>
          Áp dụng vào AutoPilot
        </Button>
      </div>
    </div>
  )
}

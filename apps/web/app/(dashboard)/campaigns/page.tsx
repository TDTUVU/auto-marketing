export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { Plus, Megaphone, ArrowLeft, Calendar } from 'lucide-react'
import { connectDB } from '@/lib/db'
import { Campaign } from '@/lib/db/schema'
import { aggregateCampaign } from '@/lib/campaigns'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MetricStats } from '@/components/campaigns/metric-stats'

const statusMeta: Record<string, { label: string; variant: 'published' | 'scheduled' | 'default' }> = {
  active: { label: 'Đang chạy', variant: 'published' },
  paused: { label: 'Tạm dừng', variant: 'scheduled' },
  ended: { label: 'Đã kết thúc', variant: 'default' },
}

function fmtRange(startAt?: Date, endAt?: Date): string {
  const f = (d: Date) => new Date(d).toLocaleDateString('vi-VN')
  if (startAt && endAt) return `${f(startAt)} – ${f(endAt)}`
  if (startAt) return `Từ ${f(startAt)}`
  if (endAt) return `Đến ${f(endAt)}`
  return 'Toàn bộ thời gian'
}

export default async function CampaignsPage() {
  await connectDB()
  const campaigns = await Campaign.find().sort({ createdAt: -1 }).lean()
  const aggregates = await Promise.all(campaigns.map((c) => aggregateCampaign(c)))

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 transition-colors mb-4"
      >
        <ArrowLeft className="size-4" />
        Trang chủ
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Chiến dịch</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Tổng hợp hiệu quả theo chiến dịch, gom nhiều tài khoản
          </p>
        </div>
        <Link href="/dashboard/campaigns/new">
          <Button>
            <Plus className="size-4" />
            Tạo chiến dịch
          </Button>
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <div className="text-center py-16 text-zinc-400">
          <Megaphone className="size-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Chưa có chiến dịch nào</p>
          <Link href="/dashboard/campaigns/new" className="mt-3 inline-block">
            <Button variant="outline" size="sm">Tạo chiến dịch đầu tiên</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c, i) => {
            const id = c._id.toString()
            const meta = statusMeta[c.status] ?? statusMeta['active']!
            const agg = aggregates[i]!
            return (
              <Link key={id} href={`/dashboard/campaigns/${id}`}>
                <div className="bg-white border border-zinc-200 rounded-xl p-4 hover:border-zinc-300 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="font-semibold text-zinc-900 truncate">{c.name}</h2>
                        <Badge variant={meta.variant}>{meta.label}</Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500">
                        {c.brandName && (
                          <>
                            <span>{c.brandName}</span>
                            <span>·</span>
                          </>
                        )}
                        <span className="flex items-center gap-1">
                          <Calendar className="size-3" />
                          {fmtRange(c.startAt, c.endAt)}
                        </span>
                        <span>·</span>
                        <span>{c.accountIds?.length ?? 0} tài khoản</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-zinc-100">
                    <MetricStats stats={{ ...agg.totals }} />
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

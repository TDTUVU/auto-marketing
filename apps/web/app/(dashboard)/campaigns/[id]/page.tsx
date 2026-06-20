export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Calendar, Pencil, Eye, Heart, MessageCircle, Repeat2, FileText } from 'lucide-react'
import { connectDB } from '@/lib/db'
import { Campaign, Account } from '@/lib/db/schema'
import { aggregateCampaign } from '@/lib/campaigns'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MetricStats, fmt } from '@/components/campaigns/metric-stats'
import { DeleteCampaignBtn } from '@/components/campaigns/delete-campaign-btn'
import { RefreshAllBtn } from '@/components/campaigns/refresh-all-btn'
import { AllocationPanel } from '@/components/campaigns/allocation-panel'
import type { AllocAccount } from '@/lib/allocation'

const statusMeta: Record<string, { label: string; variant: 'published' | 'scheduled' | 'default' }> = {
  active: { label: 'Đang chạy', variant: 'published' },
  paused: { label: 'Tạm dừng', variant: 'scheduled' },
  ended: { label: 'Đã kết thúc', variant: 'default' },
}

const platformLabel: Record<string, string> = {
  facebook: 'Facebook',
  twitter: 'Twitter / X',
  instagram: 'Instagram',
  tiktok: 'TikTok',
}

function fmtRange(startAt?: Date, endAt?: Date): string {
  const f = (d: Date) => new Date(d).toLocaleDateString('vi-VN')
  if (startAt && endAt) return `${f(startAt)} – ${f(endAt)}`
  if (startAt) return `Từ ${f(startAt)}`
  if (endAt) return `Đến ${f(endAt)}`
  return 'Toàn bộ thời gian'
}

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  await connectDB()

  const campaign = await Campaign.findById(id).lean()
  if (!campaign) notFound()

  const agg = await aggregateCampaign(campaign)
  const meta = statusMeta[campaign.status] ?? statusMeta['active']!
  const hasViews = agg.totals.views > 0

  const accountDocs = await Account.find({ _id: { $in: campaign.accountIds ?? [] } })
    .select('_id name platform')
    .lean()
  const allocAccounts: AllocAccount[] = accountDocs.map((a) => ({
    id: a._id.toString(),
    name: a.name,
    platform: a.platform,
  }))
  const allocation = campaign.allocation
    ? {
        totalPostsPerDay: campaign.allocation.totalPostsPerDay,
        platformWeights: (campaign.allocation.platformWeights ?? {}) as Record<string, number>,
      }
    : null

  const totalCards: { label: string; value: number; icon: React.ComponentType<{ className?: string }> }[] = [
    { label: 'Bài đăng', value: agg.totals.posts, icon: FileText },
    ...(hasViews ? [{ label: 'Lượt xem', value: agg.totals.views, icon: Eye }] : []),
    { label: 'Lượt thích', value: agg.totals.likes, icon: Heart },
    { label: 'Bình luận', value: agg.totals.comments, icon: MessageCircle },
    { label: 'Chia sẻ', value: agg.totals.shares, icon: Repeat2 },
  ]

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link
        href="/dashboard/campaigns"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 transition-colors mb-4"
      >
        <ArrowLeft className="size-4" />
        Chiến dịch
      </Link>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-zinc-900 truncate">{campaign.name}</h1>
            <Badge variant={meta.variant}>{meta.label}</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-zinc-500">
            {campaign.brandName && (
              <>
                <span>{campaign.brandName}</span>
                <span>·</span>
              </>
            )}
            <span className="flex items-center gap-1">
              <Calendar className="size-3.5" />
              {fmtRange(campaign.startAt, campaign.endAt)}
            </span>
            <span>·</span>
            <span>{campaign.accountIds?.length ?? 0} tài khoản</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <RefreshAllBtn campaignId={id} />
          <Link href={`/dashboard/campaigns/${id}/edit`}>
            <Button variant="outline" size="sm">
              <Pencil className="size-4" />
              Sửa
            </Button>
          </Link>
          <DeleteCampaignBtn campaignId={id} />
        </div>
      </div>

      {/* Tổng hợp */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {totalCards.map((card) => (
          <div key={card.label} className="bg-white border border-zinc-200 rounded-xl p-4">
            <div className="flex items-center gap-2 text-zinc-500 mb-2">
              <card.icon className="size-4" />
              <span className="text-sm font-medium">{card.label}</span>
            </div>
            <p className="text-2xl font-semibold text-zinc-900">{fmt(card.value)}</p>
          </div>
        ))}
      </div>

      {/* Breakdown theo platform */}
      {agg.byPlatform.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-zinc-900 mb-3">Theo nền tảng</h2>
          <div className="space-y-2">
            {agg.byPlatform.map((p) => (
              <div
                key={p.platform}
                className="bg-white border border-zinc-200 rounded-xl px-4 py-3 flex items-center justify-between gap-4"
              >
                <span className="text-sm font-medium text-zinc-800">
                  {platformLabel[p.platform] ?? p.platform}
                </span>
                <MetricStats stats={{ ...p }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Phân bổ tài nguyên */}
      <AllocationPanel
        campaignId={id}
        accounts={allocAccounts}
        byPlatform={agg.byPlatform}
        allocation={allocation}
      />

      {/* Breakdown theo account */}
      {agg.byAccount.length > 1 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-zinc-900 mb-3">Theo tài khoản</h2>
          <div className="space-y-2">
            {agg.byAccount.map((a) => (
              <div
                key={a.accountId}
                className="bg-white border border-zinc-200 rounded-xl px-4 py-3 flex items-center justify-between gap-4"
              >
                <span className="text-sm font-medium text-zinc-800 truncate">
                  {a.name}
                  <span className="text-zinc-400 font-normal ml-2 text-xs">
                    {platformLabel[a.platform] ?? a.platform}
                  </span>
                </span>
                <MetricStats stats={{ ...a }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Danh sách bài */}
      <div>
        <h2 className="text-sm font-semibold text-zinc-900 mb-3">Bài đăng ({agg.posts.length})</h2>
        {agg.posts.length === 0 ? (
          <div className="text-center py-12 text-zinc-400">
            <p className="text-sm">Chưa có bài đã đăng nào khớp chiến dịch này</p>
          </div>
        ) : (
          <div className="space-y-3">
            {agg.posts.map((post) => (
              <div key={post.id} className="bg-white border border-zinc-200 rounded-xl p-4">
                <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1.5">
                  <span className="font-medium text-zinc-700">{post.accountName}</span>
                  <span>·</span>
                  <span>{platformLabel[post.platform] ?? post.platform}</span>
                  {post.publishedAt && (
                    <>
                      <span>·</span>
                      <span>{new Date(post.publishedAt).toLocaleString('vi-VN')}</span>
                    </>
                  )}
                </div>
                <p className="text-sm text-zinc-900 line-clamp-2 leading-relaxed">{post.content}</p>
                <div className="mt-2.5">
                  {post.metrics ? (
                    <MetricStats stats={post.metrics} />
                  ) : (
                    <span className="text-xs text-zinc-400">Chưa có dữ liệu metrics</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

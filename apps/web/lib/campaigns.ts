import { Types } from 'mongoose'
import { Account, Post, Campaign, AutoPilotConfig } from '@/lib/db/schema'
import type { ICampaign, ICampaignAllocation } from '@/lib/db/schema'
import { computeAllocation, type AllocResult } from '@/lib/allocation'

export interface MetricTotals {
  views: number
  likes: number
  comments: number
  shares: number
  saves: number
  posts: number
}

export interface PlatformBreakdown extends MetricTotals {
  platform: string
}

export interface AccountBreakdown extends MetricTotals {
  accountId: string
  name: string
  platform: string
}

export interface CampaignPostRow {
  id: string
  content: string
  platform: string
  accountName: string
  publishedAt: Date | null
  metrics: {
    views?: number
    likes: number
    comments: number
    shares: number
    saves?: number
  } | null
}

export interface CampaignAggregate {
  totals: MetricTotals
  byPlatform: PlatformBreakdown[]
  byAccount: AccountBreakdown[]
  posts: CampaignPostRow[]
}

function emptyTotals(): MetricTotals {
  return { views: 0, likes: 0, comments: 0, shares: 0, saves: 0, posts: 0 }
}

function endOfDay(d: Date): Date {
  const e = new Date(d)
  e.setHours(23, 59, 59, 999)
  return e
}

/**
 * Gom metrics của 1 campaign: mọi bài đã đăng từ các account được chọn,
 * trong khoảng startAt–endAt (nếu có). Cộng dồn latestMetrics của từng bài.
 */
export async function aggregateCampaign(campaign: ICampaign): Promise<CampaignAggregate> {
  const accountIds = campaign.accountIds ?? []
  if (accountIds.length === 0) {
    return { totals: emptyTotals(), byPlatform: [], byAccount: [], posts: [] }
  }

  const accounts = await Account.find({ _id: { $in: accountIds } })
    .select('_id name platform')
    .lean()
  const accountMap = new Map(
    accounts.map((a) => [a._id.toString(), { name: a.name, platform: a.platform }])
  )

  const published = await Post.find({
    accountId: { $in: accountIds },
    status: 'published',
  })
    .select('content accountId publishedAt createdAt latestMetrics')
    .sort({ publishedAt: -1, createdAt: -1 })
    .lean()

  const start = campaign.startAt ? new Date(campaign.startAt) : null
  const end = campaign.endAt ? endOfDay(new Date(campaign.endAt)) : null

  const totals = emptyTotals()
  const platformAcc = new Map<string, MetricTotals>()
  const accountAcc = new Map<string, MetricTotals>()
  const rows: CampaignPostRow[] = []

  for (const post of published) {
    const when = post.publishedAt ?? post.createdAt
    if (start && when < start) continue
    if (end && when > end) continue

    const acc = accountMap.get(post.accountId.toString())
    const platform = acc?.platform ?? 'unknown'
    const accountName = acc?.name ?? 'Unknown'
    const accountKey = post.accountId.toString()

    const m = post.latestMetrics ?? null
    const views = m?.views ?? 0
    const likes = m?.likes ?? 0
    const comments = m?.comments ?? 0
    const shares = m?.shares ?? 0
    const saves = m?.saves ?? 0

    const add = (t: MetricTotals) => {
      t.views += views
      t.likes += likes
      t.comments += comments
      t.shares += shares
      t.saves += saves
      t.posts += 1
    }

    add(totals)
    if (!platformAcc.has(platform)) platformAcc.set(platform, emptyTotals())
    add(platformAcc.get(platform)!)
    if (!accountAcc.has(accountKey)) accountAcc.set(accountKey, emptyTotals())
    add(accountAcc.get(accountKey)!)

    rows.push({
      id: post._id.toString(),
      content: post.content,
      platform,
      accountName,
      publishedAt: post.publishedAt ?? null,
      metrics: m
        ? {
            ...(m.views != null ? { views: m.views } : {}),
            likes: m.likes,
            comments: m.comments,
            shares: m.shares,
            ...(m.saves != null ? { saves: m.saves } : {}),
          }
        : null,
    })
  }

  const byPlatform: PlatformBreakdown[] = [...platformAcc.entries()]
    .map(([platform, t]) => ({ platform, ...t }))
    .sort((a, b) => b.likes + b.comments + b.shares - (a.likes + a.comments + a.shares))

  const byAccount: AccountBreakdown[] = [...accountAcc.entries()].map(([accountId, t]) => {
    const acc = accountMap.get(accountId)
    return {
      accountId,
      name: acc?.name ?? 'Unknown',
      platform: acc?.platform ?? 'unknown',
      ...t,
    }
  })

  return { totals, byPlatform, byAccount, posts: rows }
}

/**
 * ID các bài đã đăng (có URL) thuộc campaign — để enqueue refresh metrics hàng loạt.
 * Cùng tiêu chí gom như aggregateCampaign, nhưng chỉ lấy bài có platformPostId.
 */
export async function collectCampaignPostIds(campaign: ICampaign): Promise<string[]> {
  const accountIds = campaign.accountIds ?? []
  if (accountIds.length === 0) return []

  const posts = await Post.find({
    accountId: { $in: accountIds },
    status: 'published',
    platformPostId: { $exists: true, $nin: [null, ''] },
  })
    .select('publishedAt createdAt')
    .lean()

  const start = campaign.startAt ? new Date(campaign.startAt) : null
  const end = campaign.endAt ? endOfDay(new Date(campaign.endAt)) : null

  return posts
    .filter((p) => {
      const when = p.publishedAt ?? p.createdAt
      if (start && when < start) return false
      if (end && when > end) return false
      return true
    })
    .map((p) => p._id.toString())
}

const DEFAULT_PER_ACCOUNT = 2

type CampaignLike = {
  _id: Types.ObjectId | string
  accountIds?: (Types.ObjectId | string)[]
  allocation?: ICampaignAllocation | null
  autoReply?: boolean
}

/**
 * Áp phân bổ tài nguyên cho campaign → ghi AutoPilotConfig của từng account
 * (bật autopilot) + lưu allocation lên campaign. Dùng chung cho cả tạo/sửa
 * campaign lẫn panel phân bổ.
 *
 * - `opts` có (từ panel) → dùng total/weights đó.
 * - `opts` không có (tạo/sửa) → dùng allocation cũ, hoặc mặc định:
 *   total = số account × 2, chia đều cho mỗi platform.
 */
export async function applyCampaignAllocation(
  campaign: CampaignLike,
  opts?: { totalPostsPerDay: number; platformWeights: Record<string, number> }
): Promise<AllocResult[]> {
  const accountIds = campaign.accountIds ?? []
  if (accountIds.length === 0) return []

  const accounts = await Account.find({ _id: { $in: accountIds } })
    .select('_id name platform')
    .lean()
  const allocAccounts = accounts.map((a) => ({
    id: a._id.toString(),
    name: a.name,
    platform: a.platform,
  }))
  const platforms = [...new Set(allocAccounts.map((a) => a.platform))]

  let total: number
  let weights: Record<string, number>
  if (opts) {
    total = opts.totalPostsPerDay
    weights = opts.platformWeights
  } else {
    const prev = campaign.allocation
    total = prev?.totalPostsPerDay ?? allocAccounts.length * DEFAULT_PER_ACCOUNT
    const equal = Math.round(100 / Math.max(platforms.length, 1))
    // Giữ trọng số cũ; platform mới (chưa có trong allocation cũ) → chia đều.
    weights = Object.fromEntries(platforms.map((p) => [p, prev?.platformWeights?.[p] ?? equal]))
  }

  // Auto-reply do người tạo campaign quyết định (mặc định bật).
  const autoReplyEnabled = campaign.autoReply ?? true

  const results = computeAllocation(total, weights, allocAccounts)
  for (const r of results) {
    await AutoPilotConfig.findOneAndUpdate(
      { accountId: r.accountId },
      {
        $set: {
          postsPerDay: Math.max(r.postsPerDay, 1),
          postTimes: r.postTimes.length > 0 ? r.postTimes : ['12:00'],
          enabled: r.postsPerDay > 0,
          autoReplyEnabled,
        },
        $setOnInsert: { accountId: r.accountId },
      },
      { upsert: true }
    )
  }

  await Campaign.updateOne(
    { _id: campaign._id },
    { $set: { allocation: { totalPostsPerDay: total, platformWeights: weights, appliedAt: new Date() } } }
  )

  return results
}

/** Tắt autopilot cho các account (vd bị gỡ khỏi campaign). */
export async function disableCampaignAutopilot(
  accountIds: (Types.ObjectId | string)[]
): Promise<void> {
  if (accountIds.length === 0) return
  await AutoPilotConfig.updateMany({ accountId: { $in: accountIds } }, { $set: { enabled: false } })
}

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import {
  FileText, Users, Package, Zap,
  CheckCircle, XCircle, ArrowRight,
} from 'lucide-react'
import { connectDB } from '@/lib/db'
import { Post, Account, Product, AutoPilotConfig, AutomationLog } from '@/lib/db/schema'
import { Badge } from '@/components/ui/badge'

export default async function TwitterOverviewPage() {
  await connectDB()

  const twitterAccounts = await Account.find({ platform: 'twitter' }).select('_id').lean()
  const accountIds = twitterAccounts.map((a) => a._id)

  const [
    totalTweets,
    publishedTweets,
    scheduledTweets,
    failedTweets,
    draftTweets,
    totalProducts,
    activeProducts,
    autopilotEnabled,
  ] = await Promise.all([
    Post.countDocuments({ accountId: { $in: accountIds } }),
    Post.countDocuments({ accountId: { $in: accountIds }, status: 'published' }),
    Post.countDocuments({ accountId: { $in: accountIds }, status: 'scheduled' }),
    Post.countDocuments({ accountId: { $in: accountIds }, status: 'failed' }),
    Post.countDocuments({ accountId: { $in: accountIds }, status: 'draft' }),
    Product.countDocuments({ accountId: { $in: accountIds } }),
    Product.countDocuments({ accountId: { $in: accountIds }, isActive: true }),
    AutoPilotConfig.countDocuments({ accountId: { $in: accountIds }, enabled: true }),
  ])

  const tweetIds = await Post.find({ accountId: { $in: accountIds } }).select('_id').lean()
  const postIds = tweetIds.map((p) => p._id)
  const recentLogs = await AutomationLog.find({ postId: { $in: postIds } })
    .sort({ timestamp: -1 })
    .limit(10)
    .lean()

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-900">Tổng quan Twitter / X</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Tình trạng hệ thống</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border border-zinc-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-zinc-500 mb-2">
            <FileText className="size-4" />
            <span className="text-sm font-medium">Tweets</span>
          </div>
          <p className="text-2xl font-semibold text-zinc-900">{totalTweets}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs">
            <span className="text-green-600">{publishedTweets} đã đăng</span>
            <span className="text-blue-600">{scheduledTweets} đã lên lịch</span>
            {failedTweets > 0 && <span className="text-red-600">{failedTweets} thất bại</span>}
            {draftTweets > 0 && <span className="text-zinc-400">{draftTweets} nháp</span>}
          </div>
        </div>

        <div className="bg-white border border-zinc-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-zinc-500 mb-2">
            <Users className="size-4" />
            <span className="text-sm font-medium">Tài khoản</span>
          </div>
          <p className="text-2xl font-semibold text-zinc-900">{accountIds.length}</p>
          <p className="text-xs text-zinc-400 mt-2">Tài khoản Twitter</p>
        </div>

        <div className="bg-white border border-zinc-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-zinc-500 mb-2">
            <Package className="size-4" />
            <span className="text-sm font-medium">Sản phẩm</span>
          </div>
          <p className="text-2xl font-semibold text-zinc-900">{totalProducts}</p>
          <div className="flex items-center gap-3 mt-2 text-xs">
            <span className="text-green-600">{activeProducts} hoạt động</span>
            <span className="text-zinc-400">{totalProducts - activeProducts} đã tắt</span>
          </div>
        </div>

        <div className="bg-white border border-zinc-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-zinc-500 mb-2">
            <Zap className="size-4" />
            <span className="text-sm font-medium">Auto-pilot</span>
          </div>
          <p className="text-2xl font-semibold text-zinc-900">{autopilotEnabled}</p>
          <div className="mt-2">
            {autopilotEnabled > 0 ? (
              <Badge variant="published">Đang bật</Badge>
            ) : (
              <Badge variant="draft">Chưa bật</Badge>
            )}
          </div>
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-900">Hoạt động gần đây</h2>
        <Link
          href="/dashboard/twitter/logs"
          className="text-xs text-sky-600 hover:text-sky-800 flex items-center gap-1 transition-colors"
        >
          Xem tất cả <ArrowRight className="size-3" />
        </Link>
      </div>

      {recentLogs.length === 0 ? (
        <div className="text-center py-12 text-zinc-400">
          <p className="text-sm">Chưa có hoạt động nào</p>
        </div>
      ) : (
        <div className="space-y-2">
          {recentLogs.map((log) => {
            const id = log._id.toString()
            return (
              <div
                key={id}
                className="bg-white border border-zinc-200 rounded-xl px-4 py-3 flex items-start gap-3"
              >
                <div className="pt-0.5">
                  {log.success ? (
                    <CheckCircle className="size-4 text-green-500" />
                  ) : (
                    <XCircle className="size-4 text-red-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={log.success ? 'published' : 'failed'}>
                      {log.action}
                    </Badge>
                    <span className="text-xs text-zinc-400">
                      {new Date(log.timestamp).toLocaleString('vi-VN')}
                    </span>
                  </div>
                  {log.detail && (
                    <p className="text-sm text-zinc-600 mt-1 line-clamp-2">{log.detail}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

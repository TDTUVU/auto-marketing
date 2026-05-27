export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { Plus, Clock, CheckCircle, XCircle, FileEdit } from 'lucide-react'
import { connectDB } from '@/lib/db'
import { Post, Account } from '@/lib/db/schema'
import { getTrackedPostIds } from '@/lib/queue/jobs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AutoReplyBtn } from '@/components/posts/auto-reply-btn'

const statusIcon = {
  draft: <FileEdit className="size-3.5" />,
  scheduled: <Clock className="size-3.5" />,
  published: <CheckCircle className="size-3.5" />,
  failed: <XCircle className="size-3.5" />,
}

const statusLabel = {
  draft: 'Draft',
  scheduled: 'Đã lên lịch',
  published: 'Đã đăng',
  failed: 'Thất bại',
}

export default async function PostsPage() {
  await connectDB()
  const [posts, trackedIds] = await Promise.all([
    Post.find().sort({ createdAt: -1 }).limit(50).lean(),
    getTrackedPostIds(),
  ])
  const accountIds = [...new Set(posts.map((p) => p.accountId.toString()))]
  const accounts = await Account.find({ _id: { $in: accountIds } }).lean()
  const accountMap = Object.fromEntries(accounts.map((a) => [a._id.toString(), a.name]))

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Bài đăng</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{posts.length} bài tổng cộng</p>
        </div>
        <Link href="/dashboard/posts/new">
          <Button>
            <Plus className="size-4" />
            Tạo bài mới
          </Button>
        </Link>
      </div>

      {posts.length === 0 ? (
        <div className="text-center py-16 text-zinc-400">
          <FileEdit className="size-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Chưa có bài đăng nào</p>
          <Link href="/dashboard/posts/new" className="mt-3 inline-block">
            <Button variant="outline" size="sm">Tạo bài đầu tiên</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => {
            const id = post._id.toString()
            const status = post.status as keyof typeof statusLabel
            return (
              <div key={id} className="bg-white border border-zinc-200 rounded-xl p-4 hover:border-zinc-300 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-900 line-clamp-2 leading-relaxed">
                      {post.content}
                    </p>
                    <div className="flex items-center gap-3 mt-2.5 text-xs text-zinc-500">
                      <span>{accountMap[post.accountId.toString()] ?? 'Unknown'}</span>
                      <span>·</span>
                      <span>
                        {post.scheduledAt
                          ? new Date(post.scheduledAt).toLocaleString('vi-VN')
                          : new Date(post.createdAt).toLocaleString('vi-VN')}
                      </span>
                      {post.imageUrls.length > 0 && (
                        <>
                          <span>·</span>
                          <span>{post.imageUrls.length} ảnh</span>
                        </>
                      )}
                    </div>
                    {post.imageUrls.length > 0 && (
                      <div className="flex gap-1.5 mt-2.5">
                        {post.imageUrls.slice(0, 4).map((img: string, i: number) => (
                          <img
                            key={i}
                            src={`/api/uploads/${img}`}
                            alt=""
                            className="size-14 rounded-lg object-cover border border-zinc-200"
                          />
                        ))}
                        {post.imageUrls.length > 4 && (
                          <div className="size-14 rounded-lg border border-zinc-200 bg-zinc-100 flex items-center justify-center text-xs text-zinc-500">
                            +{post.imageUrls.length - 4}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={status}>
                      <span className="flex items-center gap-1">
                        {statusIcon[status]}
                        {statusLabel[status]}
                      </span>
                    </Badge>
                    {status === 'published' && <AutoReplyBtn postId={id} hasPostUrl={!!post.platformPostId} isTracking={trackedIds.has(id)} />}
                  </div>
                </div>
                {post.errorMessage && (
                  <p className="mt-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-1.5">
                    {post.errorMessage}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

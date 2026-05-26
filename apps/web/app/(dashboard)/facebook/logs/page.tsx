export const dynamic = 'force-dynamic'

import { CheckCircle, XCircle, ScrollText } from 'lucide-react'
import { connectDB } from '@/lib/db'
import { AutomationLog, Post } from '@/lib/db/schema'
import { Badge } from '@/components/ui/badge'

export default async function LogsPage() {
  await connectDB()
  const logs = await AutomationLog.find().sort({ timestamp: -1 }).limit(100).lean()

  const postIds = [...new Set(logs.filter((l) => l.postId).map((l) => l.postId!.toString()))]
  const posts = await Post.find({ _id: { $in: postIds } }).select('content').lean()
  const postMap = Object.fromEntries(
    posts.map((p) => [p._id.toString(), p.content.slice(0, 60)])
  )

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-900">Automation Logs</h1>
        <p className="text-sm text-zinc-500 mt-0.5">{logs.length} log gần nhất</p>
      </div>

      {logs.length === 0 ? (
        <div className="text-center py-16 text-zinc-400">
          <ScrollText className="size-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Chưa có log nào</p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => {
            const id = log._id.toString()
            return (
              <div key={id} className="bg-white border border-zinc-200 rounded-xl px-4 py-3 flex items-start gap-3">
                <div className="pt-0.5">
                  {log.success ? (
                    <CheckCircle className="size-4 text-green-500" />
                  ) : (
                    <XCircle className="size-4 text-red-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={log.success ? 'published' : 'failed'}>{log.action}</Badge>
                    <span className="text-xs text-zinc-400">
                      {new Date(log.timestamp).toLocaleString('vi-VN')}
                    </span>
                  </div>
                  {log.detail && (
                    <p className="text-sm text-zinc-600 mt-1 line-clamp-2">{log.detail}</p>
                  )}
                  {log.postId && postMap[log.postId.toString()] && (
                    <p className="text-xs text-zinc-400 mt-1 truncate">
                      Bài: {postMap[log.postId.toString()]}...
                    </p>
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

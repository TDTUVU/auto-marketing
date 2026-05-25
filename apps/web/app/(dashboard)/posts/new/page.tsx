import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { connectDB } from '@/lib/db'
import { Account } from '@/lib/db/schema'
import { PostForm } from '@/components/posts/post-form'

export default async function NewPostPage() {
  await connectDB()
  const accounts = await Account.find().lean()

  const accountList = accounts.map((a) => ({
    _id: a._id.toString(),
    name: a.name,
    platform: a.platform,
  }))

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link
          href="/dashboard/posts"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 transition-colors mb-4"
        >
          <ArrowLeft className="size-4" />
          Quay lại
        </Link>
        <h1 className="text-xl font-semibold text-zinc-900">Tạo bài đăng mới</h1>
        <p className="text-sm text-zinc-500 mt-1">AI sẽ tự tạo caption từ ý tưởng của bạn</p>
      </div>

      {accountList.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          Chưa có tài khoản nào. Chạy{' '}
          <code className="bg-amber-100 px-1 rounded text-xs">
            pnpm exec tsx --env-file=.env scripts/seed_account.ts
          </code>{' '}
          để thêm tài khoản bkshop.
        </div>
      ) : (
        <div className="bg-white border border-zinc-200 rounded-xl p-6">
          <PostForm accounts={accountList} />
        </div>
      )}
    </div>
  )
}

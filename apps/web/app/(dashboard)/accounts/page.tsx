export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { Globe, Camera, Clock, Users, Plus, ShieldCheck } from 'lucide-react'
import { connectDB } from '@/lib/db'
import { Account, Post } from '@/lib/db/schema'
import { Button } from '@/components/ui/button'
import { DeleteAccountBtn } from '@/components/accounts/delete-account-btn'

const platformIcon = {
  facebook: <Globe className="size-4 text-blue-600" />,
  instagram: <Camera className="size-4 text-pink-600" />,
  tiktok: <span className="text-xs font-bold text-zinc-700">TK</span>,
}

const platformLabel = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
}

export default async function AccountsPage() {
  await connectDB()
  const accounts = await Account.find().lean()

  const statsArr = await Promise.all(
    accounts.map(async (a) => {
      const id = a._id.toString()
      const [total, published] = await Promise.all([
        Post.countDocuments({ accountId: a._id }),
        Post.countDocuments({ accountId: a._id, status: 'published' }),
      ])
      return { id, total, published }
    })
  )
  const statsMap = Object.fromEntries(statsArr.map((s) => [s.id, s]))

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Tài khoản</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{accounts.length} tài khoản đã kết nối</p>
        </div>
        <Link href="/dashboard/accounts/new">
          <Button>
            <Plus className="size-4" />
            Thêm tài khoản
          </Button>
        </Link>
      </div>

      {accounts.length === 0 ? (
        <div className="text-center py-16 text-zinc-400">
          <Users className="size-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Chưa có tài khoản nào</p>
          <Link href="/dashboard/accounts/new" className="mt-3 inline-block">
            <Button variant="outline" size="sm">Thêm tài khoản đầu tiên</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map((account) => {
            const id = account._id.toString()
            const stats = statsMap[id]
            const platform = account.platform as keyof typeof platformLabel
            const hasEncrypted = !!account.encryptedSession
            return (
              <div
                key={id}
                className="bg-white border border-zinc-200 rounded-xl p-4 flex items-center gap-4"
              >
                <div className="size-10 rounded-full bg-zinc-100 flex items-center justify-center shrink-0">
                  {platformIcon[platform] ?? platformIcon.facebook}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-zinc-900 text-sm">{account.name}</span>
                    <span className="text-xs text-zinc-400">{platformLabel[platform]}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {hasEncrypted ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-600">
                        <ShieldCheck className="size-3" />
                        Session mã hóa
                      </span>
                    ) : account.cookiesPath ? (
                      <span className="text-xs text-amber-600">Session file: {account.cookiesPath}</span>
                    ) : (
                      <span className="text-xs text-red-500">Chưa có session</span>
                    )}
                    {account.pageId && (
                      <span className="text-xs text-zinc-400 ml-2">Page: {account.pageId}</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-4 text-center shrink-0">
                  <div>
                    <p className="text-lg font-semibold text-zinc-900">{stats?.total ?? 0}</p>
                    <p className="text-xs text-zinc-400">Tổng bài</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-green-600">{stats?.published ?? 0}</p>
                    <p className="text-xs text-zinc-400">Đã đăng</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                    <Clock className="size-3" />
                    <span>
                      {new Date(account.createdAt).toLocaleDateString('vi-VN')}
                    </span>
                  </div>
                  <DeleteAccountBtn accountId={id} name={account.name} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

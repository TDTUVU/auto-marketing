export const dynamic = 'force-dynamic'

import {
  Globe, Clock, ShieldCheck, Plus, Users,
  Download, RotateCcw, Trash2,
} from 'lucide-react'
import { connectDB } from '@/lib/db'
import { Account, Post } from '@/lib/db/schema'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ageRangeLabel } from '@/lib/taxonomy'

// Trang CLONE — đọc dữ liệu account thật từ DB giống trang Tài khoản,
// nhưng các nút (Fetch / Reset / Xóa) chỉ để hiển thị, không xử lý gì.

export default async function AccountClonePage() {
  await connectDB()
  const accounts = await Account.find({ platform: 'facebook' }).lean()

  const items = await Promise.all(
    accounts.map(async (a) => {
      const [total, published] = await Promise.all([
        Post.countDocuments({ accountId: a._id }),
        Post.countDocuments({ accountId: a._id, status: 'published' }),
      ])
      return {
        id: a._id.toString(),
        name: a.name,
        ageRange: a.ageRange as string | undefined,
        categories: (a.categories ?? []) as string[],
        hasEncrypted: !!a.encryptedSession,
        cookiesPath: a.cookiesPath as string | undefined,
        pageId: a.pageId as string | undefined,
        total,
        published,
        createdAt: new Date(a.createdAt).toISOString(),
      }
    })
  )

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Tài khoản — Clone</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{items.length} tài khoản đã kết nối</p>
        </div>
        <Button>
          <Plus className="size-4" />
          Thêm tài khoản
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-16 text-zinc-400">
          <Users className="size-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Chưa có tài khoản nào</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((account) => (
            <div key={account.id} className="bg-white border border-zinc-200 rounded-xl p-4 flex items-center gap-4">
              <div className="size-10 rounded-full bg-zinc-100 flex items-center justify-center shrink-0">
                <Globe className="size-4 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-zinc-900 text-sm">{account.name}</span>
                  <span className="text-xs text-zinc-400">Facebook</span>
                  {account.ageRange && <Badge variant="scheduled">{ageRangeLabel(account.ageRange)}</Badge>}
                  {account.categories.map((c) => (
                    <Badge key={c}>{c}</Badge>
                  ))}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {account.hasEncrypted ? (
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
                  <p className="text-lg font-semibold text-zinc-900">{account.total}</p>
                  <p className="text-xs text-zinc-400">Tổng bài</p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-green-600">{account.published}</p>
                  <p className="text-xs text-zinc-400">Đã đăng</p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                  <Clock className="size-3" />
                  <span>{new Date(account.createdAt).toLocaleDateString('vi-VN')}</span>
                </div>
                {/* Nút Fetch / Reset / Xóa — chỉ hiển thị, không xử lý */}
                <button
                  type="button"
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-green-600 hover:bg-green-50 transition-colors"
                  title="Fetch dữ liệu"
                >
                  <Download className="size-4" />
                </button>
                <button
                  type="button"
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                  title="Reset"
                >
                  <RotateCcw className="size-4" />
                </button>
                <button
                  type="button"
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                  title="Xóa tài khoản"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

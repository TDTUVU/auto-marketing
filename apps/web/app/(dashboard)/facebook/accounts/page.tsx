export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { Plus } from 'lucide-react'
import { connectDB } from '@/lib/db'
import { Account, Post } from '@/lib/db/schema'
import { Button } from '@/components/ui/button'
import { AccountList, type AccountItem } from '@/components/accounts/account-list'

export default async function AccountsPage() {
  await connectDB()
  const accounts = await Account.find({ platform: 'facebook' }).lean()

  const items: AccountItem[] = await Promise.all(
    accounts.map(async (a) => {
      const [total, published] = await Promise.all([
        Post.countDocuments({ accountId: a._id }),
        Post.countDocuments({ accountId: a._id, status: 'published' }),
      ])
      return {
        id: a._id.toString(),
        name: a.name,
        platform: a.platform,
        ageRange: a.ageRange,
        categories: a.categories ?? [],
        hasEncrypted: !!a.encryptedSession,
        cookiesPath: a.cookiesPath,
        pageId: a.pageId,
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
          <h1 className="text-xl font-semibold text-zinc-900">Tài khoản</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{items.length} tài khoản đã kết nối</p>
        </div>
        <Link href="/dashboard/facebook/accounts/new">
          <Button>
            <Plus className="size-4" />
            Thêm tài khoản
          </Button>
        </Link>
      </div>

      <AccountList accounts={items} addHref="/dashboard/facebook/accounts/new" />
    </div>
  )
}

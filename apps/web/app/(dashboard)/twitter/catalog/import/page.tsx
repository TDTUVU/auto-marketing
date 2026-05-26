export const dynamic = 'force-dynamic'

import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { connectDB } from '@/lib/db'
import { Account } from '@/lib/db/schema'
import { BulkImportForm } from '@/components/catalog/bulk-import-form'

export default async function ImportTwitterCatalogPage() {
  await connectDB()
  const accounts = await Account.find({ platform: 'twitter' }).lean()

  const accountList = accounts.map((a) => ({
    _id: a._id.toString(),
    name: a.name,
    platform: a.platform,
  }))

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <Link
          href="/dashboard/twitter/catalog"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 transition-colors mb-4"
        >
          <ArrowLeft className="size-4" />
          Quay lại
        </Link>
        <h1 className="text-xl font-semibold text-zinc-900">Import sản phẩm từ CSV</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Upload file CSV để thêm nhiều sản phẩm cùng lúc (tối đa 200)
        </p>
      </div>

      {accountList.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          Chưa có tài khoản Twitter nào. Thêm tài khoản trước khi import sản phẩm.
        </div>
      ) : (
        <BulkImportForm accounts={accountList} basePath="/dashboard/twitter" />
      )}
    </div>
  )
}

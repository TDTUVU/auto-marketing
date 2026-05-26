export const dynamic = 'force-dynamic'

import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { connectDB } from '@/lib/db'
import { Account } from '@/lib/db/schema'
import { ProductForm } from '@/components/catalog/product-form'

export default async function NewProductPage() {
  await connectDB()
  const accounts = await Account.find({ platform: 'facebook' }).lean()

  const accountList = accounts.map((a) => ({
    _id: a._id.toString(),
    name: a.name,
    platform: a.platform,
  }))

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link
          href="/dashboard/facebook/catalog"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 transition-colors mb-4"
        >
          <ArrowLeft className="size-4" />
          Quay lại
        </Link>
        <h1 className="text-xl font-semibold text-zinc-900">Thêm sản phẩm mới</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Sản phẩm sẽ được Auto-pilot dùng để tự động tạo bài đăng
        </p>
      </div>

      {accountList.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          Chưa có tài khoản nào. Thêm tài khoản trước khi thêm sản phẩm.
        </div>
      ) : (
        <div className="bg-white border border-zinc-200 rounded-xl p-6">
          <ProductForm accounts={accountList} basePath="/dashboard/facebook" />
        </div>
      )}
    </div>
  )
}

export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { connectDB } from '@/lib/db'
import { Product, Account } from '@/lib/db/schema'
import { ProductForm } from '@/components/catalog/product-form'

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  await connectDB()

  const product = await Product.findById(id).lean()
  if (!product) notFound()

  const accounts = await Account.find({ platform: 'facebook' }).lean()
  const accountList = accounts.map((a) => ({
    _id: a._id.toString(),
    name: a.name,
    platform: a.platform,
  }))

  const initialData = {
    _id: product._id.toString(),
    accountId: product.accountId.toString(),
    name: product.name,
    description: product.description,
    price: product.price,
    category: product.category,
    imageUrls: product.imageUrls,
  }

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
        <h1 className="text-xl font-semibold text-zinc-900">Sửa sản phẩm</h1>
        <p className="text-sm text-zinc-500 mt-1">{product.name}</p>
      </div>

      <div className="bg-white border border-zinc-200 rounded-xl p-6">
        <ProductForm accounts={accountList} initialData={initialData} basePath="/dashboard/facebook" />
      </div>
    </div>
  )
}

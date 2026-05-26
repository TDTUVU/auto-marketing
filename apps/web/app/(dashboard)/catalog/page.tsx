export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { Plus, Upload } from 'lucide-react'
import { connectDB } from '@/lib/db'
import { Product, Account } from '@/lib/db/schema'
import { Button } from '@/components/ui/button'
import { CatalogList } from '@/components/catalog/catalog-list'

export default async function CatalogPage() {
  await connectDB()
  const products = await Product.find().sort({ createdAt: -1 }).lean()
  const accountIds = [...new Set(products.map((p) => p.accountId.toString()))]
  const accounts = await Account.find({ _id: { $in: accountIds } }).lean()
  const accountMap = Object.fromEntries(accounts.map((a) => [a._id.toString(), a.name]))

  const categories = [...new Set(
    products.map((p) => p.category).filter((c): c is string => !!c)
  )].sort()

  const serialized = products.map((p) => ({
    _id: p._id.toString(),
    name: p.name,
    description: p.description,
    imageUrls: p.imageUrls,
    price: p.price,
    category: p.category,
    isActive: p.isActive,
    postCount: p.postCount,
    accountId: p.accountId.toString(),
  }))

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Catalog sản phẩm</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {products.length} sản phẩm — nguồn nội dung cho Auto-pilot
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/catalog/import">
            <Button variant="outline" size="sm">
              <Upload className="size-4" />
              Import CSV
            </Button>
          </Link>
          <Link href="/dashboard/catalog/new">
            <Button>
              <Plus className="size-4" />
              Thêm sản phẩm
            </Button>
          </Link>
        </div>
      </div>

      <CatalogList
        products={serialized}
        accountMap={accountMap}
        categories={categories}
      />
    </div>
  )
}

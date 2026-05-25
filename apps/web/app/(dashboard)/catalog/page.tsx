import Link from 'next/link'
import { Plus, Package, Trash2 } from 'lucide-react'
import { connectDB } from '@/lib/db'
import { Product, Account } from '@/lib/db/schema'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DeleteProductBtn } from '@/components/catalog/delete-product-btn'

export default async function CatalogPage() {
  await connectDB()
  const products = await Product.find().sort({ createdAt: -1 }).lean()
  const accountIds = [...new Set(products.map((p) => p.accountId.toString()))]
  const accounts = await Account.find({ _id: { $in: accountIds } }).lean()
  const accountMap = Object.fromEntries(accounts.map((a) => [a._id.toString(), a.name]))

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Catalog sản phẩm</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {products.length} sản phẩm — nguồn nội dung cho Auto-pilot
          </p>
        </div>
        <Link href="/dashboard/catalog/new">
          <Button>
            <Plus className="size-4" />
            Thêm sản phẩm
          </Button>
        </Link>
      </div>

      {products.length === 0 ? (
        <div className="text-center py-16 text-zinc-400">
          <Package className="size-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Chưa có sản phẩm nào</p>
          <Link href="/dashboard/catalog/new" className="mt-3 inline-block">
            <Button variant="outline" size="sm">Thêm sản phẩm đầu tiên</Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {products.map((product) => {
            const id = product._id.toString()
            return (
              <div
                key={id}
                className="bg-white border border-zinc-200 rounded-xl overflow-hidden hover:border-zinc-300 transition-colors"
              >
                {product.imageUrls.length > 0 && (
                  <div className="flex gap-0.5 h-40 bg-zinc-100">
                    {product.imageUrls.slice(0, 3).map((img: string, i: number) => (
                      <img
                        key={i}
                        src={`/api/uploads/${img}`}
                        alt=""
                        className="flex-1 object-cover min-w-0"
                      />
                    ))}
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-medium text-zinc-900 text-sm truncate">{product.name}</h3>
                      <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{product.description}</p>
                    </div>
                    <DeleteProductBtn productId={id} />
                  </div>

                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    {product.price && (
                      <Badge variant="published">
                        {product.price.toLocaleString('vi-VN')}đ
                      </Badge>
                    )}
                    {product.category && (
                      <Badge variant="scheduled">{product.category}</Badge>
                    )}
                    <span className="text-xs text-zinc-400">
                      {accountMap[product.accountId.toString()] ?? 'Unknown'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-100 text-xs text-zinc-400">
                    <span>Đã đăng {product.postCount} lần</span>
                    <span>
                      {product.isActive ? (
                        <span className="text-green-600">Đang hoạt động</span>
                      ) : (
                        <span className="text-zinc-400">Tắt</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

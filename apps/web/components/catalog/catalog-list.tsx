'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Search, Package, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { DeleteProductBtn } from './delete-product-btn'
import { ToggleActiveBtn } from './toggle-active-btn'

interface Product {
  _id: string
  name: string
  description: string
  imageUrls: string[]
  price?: number
  category?: string
  isActive: boolean
  postCount: number
  accountId: string
}

interface CatalogListProps {
  products: Product[]
  accountMap: Record<string, string>
  categories: string[]
}

export function CatalogList({ products, accountMap, categories }: CatalogListProps) {
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all')

  const filtered = products.filter((p) => {
    const q = search.toLowerCase()
    if (q && !p.name.toLowerCase().includes(q) && !p.description.toLowerCase().includes(q)) return false
    if (categoryFilter && p.category !== categoryFilter) return false
    if (activeFilter === 'active' && !p.isActive) return false
    if (activeFilter === 'inactive' && p.isActive) return false
    return true
  })

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-400" />
          <Input
            placeholder="Tìm sản phẩm..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {categories.length > 0 && (
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Lọc theo danh mục"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Tất cả danh mục</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
        <select
          value={activeFilter}
          onChange={(e) => setActiveFilter(e.target.value as 'all' | 'active' | 'inactive')}
          aria-label="Lọc theo trạng thái"
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">Tất cả trạng thái</option>
          <option value="active">Đang hoạt động</option>
          <option value="inactive">Đã tắt</option>
        </select>
      </div>

      {(search || categoryFilter || activeFilter !== 'all') && (
        <p className="text-xs text-zinc-400 mb-3">
          Hiển thị {filtered.length} / {products.length} sản phẩm
        </p>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-zinc-400">
          <Package className="size-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">
            {products.length === 0 ? 'Chưa có sản phẩm nào' : 'Không tìm thấy sản phẩm phù hợp'}
          </p>
          {products.length === 0 && (
            <Link href="/dashboard/catalog/new" className="mt-3 inline-block">
              <button className="px-3 py-1.5 text-xs rounded-md border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50">
                Thêm sản phẩm đầu tiên
              </button>
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filtered.map((product) => (
            <div
              key={product._id}
              className="bg-white border border-zinc-200 rounded-xl overflow-hidden hover:border-zinc-300 transition-colors"
            >
              {product.imageUrls.length > 0 && (
                <div className="flex gap-0.5 h-40 bg-zinc-100">
                  {product.imageUrls.slice(0, 3).map((img, i) => (
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
                  <div className="flex items-center gap-0.5">
                    <Link
                      href={`/dashboard/catalog/${product._id}/edit`}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-blue-500 hover:bg-blue-50 transition-colors"
                      aria-label="Sửa sản phẩm"
                    >
                      <Pencil className="size-3.5" />
                    </Link>
                    <DeleteProductBtn productId={product._id} />
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  {product.price != null && product.price > 0 && (
                    <Badge variant="published">
                      {product.price.toLocaleString('vi-VN')}đ
                    </Badge>
                  )}
                  {product.category && (
                    <Badge variant="scheduled">{product.category}</Badge>
                  )}
                  <span className="text-xs text-zinc-400">
                    {accountMap[product.accountId] ?? 'Unknown'}
                  </span>
                </div>

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-100 text-xs text-zinc-400">
                  <span>Đã đăng {product.postCount} lần</span>
                  <ToggleActiveBtn productId={product._id} isActive={product.isActive} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, Package, Pencil, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
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

export function CatalogList({ products, accountMap, categories, basePath = '/dashboard/facebook' }: CatalogListProps & { basePath?: string }) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [accountFilter, setAccountFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all')

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState<'selected' | 'all' | null>(null)
  const [deleting, setDeleting] = useState(false)

  const accountOptions = Object.entries(accountMap).sort((a, b) => a[1].localeCompare(b[1]))

  const filtered = products.filter((p) => {
    const q = search.toLowerCase()
    if (q && !p.name.toLowerCase().includes(q) && !p.description.toLowerCase().includes(q)) return false
    if (accountFilter && p.accountId !== accountFilter) return false
    if (categoryFilter && p.category !== categoryFilter) return false
    if (activeFilter === 'active' && !p.isActive) return false
    if (activeFilter === 'inactive' && p.isActive) return false
    return true
  })

  const filteredIds = filtered.map((p) => p._id)
  const allVisibleSelected = filteredIds.length > 0 && filteredIds.every((id) => selected.has(id))

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) {
        filteredIds.forEach((id) => next.delete(id))
      } else {
        filteredIds.forEach((id) => next.add(id))
      }
      return next
    })
  }

  async function deleteIds(ids: string[]) {
    if (ids.length === 0) return
    setDeleting(true)
    try {
      await fetch('/api/products/bulk', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      setSelected(new Set())
      setConfirm(null)
      router.refresh()
    } finally {
      setDeleting(false)
    }
  }

  const confirmIds =
    confirm === 'all' ? products.map((p) => p._id) : Array.from(selected)

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
        {accountOptions.length > 1 && (
          <select
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            aria-label="Lọc theo tài khoản"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Tất cả tài khoản</option>
            {accountOptions.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        )}
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

      {products.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <label className="flex items-center gap-2 text-sm text-zinc-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleAllVisible}
              className="size-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
            />
            Chọn tất cả
          </label>
          {selected.size > 0 && (
            <span className="text-sm text-zinc-500">Đã chọn {selected.size}</span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="destructive"
              size="sm"
              disabled={selected.size === 0}
              onClick={() => setConfirm('selected')}
            >
              <Trash2 className="size-4" />
              Xóa đã chọn{selected.size > 0 ? ` (${selected.size})` : ''}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => setConfirm('all')}
            >
              Xóa toàn bộ
            </Button>
          </div>
        </div>
      )}

      {(search || accountFilter || categoryFilter || activeFilter !== 'all') && (
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
            <Link href={`${basePath}/catalog/new`} className="mt-3 inline-block">
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
              className={`relative bg-white border rounded-xl overflow-hidden transition-colors ${
                selected.has(product._id)
                  ? 'border-blue-400 ring-1 ring-blue-200'
                  : 'border-zinc-200 hover:border-zinc-300'
              }`}
            >
              <label className="absolute top-2 left-2 z-10 flex size-6 items-center justify-center rounded-md bg-white/90 shadow-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.has(product._id)}
                  onChange={() => toggleOne(product._id)}
                  aria-label={`Chọn ${product.name}`}
                  className="size-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                />
              </label>
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
                      href={`${basePath}/catalog/${product._id}/edit`}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-blue-500 hover:bg-blue-50 transition-colors"
                      aria-label="Sửa sản phẩm"
                    >
                      <Pencil className="size-3.5" />
                    </Link>
                    <DeleteProductBtn productId={product._id} productName={product.name} />
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

      <ConfirmDialog
        open={confirm === 'selected'}
        title={`Xóa ${selected.size} sản phẩm đã chọn?`}
        description="Các sản phẩm đã chọn sẽ bị xóa khỏi catalog. Hành động này không thể hoàn tác."
        confirmLabel={`Xóa ${selected.size} sản phẩm`}
        loading={deleting}
        onConfirm={() => deleteIds(confirmIds)}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'all'}
        title="Xóa toàn bộ sản phẩm?"
        description={`Tất cả ${products.length} sản phẩm trong catalog sẽ bị xóa vĩnh viễn. Hành động này không thể hoàn tác.`}
        confirmLabel={`Xóa toàn bộ (${products.length})`}
        loading={deleting}
        onConfirm={() => deleteIds(confirmIds)}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}

'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { ImagePlus, X, Package } from 'lucide-react'

interface Account {
  _id: string
  name: string
  platform: string
}

interface ImagePreview {
  file: File
  url: string
}

export function ProductForm({ accounts }: { accounts: Account[] }) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [images, setImages] = useState<ImagePreview[]>([])
  const [form, setForm] = useState({
    accountId: accounts[0]?._id ?? '',
    name: '',
    description: '',
    price: '',
    category: '',
  })

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    const newPreviews = files.map((file) => ({
      file,
      url: URL.createObjectURL(file),
    }))
    setImages((prev) => [...prev, ...newPreviews])
    if (fileRef.current) fileRef.current.value = ''
  }

  function removeImage(index: number) {
    setImages((prev) => {
      URL.revokeObjectURL(prev[index].url)
      return prev.filter((_, i) => i !== index)
    })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Vui lòng nhập tên sản phẩm'); return }
    if (!form.description.trim()) { setError('Vui lòng nhập mô tả'); return }
    if (!form.accountId) { setError('Vui lòng chọn tài khoản'); return }

    setLoading(true)
    setError('')

    const fd = new FormData()
    fd.append('accountId', form.accountId)
    fd.append('name', form.name.trim())
    fd.append('description', form.description.trim())
    if (form.price) fd.append('price', form.price)
    if (form.category.trim()) fd.append('category', form.category.trim())
    for (const img of images) {
      fd.append('images', img.file)
    }

    try {
      const res = await fetch('/api/products', { method: 'POST', body: fd })
      const json = await res.json() as { data: unknown; error: string | null }
      if (!res.ok || !json.data) {
        setError(json.error ?? 'Có lỗi xảy ra')
        return
      }
      router.push('/dashboard/catalog')
      router.refresh()
    } catch {
      setError('Không thể kết nối server')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="accountId">Tài khoản</Label>
        <select
          id="accountId"
          aria-label="Tài khoản"
          value={form.accountId}
          onChange={(e) => set('accountId', e.target.value)}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {accounts.map((a) => (
            <option key={a._id} value={a._id}>
              {a.name} ({a.platform})
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="name">Tên sản phẩm</Label>
        <Input
          id="name"
          placeholder="VD: Áo thun cotton pastel"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Mô tả</Label>
        <Textarea
          id="description"
          rows={3}
          placeholder="VD: Áo thun cotton 100%, form rộng, nhiều màu pastel, phù hợp mùa hè..."
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
        />
        <p className="text-xs text-zinc-400">AI sẽ dùng mô tả này để tạo caption tự động</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="price">Giá (VNĐ)</Label>
          <Input
            id="price"
            type="number"
            placeholder="150000"
            value={form.price}
            onChange={(e) => set('price', e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="category">Danh mục</Label>
          <Input
            id="category"
            placeholder="VD: Áo, Quần, Phụ kiện"
            value={form.category}
            onChange={(e) => set('category', e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Ảnh sản phẩm</Label>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFiles}
          className="hidden"
          aria-label="Chọn ảnh sản phẩm"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-2 rounded-lg border border-dashed border-zinc-300 px-4 py-3 text-sm text-zinc-500 hover:border-zinc-400 hover:text-zinc-600 transition-colors w-full justify-center"
        >
          <ImagePlus className="size-4" />
          Chọn ảnh từ máy tính
        </button>

        {images.length > 0 && (
          <div className="grid grid-cols-4 gap-2 mt-2">
            {images.map((img, i) => (
              <div key={i} className="relative group">
                <img
                  src={img.url}
                  alt={img.file.name}
                  className="w-full aspect-square object-cover rounded-lg border border-zinc-200"
                />
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  aria-label="Xóa ảnh"
                  className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
      )}

      <div className="flex gap-3 pt-1">
        <Button type="submit" loading={loading} className="flex-1">
          <Package className="size-4" />
          {loading ? 'Đang lưu...' : 'Thêm sản phẩm'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Hủy
        </Button>
      </div>
    </form>
  )
}

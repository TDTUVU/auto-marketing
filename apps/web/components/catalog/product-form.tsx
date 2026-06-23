'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { ImagePlus, X, Package, Save } from 'lucide-react'

interface Account {
  _id: string
  name: string
  platform: string
}

interface ImagePreview {
  file: File
  url: string
}

interface InitialData {
  _id: string
  accountId: string
  name: string
  description: string
  price?: number
  category?: string
  imageUrls: string[]
}

export function ProductForm({
  accounts,
  initialData,
  basePath = '/dashboard/facebook',
}: {
  accounts: Account[]
  initialData?: InitialData
  basePath?: string
}) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const isEdit = !!initialData

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [images, setImages] = useState<ImagePreview[]>([])
  const [existingImages, setExistingImages] = useState<string[]>(initialData?.imageUrls ?? [])
  const [form, setForm] = useState({
    accountId: initialData?.accountId ?? accounts[0]?._id ?? '',
    name: initialData?.name ?? '',
    description: initialData?.description ?? '',
    price: initialData?.price?.toString() ?? '',
    category: initialData?.category ?? '',
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

  function removeNewImage(index: number) {
    setImages((prev) => {
      URL.revokeObjectURL(prev[index].url)
      return prev.filter((_, i) => i !== index)
    })
  }

  function removeExistingImage(index: number) {
    setExistingImages((prev) => prev.filter((_, i) => i !== index))
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

    if (isEdit) {
      fd.append('existingImages', JSON.stringify(existingImages))
    }

    try {
      const url = isEdit ? `/api/products/${initialData._id}` : '/api/products'
      const method = isEdit ? 'PUT' : 'POST'
      const res = await fetch(url, { method, body: fd })
      const json = await res.json() as { data: unknown; error: string | null }
      if (!res.ok || !json.data) {
        setError(json.error ?? 'Có lỗi xảy ra')
        return
      }
      router.push(`${basePath}/catalog`)
      router.refresh()
    } catch {
      setError('Không thể kết nối server')
    } finally {
      setLoading(false)
    }
  }

  const totalImages = existingImages.length + images.length

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
          placeholder="VD: Tên sản phẩm của bạn"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Mô tả</Label>
        <Textarea
          id="description"
          rows={3}
          placeholder="VD: Đặc điểm nổi bật, công dụng, chất liệu/thành phần, đối tượng phù hợp..."
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
            placeholder="VD: Thời trang, Sức khỏe, Đồ ăn, Phụ kiện"
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

        {totalImages > 0 && (
          <div className="grid grid-cols-4 gap-2 mt-2">
            {existingImages.map((filename, i) => (
              <div key={`existing-${filename}`} className="relative group">
                <img
                  src={`/api/uploads/${filename}`}
                  alt=""
                  className="w-full aspect-square object-cover rounded-lg border border-zinc-200"
                />
                <button
                  type="button"
                  onClick={() => removeExistingImage(i)}
                  aria-label="Xóa ảnh"
                  className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
            {images.map((img, i) => (
              <div key={`new-${i}`} className="relative group">
                <img
                  src={img.url}
                  alt={img.file.name}
                  className="w-full aspect-square object-cover rounded-lg border border-blue-200"
                />
                <button
                  type="button"
                  onClick={() => removeNewImage(i)}
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
          {isEdit ? <Save className="size-4" /> : <Package className="size-4" />}
          {loading ? 'Đang lưu...' : isEdit ? 'Cập nhật sản phẩm' : 'Thêm sản phẩm'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Hủy
        </Button>
      </div>
    </form>
  )
}

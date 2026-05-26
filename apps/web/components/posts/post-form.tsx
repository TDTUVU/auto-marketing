'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Sparkles, ImagePlus, X } from 'lucide-react'

interface Account {
  _id: string
  name: string
  platform: string
}

interface ImagePreview {
  file: File
  url: string
}

export function PostForm({ accounts }: { accounts: Account[] }) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [images, setImages] = useState<ImagePreview[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(accounts[0] ? [accounts[0]._id] : [])
  )
  const [form, setForm] = useState({
    idea: '',
    scheduledAt: '',
    tone: 'friendly' as 'friendly' | 'professional' | 'fun',
  })

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function toggleAccount(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selectedIds.size === accounts.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(accounts.map((a) => a._id)))
    }
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
    if (!form.idea.trim()) { setError('Vui lòng nhập ý tưởng bài đăng'); return }
    if (selectedIds.size === 0) { setError('Vui lòng chọn ít nhất 1 tài khoản'); return }

    setLoading(true)
    setError('')

    const ids = Array.from(selectedIds)
    const errors: string[] = []
    let successCount = 0

    for (const accountId of ids) {
      const fd = new FormData()
      fd.append('accountId', accountId)
      fd.append('idea', form.idea.trim())
      fd.append('tone', form.tone)
      if (form.scheduledAt) fd.append('scheduledAt', new Date(form.scheduledAt).toISOString())
      for (const img of images) {
        fd.append('images', img.file)
      }

      try {
        const res = await fetch('/api/posts', { method: 'POST', body: fd })
        const json = await res.json() as { data: unknown; error: unknown }
        if (!res.ok || !json.data) {
          const name = accounts.find((a) => a._id === accountId)?.name ?? accountId
          errors.push(`${name}: ${typeof json.error === 'string' ? json.error : 'Lỗi'}`)
        } else {
          successCount++
        }
      } catch {
        const name = accounts.find((a) => a._id === accountId)?.name ?? accountId
        errors.push(`${name}: Không thể kết nối server`)
      }
    }

    if (errors.length > 0) {
      setError(errors.join('\n'))
    }
    if (successCount > 0) {
      router.push('/dashboard/posts')
      router.refresh()
    }

    setLoading(false)
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {/* Account selection */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Tài khoản</Label>
          {accounts.length > 1 && (
            <button
              type="button"
              onClick={toggleAll}
              className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
            >
              {selectedIds.size === accounts.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
            </button>
          )}
        </div>
        <div className="space-y-1.5">
          {accounts.map((a) => (
            <label
              key={a._id}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                selectedIds.has(a._id)
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-zinc-200 hover:border-zinc-300'
              }`}
            >
              <input
                type="checkbox"
                checked={selectedIds.has(a._id)}
                onChange={() => toggleAccount(a._id)}
                className="size-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-zinc-900">{a.name}</span>
              <span className="text-xs text-zinc-400">{a.platform}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Idea */}
      <div className="space-y-1.5">
        <Label htmlFor="idea">Ý tưởng bài đăng</Label>
        <Textarea
          id="idea"
          rows={4}
          placeholder="VD: Hôm nay shop ra mắt áo thun hè mới, màu pastel, giá chỉ 150k..."
          value={form.idea}
          onChange={(e) => set('idea', e.target.value)}
        />
        <p className="text-xs text-zinc-400">AI sẽ tự tạo caption hoàn chỉnh từ ý tưởng này</p>
      </div>

      {/* Tone */}
      <div className="space-y-1.5">
        <Label htmlFor="tone">Tone</Label>
        <select
          id="tone"
          aria-label="Tone"
          value={form.tone}
          onChange={(e) => set('tone', e.target.value)}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="friendly">Thân thiện</option>
          <option value="professional">Chuyên nghiệp</option>
          <option value="fun">Vui tươi</option>
        </select>
      </div>

      {/* Image Upload */}
      <div className="space-y-1.5">
        <Label>Ảnh đính kèm</Label>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFiles}
          className="hidden"
          aria-label="Chọn ảnh đính kèm"
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
                <p className="text-[10px] text-zinc-400 mt-0.5 truncate">{img.file.name}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Schedule */}
      <div className="space-y-1.5">
        <Label htmlFor="scheduledAt">Thời gian đăng</Label>
        <Input
          id="scheduledAt"
          type="datetime-local"
          value={form.scheduledAt}
          onChange={(e) => set('scheduledAt', e.target.value)}
        />
        <p className="text-xs text-zinc-400">Bỏ trống để đăng ngay</p>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 whitespace-pre-line">{error}</p>
      )}

      <div className="flex gap-3 pt-1">
        <Button type="submit" loading={loading} className="flex-1">
          <Sparkles className="size-4" />
          {loading
            ? 'Đang tạo caption...'
            : selectedIds.size > 1
              ? `Tạo bài cho ${selectedIds.size} tài khoản`
              : 'Tạo bài + lên lịch'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
        >
          Hủy
        </Button>
      </div>
    </form>
  )
}

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
  const [form, setForm] = useState({
    accountId: accounts[0]?._id ?? '',
    idea: '',
    scheduledAt: '',
    tone: 'friendly' as 'friendly' | 'professional' | 'fun',
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
    if (!form.idea.trim()) { setError('Vui long nhap y tuong bai dang'); return }
    if (!form.accountId) { setError('Vui long chon tai khoan'); return }

    setLoading(true)
    setError('')

    const fd = new FormData()
    fd.append('accountId', form.accountId)
    fd.append('idea', form.idea.trim())
    fd.append('tone', form.tone)
    if (form.scheduledAt) fd.append('scheduledAt', new Date(form.scheduledAt).toISOString())
    for (const img of images) {
      fd.append('images', img.file)
    }

    try {
      const res = await fetch('/api/posts', { method: 'POST', body: fd })
      const json = await res.json() as { data: { postId: string } | null; error: unknown }
      if (!res.ok || !json.data) {
        setError(typeof json.error === 'string' ? json.error : 'Co loi xay ra')
        return
      }
      router.push('/dashboard/posts')
      router.refresh()
    } catch {
      setError('Khong the ket noi server')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {/* Account */}
      <div className="space-y-1.5">
        <Label htmlFor="accountId">Tai khoan</Label>
        <select
          id="accountId"
          aria-label="Tai khoan"
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

      {/* Idea */}
      <div className="space-y-1.5">
        <Label htmlFor="idea">Y tuong bai dang</Label>
        <Textarea
          id="idea"
          rows={4}
          placeholder="VD: Hom nay shop ra mat ao thun he moi, mau pastel, gia chi 150k..."
          value={form.idea}
          onChange={(e) => set('idea', e.target.value)}
        />
        <p className="text-xs text-zinc-400">AI se tu tao caption hoan chinh tu y tuong nay</p>
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
          <option value="friendly">Than thien</option>
          <option value="professional">Chuyen nghiep</option>
          <option value="fun">Vui tuoi</option>
        </select>
      </div>

      {/* Image Upload */}
      <div className="space-y-1.5">
        <Label>Anh dinh kem</Label>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFiles}
          className="hidden"
          aria-label="Chon anh dinh kem"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-2 rounded-lg border border-dashed border-zinc-300 px-4 py-3 text-sm text-zinc-500 hover:border-zinc-400 hover:text-zinc-600 transition-colors w-full justify-center"
        >
          <ImagePlus className="size-4" />
          Chon anh tu may tinh
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
                  aria-label="Xoa anh"
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
        <Label htmlFor="scheduledAt">Thoi gian dang</Label>
        <Input
          id="scheduledAt"
          type="datetime-local"
          value={form.scheduledAt}
          onChange={(e) => set('scheduledAt', e.target.value)}
        />
        <p className="text-xs text-zinc-400">Bo trong de dang ngay</p>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
      )}

      <div className="flex gap-3 pt-1">
        <Button type="submit" loading={loading} className="flex-1">
          <Sparkles className="size-4" />
          {loading ? 'Dang tao caption...' : 'Tao bai + len lich'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
        >
          Huy
        </Button>
      </div>
    </form>
  )
}

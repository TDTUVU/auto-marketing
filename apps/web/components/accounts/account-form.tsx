'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { UserPlus } from 'lucide-react'

export function AccountForm({ basePath = '/dashboard/facebook', defaultPlatform = 'facebook' }: { basePath?: string; defaultPlatform?: string } = {}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [form, setForm] = useState({
    name: '',
    platform: defaultPlatform,
    cookieJson: '',
    pageId: '',
  })

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Vui lòng nhập tên tài khoản'); return }
    if (!form.cookieJson.trim()) { setError('Vui lòng paste cookie JSON'); return }

    try {
      JSON.parse(form.cookieJson)
    } catch {
      setError('Cookie JSON không hợp lệ — cần là một JSON array')
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          platform: form.platform,
          cookieJson: form.cookieJson.trim(),
          pageId: form.pageId.trim() || undefined,
          userAgent: navigator.userAgent,
        }),
      })
      const json = await res.json() as { data: { _id: string; userId: string } | null; error: string | null }

      if (!res.ok || !json.data) {
        setError(json.error ?? 'Có lỗi xảy ra')
        return
      }

      setSuccess(`Thêm thành công! User ID: ${json.data.userId}`)
      setTimeout(() => {
        router.push(`${basePath}/accounts`)
        router.refresh()
      }, 1500)
    } catch {
      setError('Không thể kết nối server')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="name">Tên tài khoản</Label>
        <Input
          id="name"
          placeholder="VD: BK Shop"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="platform">Platform</Label>
        <select
          id="platform"
          aria-label="Platform"
          value={form.platform}
          onChange={(e) => set('platform', e.target.value)}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="facebook">Facebook</option>
          <option value="instagram">Instagram</option>
          <option value="tiktok">TikTok</option>
          <option value="twitter">Twitter / X</option>
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cookieJson">Cookie JSON</Label>
        <Textarea
          id="cookieJson"
          rows={8}
          placeholder='Paste cookie từ extension (EditThisCookie, Cookie-Editor...)&#10;Format: [{"name":"c_user","value":"...","domain":".facebook.com",...}, ...]'
          value={form.cookieJson}
          onChange={(e) => set('cookieJson', e.target.value)}
          className="font-mono text-xs"
        />
        <div className="text-xs text-zinc-400 space-y-1">
          <p>Cách lấy cookie:</p>
          <ol className="list-decimal pl-4 space-y-0.5">
            <li>Cài extension <strong>Cookie-Editor</strong> hoặc <strong>EditThisCookie</strong></li>
            <li>Đăng nhập Facebook trên trình duyệt</li>
            <li>Mở extension → Export → Copy JSON</li>
            <li>Paste vào ô trên</li>
          </ol>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="pageId">Page ID (tùy chọn)</Label>
        <Input
          id="pageId"
          placeholder="VD: 123456789 — bỏ trống nếu đăng bằng profile cá nhân"
          value={form.pageId}
          onChange={(e) => set('pageId', e.target.value)}
        />
        <p className="text-xs text-zinc-400">
          Nếu muốn đăng bài lên Page thay vì profile, nhập Page ID tại đây
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
      )}

      {success && (
        <p className="text-sm text-green-600 bg-green-50 rounded-lg px-3 py-2">{success}</p>
      )}

      <div className="flex gap-3 pt-1">
        <Button type="submit" loading={loading} className="flex-1">
          <UserPlus className="size-4" />
          {loading ? 'Đang xác thực cookie...' : 'Thêm tài khoản'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Hủy
        </Button>
      </div>
    </form>
  )
}

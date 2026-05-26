'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'

export function UpdateSessionBtn({ accountId, name }: { accountId: string; name: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [cookieJson, setCookieJson] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function handleUpdate() {
    if (!cookieJson.trim()) { setError('Paste cookie JSON vào'); return }

    try {
      JSON.parse(cookieJson)
    } catch {
      setError('Cookie JSON không hợp lệ')
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const res = await fetch(`/api/accounts/${accountId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cookieJson: cookieJson.trim(),
          userAgent: navigator.userAgent,
        }),
      })
      const json = await res.json() as { data: { updated: boolean } | null; error: string | null }

      if (!res.ok || !json.data) {
        setError(json.error ?? 'Có lỗi xảy ra')
        return
      }

      setSuccess('Cập nhật thành công!')
      setCookieJson('')
      setTimeout(() => {
        setOpen(false)
        setSuccess('')
        router.refresh()
      }, 1500)
    } catch {
      setError('Không thể kết nối server')
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="p-1.5 rounded-lg text-zinc-400 hover:text-blue-500 hover:bg-blue-50 transition-colors"
        title={`Cập nhật cookie cho ${name}`}
      >
        <RefreshCw className="size-4" />
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setOpen(false)}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-zinc-900 mb-1">
          Cập nhật cookie — {name}
        </h3>
        <p className="text-xs text-zinc-500 mb-4">
          Export cookie mới từ Cookie-Editor rồi paste vào đây
        </p>

        <textarea
          rows={8}
          placeholder='[{"name":"c_user","value":"...","domain":".facebook.com",...}, ...]'
          value={cookieJson}
          onChange={(e) => setCookieJson(e.target.value)}
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mt-3">{error}</p>}
        {success && <p className="text-sm text-green-600 bg-green-50 rounded-lg px-3 py-2 mt-3">{success}</p>}

        <div className="flex gap-3 mt-4">
          <button
            onClick={handleUpdate}
            disabled={loading}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Đang cập nhật...' : 'Cập nhật'}
          </button>
          <button
            onClick={() => { setOpen(false); setError(''); setCookieJson('') }}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            Hủy
          </button>
        </div>
      </div>
    </div>
  )
}

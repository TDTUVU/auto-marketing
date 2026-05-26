'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'

export function DeleteAccountBtn({ accountId, name }: { accountId: string; name: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    if (!confirm(`Xóa tài khoản "${name}"? Bài đăng cũ sẽ không bị xóa.`)) return

    setLoading(true)
    try {
      const res = await fetch(`/api/accounts/${accountId}`, { method: 'DELETE' })
      if (res.ok) {
        router.refresh()
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
      title="Xóa tài khoản"
    >
      <Trash2 className="size-4" />
    </button>
  )
}

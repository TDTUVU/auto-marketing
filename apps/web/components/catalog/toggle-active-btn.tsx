'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function ToggleActiveBtn({ productId, isActive }: { productId: string; isActive: boolean }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function toggle() {
    setLoading(true)
    try {
      await fetch(`/api/products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !isActive }),
      })
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
        isActive
          ? 'text-green-700 bg-green-50 hover:bg-green-100'
          : 'text-zinc-500 bg-zinc-100 hover:bg-zinc-200'
      } ${loading ? 'opacity-50' : ''}`}
    >
      {loading ? '...' : isActive ? 'Đang hoạt động' : 'Đã tắt'}
    </button>
  )
}

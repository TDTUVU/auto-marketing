'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

export function DeleteProductBtn({ productId, productName }: { productId: string; productName?: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    setLoading(true)
    try {
      await fetch(`/api/products/${productId}`, { method: 'DELETE' })
      setOpen(false)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Xóa sản phẩm"
        className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
      >
        <Trash2 className="size-3.5" />
      </button>
      <ConfirmDialog
        open={open}
        title="Xóa sản phẩm?"
        description={
          productName
            ? `Sản phẩm "${productName}" sẽ bị xóa khỏi catalog. Hành động này không thể hoàn tác.`
            : 'Sản phẩm sẽ bị xóa khỏi catalog. Hành động này không thể hoàn tác.'
        }
        loading={loading}
        onConfirm={handleDelete}
        onCancel={() => setOpen(false)}
      />
    </>
  )
}

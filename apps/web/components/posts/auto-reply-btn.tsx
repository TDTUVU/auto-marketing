'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { MessageSquare } from 'lucide-react'

export function AutoReplyBtn({ postId }: { postId: string }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')

  async function enable() {
    setStatus('loading')
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId }),
      })
      const json = await res.json() as { error: string | null }
      if (!res.ok || json.error) {
        alert(json.error ?? 'Lỗi không xác định')
        setStatus('error')
      } else {
        setStatus('done')
      }
    } catch {
      setStatus('error')
    }
  }

  if (status === 'done') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
        <MessageSquare className="size-3" /> Đang theo dõi
      </span>
    )
  }

  return (
    <Button
      size="sm"
      variant="outline"
      loading={status === 'loading'}
      onClick={enable}
    >
      <MessageSquare className="size-3" />
      Auto-reply
    </Button>
  )
}

'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MessageSquare, X } from 'lucide-react'

export function AutoReplyBtn({ postId, hasPostUrl }: { postId: string; hasPostUrl: boolean }) {
  const [status, setStatus] = useState<'idle' | 'input' | 'loading' | 'done' | 'error'>('idle')
  const [manualUrl, setManualUrl] = useState('')

  async function enable(postUrl?: string) {
    setStatus('loading')
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, ...(postUrl ? { postUrl } : {}) }),
      })
      const json = await res.json() as { error: string | null }
      if (!res.ok || json.error) {
        alert(typeof json.error === 'string' ? json.error : 'Lỗi không xác định')
        setStatus('error')
      } else {
        setStatus('done')
      }
    } catch {
      setStatus('error')
    }
  }

  function handleClick() {
    if (hasPostUrl) {
      enable()
    } else {
      setStatus('input')
    }
  }

  function submitManualUrl() {
    const url = manualUrl.trim()
    if (!url.includes('facebook.com')) {
      alert('Vui lòng nhập URL bài viết Facebook hợp lệ')
      return
    }
    enable(url)
  }

  if (status === 'done') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
        <MessageSquare className="size-3" /> Đang theo dõi
      </span>
    )
  }

  if (status === 'input') {
    return (
      <div className="flex items-center gap-1.5">
        <Input
          placeholder="Paste URL bài viết Facebook..."
          value={manualUrl}
          onChange={(e) => setManualUrl(e.target.value)}
          className="h-7 text-xs w-56"
        />
        <Button size="sm" variant="outline" onClick={submitManualUrl} className="h-7 px-2 text-xs">
          OK
        </Button>
        <button onClick={() => setStatus('idle')} className="p-1 text-zinc-400 hover:text-zinc-600">
          <X className="size-3" />
        </button>
      </div>
    )
  }

  return (
    <Button
      size="sm"
      variant="outline"
      loading={status === 'loading'}
      onClick={handleClick}
    >
      <MessageSquare className="size-3" />
      Auto-reply
    </Button>
  )
}

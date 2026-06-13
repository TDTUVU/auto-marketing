'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const SETTLED = new Set(['completed', 'failed', 'gone', 'unknown'])

async function jobSettled(jobId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/metrics/job/${jobId}`)
    const json = (await res.json()) as { data: { state: string } | null }
    return SETTLED.has(json.data?.state ?? 'unknown')
  } catch {
    return false
  }
}

export function RefreshAllBtn({ campaignId }: { campaignId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState('')

  async function refreshAll() {
    setLoading(true)
    setProgress('')
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/refresh-metrics`, { method: 'POST' })
      const json = (await res.json()) as { data: { count: number; jobIds: string[] } | null; error: string | null }
      if (!res.ok || json.error || !json.data) {
        alert(json.error ?? 'Không gửi được yêu cầu cập nhật')
        return
      }

      const jobIds = json.data.jobIds.filter(Boolean)
      const total = jobIds.length
      if (total === 0) {
        alert('Không có bài đã đăng nào (có URL) để cập nhật.')
        return
      }

      // Worker concurrency 1 → xử lý tuần tự. Poll tới khi tất cả settled.
      for (let i = 0; i < 80; i++) {
        await sleep(3000)
        const results = await Promise.all(jobIds.map(jobSettled))
        const done = results.filter(Boolean).length
        setProgress(`${done}/${total}`)
        if (done === total) break
        // Sau ~24s chưa job nào xong → worker có thể đang tắt
        if (i >= 8 && done === 0) {
          alert('Worker chưa xử lý job nào (có thể worker local đang tắt). Kiểm tra worker rồi thử lại.')
          break
        }
      }

      router.refresh()
    } catch {
      alert('Lỗi kết nối khi cập nhật metrics')
    } finally {
      setLoading(false)
      setProgress('')
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={refreshAll} loading={loading} title="Cập nhật metrics mọi bài trong chiến dịch">
      {!loading && <RefreshCw className="size-4" />}
      {loading ? `Đang cập nhật ${progress}…` : 'Refresh tất cả'}
    </Button>
  )
}

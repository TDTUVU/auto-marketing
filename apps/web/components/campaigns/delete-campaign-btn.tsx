'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function DeleteCampaignBtn({ campaignId }: { campaignId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function remove() {
    if (!confirm('Xóa chiến dịch này? (Không xóa bài đăng, chỉ xóa nhóm chiến dịch)')) return
    setLoading(true)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, { method: 'DELETE' })
      const json = (await res.json()) as { error: string | null }
      if (!res.ok || json.error) {
        alert(json.error ?? 'Không xóa được chiến dịch')
        return
      }
      router.push('/dashboard/campaigns')
      router.refresh()
    } catch {
      alert('Lỗi kết nối khi xóa')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button variant="destructive" size="sm" onClick={remove} loading={loading}>
      <Trash2 className="size-4" />
      Xóa
    </Button>
  )
}

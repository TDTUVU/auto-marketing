'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Tags } from 'lucide-react'
import { ClassificationFields } from '@/components/accounts/classification-fields'

interface Props {
  accountId: string
  name: string
  ageRange?: string
  categories?: string[]
}

export function ClassifyBtn({ accountId, name, ageRange: initAge, categories: initCats }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [ageRange, setAgeRange] = useState(initAge ?? '')
  const [categories, setCategories] = useState<string[]>(initCats ?? [])

  async function handleSave() {
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const res = await fetch(`/api/accounts/${accountId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ageRange: ageRange || undefined, categories }),
      })
      const json = await res.json() as { data: { updated: boolean } | null; error: string | null }

      if (!res.ok || !json.data) {
        setError(json.error ?? 'Có lỗi xảy ra')
        return
      }

      setSuccess('Đã lưu phân loại!')
      setTimeout(() => {
        setOpen(false)
        setSuccess('')
        router.refresh()
      }, 1000)
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
        title={`Phân loại ${name}`}
      >
        <Tags className="size-4" />
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setOpen(false)}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-zinc-900 mb-4">
          Phân loại — {name}
        </h3>

        <ClassificationFields
          ageRange={ageRange}
          categories={categories}
          onAgeRangeChange={setAgeRange}
          onCategoriesChange={setCategories}
        />

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mt-3">{error}</p>}
        {success && <p className="text-sm text-green-600 bg-green-50 rounded-lg px-3 py-2 mt-3">{success}</p>}

        <div className="flex gap-3 mt-5">
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Đang lưu...' : 'Lưu'}
          </button>
          <button
            onClick={() => { setOpen(false); setError('') }}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            Hủy
          </button>
        </div>
      </div>
    </div>
  )
}

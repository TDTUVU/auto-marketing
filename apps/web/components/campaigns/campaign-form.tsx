'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Megaphone } from 'lucide-react'
import { AGE_RANGES, ageRangeLabel } from '@/lib/taxonomy'

export interface AccountOption {
  _id: string
  name: string
  platform: string
  ageRange?: string
  categories?: string[]
}

export interface CampaignInitial {
  _id: string
  name: string
  brandName?: string
  status: string
  accountIds: string[]
  startAt?: string
  endAt?: string
  autoReply?: boolean
}

const platformLabel: Record<string, string> = {
  facebook: 'Facebook',
  twitter: 'Twitter / X',
  instagram: 'Instagram',
  tiktok: 'TikTok',
}

function toDateInput(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

function todayInput(): string {
  const d = new Date()
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

export function CampaignForm({
  accounts,
  campaign,
}: {
  accounts: AccountOption[]
  campaign?: CampaignInitial
}) {
  const router = useRouter()
  const isEdit = !!campaign
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    name: campaign?.name ?? '',
    brandName: campaign?.brandName ?? '',
    status: campaign?.status ?? 'active',
    startAt: campaign ? toDateInput(campaign.startAt) : todayInput(),
    endAt: toDateInput(campaign?.endAt),
  })
  const [accountIds, setAccountIds] = useState<string[]>(campaign?.accountIds ?? [])
  const [autoReply, setAutoReply] = useState<boolean>(campaign?.autoReply ?? true)
  const [ageFilter, setAgeFilter] = useState('')
  const [catFilter, setCatFilter] = useState('')

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function toggleAccount(id: string) {
    setAccountIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) {
      setError('Vui lòng nhập tên chiến dịch')
      return
    }
    if (accountIds.length === 0) {
      setError('Chọn ít nhất 1 tài khoản')
      return
    }
    if (form.startAt && form.endAt && form.startAt > form.endAt) {
      setError('Ngày kết thúc phải sau ngày bắt đầu')
      return
    }

    setLoading(true)
    setError('')
    try {
      const url = isEdit ? `/api/campaigns/${campaign._id}` : '/api/campaigns'
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          brandName: form.brandName.trim() || undefined,
          status: form.status,
          accountIds,
          autoReply,
          startAt: form.startAt || undefined,
          endAt: form.endAt || undefined,
        }),
      })
      const json = (await res.json()) as { data: { _id?: string } | null; error: string | null }
      if (!res.ok || json.error) {
        setError(json.error ?? 'Có lỗi xảy ra')
        return
      }
      const id = isEdit ? campaign._id : json.data?._id
      router.push(id ? `/dashboard/campaigns/${id}` : '/dashboard/campaigns')
      router.refresh()
    } catch {
      setError('Không thể kết nối server')
    } finally {
      setLoading(false)
    }
  }

  const presentCategories = useMemo(() => {
    const s = new Set<string>()
    accounts.forEach((a) => (a.categories ?? []).forEach((c) => s.add(c)))
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'vi'))
  }, [accounts])

  const presentAges = useMemo(() => {
    const s = new Set<string>()
    accounts.forEach((a) => { if (a.ageRange) s.add(a.ageRange) })
    return AGE_RANGES.filter((a) => s.has(a.value))
  }, [accounts])

  const filteredAccounts = accounts.filter((a) => {
    if (ageFilter && a.ageRange !== ageFilter) return false
    if (catFilter && !(a.categories ?? []).includes(catFilter)) return false
    return true
  })

  const grouped = filteredAccounts.reduce<Record<string, AccountOption[]>>((acc, a) => {
    ;(acc[a.platform] ??= []).push(a)
    return acc
  }, {})

  const hasClassification = presentAges.length > 0 || presentCategories.length > 0
  const filteredIds = filteredAccounts.map((a) => a._id)
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => accountIds.includes(id))

  function toggleAllFiltered() {
    if (allFilteredSelected) {
      setAccountIds((prev) => prev.filter((id) => !filteredIds.includes(id)))
    } else {
      setAccountIds((prev) => Array.from(new Set([...prev, ...filteredIds])))
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="name">Tên chiến dịch</Label>
        <Input
          id="name"
          placeholder="VD: Hè 2026"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="brandName">Nhãn hàng (tùy chọn)</Label>
        <Input
          id="brandName"
          placeholder="VD: BK Shop"
          value={form.brandName}
          onChange={(e) => set('brandName', e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="startAt">Ngày bắt đầu</Label>
          <Input id="startAt" type="date" value={form.startAt} onChange={(e) => set('startAt', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="endAt">Ngày kết thúc</Label>
          <Input id="endAt" type="date" value={form.endAt} onChange={(e) => set('endAt', e.target.value)} />
        </div>
      </div>
      <p className="text-xs text-zinc-400 -mt-3">
        Để trống ngày = gom toàn bộ bài đã đăng của các tài khoản được chọn.
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="status">Trạng thái</Label>
        <select
          id="status"
          aria-label="Trạng thái"
          value={form.status}
          onChange={(e) => set('status', e.target.value)}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="active">Đang chạy</option>
          <option value="paused">Tạm dừng</option>
          <option value="ended">Đã kết thúc</option>
        </select>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Tài khoản tham gia</Label>
          {accountIds.length > 0 && (
            <span className="text-xs text-zinc-400">{accountIds.length} đã chọn</span>
          )}
        </div>

        {accounts.length === 0 ? (
          <p className="text-sm text-zinc-400">Chưa có tài khoản nào — thêm tài khoản trước.</p>
        ) : (
          <>
            {hasClassification && (
              <div className="flex flex-wrap items-center gap-2 pb-1">
                <select
                  aria-label="Lọc theo độ tuổi"
                  value={ageFilter}
                  onChange={(e) => setAgeFilter(e.target.value)}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Mọi độ tuổi</option>
                  {presentAges.map((a) => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </select>

                <select
                  aria-label="Lọc theo ngành hàng"
                  value={catFilter}
                  onChange={(e) => setCatFilter(e.target.value)}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Mọi ngành hàng</option>
                  {presentCategories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>

                {filteredIds.length > 0 && (
                  <button
                    type="button"
                    onClick={toggleAllFiltered}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    {allFilteredSelected ? 'Bỏ chọn tất cả' : `Chọn tất cả (${filteredIds.length})`}
                  </button>
                )}

                {(ageFilter || catFilter) && (
                  <button
                    type="button"
                    onClick={() => { setAgeFilter(''); setCatFilter('') }}
                    className="text-xs text-zinc-400 hover:text-zinc-600"
                  >
                    Xóa lọc
                  </button>
                )}
              </div>
            )}

            {filteredAccounts.length === 0 ? (
              <p className="text-sm text-zinc-400">Không có tài khoản khớp bộ lọc.</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(grouped).map(([platform, accs]) => (
                  <div key={platform}>
                    <p className="text-xs font-medium text-zinc-500 mb-1.5">
                      {platformLabel[platform] ?? platform}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {accs.map((a) => (
                        <label
                          key={a._id}
                          className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm cursor-pointer hover:bg-zinc-50"
                        >
                          <input
                            type="checkbox"
                            checked={accountIds.includes(a._id)}
                            onChange={() => toggleAccount(a._id)}
                            className="size-4 shrink-0"
                          />
                          <span className="truncate">{a.name}</span>
                          <span className="flex flex-wrap gap-1 ml-auto shrink-0">
                            {a.ageRange && <Badge variant="scheduled">{ageRangeLabel(a.ageRange)}</Badge>}
                            {(a.categories ?? []).map((c) => (
                              <Badge key={c}>{c}</Badge>
                            ))}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={autoReply}
            onChange={(e) => setAutoReply(e.target.checked)}
            className="size-4"
          />
          <span className="font-medium text-zinc-800">Tự động trả lời comment</span>
        </label>
        <p className="text-xs text-zinc-400">
          Bài do autopilot đăng trong chiến dịch sẽ tự động reply comment (dùng catalog của tài khoản).
        </p>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex gap-3 pt-1">
        <Button type="submit" loading={loading} className="flex-1">
          <Megaphone className="size-4" />
          {isEdit ? 'Lưu thay đổi' : 'Tạo chiến dịch'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Hủy
        </Button>
      </div>
    </form>
  )
}

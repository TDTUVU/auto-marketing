'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Globe, Camera, Clock, Users, ShieldCheck } from 'lucide-react'
import { TwitterIcon } from '@/components/icons/brand-icons'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DeleteAccountBtn } from '@/components/accounts/delete-account-btn'
import { UpdateSessionBtn } from '@/components/accounts/update-session-btn'
import { ClassifyBtn } from '@/components/accounts/classify-btn'
import { AGE_RANGES, ageRangeLabel } from '@/lib/taxonomy'

export interface AccountItem {
  id: string
  name: string
  platform: string
  ageRange?: string
  categories: string[]
  hasEncrypted: boolean
  cookiesPath?: string
  pageId?: string
  total: number
  published: number
  createdAt: string
}

const platformIcon: Record<string, React.ReactNode> = {
  facebook: <Globe className="size-4 text-blue-600" />,
  instagram: <Camera className="size-4 text-pink-600" />,
  tiktok: <span className="text-xs font-bold text-zinc-700">TK</span>,
  twitter: <TwitterIcon className="size-4 text-sky-500" />,
}

const platformLabel: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  twitter: 'Twitter / X',
}

const iconBg: Record<string, string> = {
  facebook: 'bg-zinc-100',
  instagram: 'bg-pink-100',
  tiktok: 'bg-zinc-100',
  twitter: 'bg-sky-100',
}

export function AccountList({
  accounts,
  addHref,
  postUnit = 'Tổng bài',
  emptyText = 'Chưa có tài khoản nào',
}: {
  accounts: AccountItem[]
  addHref: string
  postUnit?: string
  emptyText?: string
}) {
  const [ageFilter, setAgeFilter] = useState('')
  const [catFilter, setCatFilter] = useState('')

  const presentCategories = useMemo(() => {
    const set = new Set<string>()
    accounts.forEach((a) => a.categories.forEach((c) => set.add(c)))
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'))
  }, [accounts])

  const presentAges = useMemo(() => {
    const set = new Set<string>()
    accounts.forEach((a) => { if (a.ageRange) set.add(a.ageRange) })
    return AGE_RANGES.filter((a) => set.has(a.value))
  }, [accounts])

  const filtered = accounts.filter((a) => {
    if (ageFilter && a.ageRange !== ageFilter) return false
    if (catFilter && !a.categories.includes(catFilter)) return false
    return true
  })

  if (accounts.length === 0) {
    return (
      <div className="text-center py-16 text-zinc-400">
        <Users className="size-10 mx-auto mb-3 opacity-40" />
        <p className="text-sm">{emptyText}</p>
        <Link href={addHref} className="mt-3 inline-block">
          <Button variant="outline" size="sm">Thêm tài khoản đầu tiên</Button>
        </Link>
      </div>
    )
  }

  const hasFilters = presentAges.length > 0 || presentCategories.length > 0

  return (
    <div className="space-y-3">
      {hasFilters && (
        <div className="flex flex-wrap items-center gap-2">
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

          {(ageFilter || catFilter) && (
            <>
              <span className="text-xs text-zinc-400">{filtered.length} kết quả</span>
              <button
                onClick={() => { setAgeFilter(''); setCatFilter('') }}
                className="text-xs text-blue-600 hover:underline"
              >
                Xóa lọc
              </button>
            </>
          )}
        </div>
      )}

      {filtered.map((account) => (
        <div key={account.id} className="bg-white border border-zinc-200 rounded-xl p-4 flex items-center gap-4">
          <div className={`size-10 rounded-full ${iconBg[account.platform] ?? 'bg-zinc-100'} flex items-center justify-center shrink-0`}>
            {platformIcon[account.platform] ?? platformIcon.facebook}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-zinc-900 text-sm">{account.name}</span>
              <span className="text-xs text-zinc-400">{platformLabel[account.platform] ?? account.platform}</span>
              {account.ageRange && <Badge variant="scheduled">{ageRangeLabel(account.ageRange)}</Badge>}
              {account.categories.map((c) => (
                <Badge key={c}>{c}</Badge>
              ))}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              {account.hasEncrypted ? (
                <span className="inline-flex items-center gap-1 text-xs text-green-600">
                  <ShieldCheck className="size-3" />
                  Session mã hóa
                </span>
              ) : account.cookiesPath ? (
                <span className="text-xs text-amber-600">Session file: {account.cookiesPath}</span>
              ) : (
                <span className="text-xs text-red-500">Chưa có session</span>
              )}
              {account.pageId && (
                <span className="text-xs text-zinc-400 ml-2">Page: {account.pageId}</span>
              )}
            </div>
          </div>
          <div className="flex gap-4 text-center shrink-0">
            <div>
              <p className="text-lg font-semibold text-zinc-900">{account.total}</p>
              <p className="text-xs text-zinc-400">{postUnit}</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-green-600">{account.published}</p>
              <p className="text-xs text-zinc-400">Đã đăng</p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-1.5 text-xs text-zinc-400">
              <Clock className="size-3" />
              <span>{new Date(account.createdAt).toLocaleDateString('vi-VN')}</span>
            </div>
            <ClassifyBtn
              accountId={account.id}
              name={account.name}
              ageRange={account.ageRange}
              categories={account.categories}
            />
            <UpdateSessionBtn accountId={account.id} name={account.name} />
            <DeleteAccountBtn accountId={account.id} name={account.name} />
          </div>
        </div>
      ))}
    </div>
  )
}

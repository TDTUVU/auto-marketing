'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'
import { Zap, X, Plus, MessageSquare } from 'lucide-react'

interface Account {
  _id: string
  name: string
  platform: string
}

interface Config {
  accountId: string
  enabled: boolean
  postsPerDay: number
  postTimes: string[]
  tone: 'friendly' | 'professional' | 'fun'
  minIntervalDays: number
  categories: string[]
  autoReplyEnabled: boolean
  replyTone: 'friendly' | 'professional' | 'fun'
  skipSpam: boolean
}

export function AutoPilotConfigForm({
  accounts,
  existingConfigs,
  productCount,
}: {
  accounts: Account[]
  existingConfigs: Record<string, Config>
  productCount: Record<string, number>
}) {
  const router = useRouter()
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState('')

  const [configs, setConfigs] = useState<Record<string, Config>>(() => {
    const initial: Record<string, Config> = {}
    for (const acc of accounts) {
      initial[acc._id] = existingConfigs[acc._id] ?? {
        accountId: acc._id,
        enabled: false,
        postsPerDay: 2,
        postTimes: ['09:00', '19:00'],
        tone: 'friendly' as const,
        minIntervalDays: 7,
        categories: [],
        autoReplyEnabled: false,
        replyTone: 'friendly' as const,
        skipSpam: true,
      }
    }
    return initial
  })

  function updateConfig(accountId: string, field: string, value: unknown) {
    setConfigs((prev) => ({
      ...prev,
      [accountId]: { ...prev[accountId], [field]: value },
    }))
  }

  function addTime(accountId: string) {
    const current = configs[accountId].postTimes
    if (current.length >= 10) return
    updateConfig(accountId, 'postTimes', [...current, '12:00'])
  }

  function removeTime(accountId: string, index: number) {
    const current = configs[accountId].postTimes
    if (current.length <= 1) return
    updateConfig(accountId, 'postTimes', current.filter((_, i) => i !== index))
  }

  function setTime(accountId: string, index: number, value: string) {
    const current = [...configs[accountId].postTimes]
    current[index] = value
    updateConfig(accountId, 'postTimes', current)
  }

  async function save(accountId: string) {
    setSaving(accountId)
    setError('')

    try {
      const res = await fetch('/api/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configs[accountId]),
      })
      const json = await res.json() as { error: string | null }
      if (!res.ok || json.error) {
        setError(json.error ?? 'Có lỗi xảy ra')
      } else {
        router.refresh()
      }
    } catch {
      setError('Không thể kết nối server')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="space-y-6">
      {accounts.map((acc) => {
        const config = configs[acc._id]
        const count = productCount[acc._id] ?? 0

        return (
          <div
            key={acc._id}
            className={`bg-white border rounded-xl p-5 transition-colors ${
              config.enabled ? 'border-green-300 bg-green-50/30' : 'border-zinc-200'
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-medium text-zinc-900 text-sm">{acc.name}</h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {count} sản phẩm trong catalog
                  {count === 0 && (
                    <>
                      {' — '}
                      <Link href="/dashboard/catalog/new" className="text-blue-600 hover:underline">
                        Thêm sản phẩm
                      </Link>
                    </>
                  )}
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer" aria-label={`Bật auto-pilot cho ${acc.name}`}>
                <input
                  type="checkbox"
                  checked={config.enabled}
                  onChange={(e) => updateConfig(acc._id, 'enabled', e.target.checked)}
                  disabled={count === 0}
                  className="sr-only peer"
                  aria-label={`Bật auto-pilot cho ${acc.name}`}
                />
                <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-green-500 after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-disabled:opacity-50" />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="space-y-1.5">
                <Label>Số bài/ngày</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={config.postsPerDay}
                  onChange={(e) => updateConfig(acc._id, 'postsPerDay', Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Không lặp sản phẩm trong (ngày)</Label>
                <Input
                  type="number"
                  min={1}
                  value={config.minIntervalDays}
                  onChange={(e) => updateConfig(acc._id, 'minIntervalDays', Number(e.target.value))}
                />
              </div>
            </div>

            <div className="space-y-1.5 mb-4">
              <Label>Tone</Label>
              <select
                aria-label="Tone"
                value={config.tone}
                onChange={(e) => updateConfig(acc._id, 'tone', e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="friendly">Thân thiện</option>
                <option value="professional">Chuyên nghiệp</option>
                <option value="fun">Vui tươi</option>
              </select>
            </div>

            <div className="space-y-1.5 mb-4">
              <Label>Giờ đăng bài</Label>
              <div className="space-y-2">
                {config.postTimes.map((time, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      type="time"
                      value={time}
                      onChange={(e) => setTime(acc._id, i, e.target.value)}
                      className="w-32"
                    />
                    {config.postTimes.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeTime(acc._id, i)}
                        aria-label="Xóa giờ đăng"
                        className="p-1 text-zinc-400 hover:text-red-500"
                      >
                        <X className="size-4" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => addTime(acc._id)}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                >
                  <Plus className="size-3" />
                  Thêm giờ
                </button>
              </div>
            </div>

            <div className="border-t border-zinc-200 pt-4 mt-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <MessageSquare className="size-4 text-blue-500" />
                  <span className="text-sm font-medium text-zinc-900">Auto-reply comments</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer" aria-label={`Bật auto-reply cho ${acc.name}`}>
                  <input
                    type="checkbox"
                    checked={config.autoReplyEnabled}
                    onChange={(e) => updateConfig(acc._id, 'autoReplyEnabled', e.target.checked)}
                    className="sr-only peer"
                    aria-label={`Bật auto-reply cho ${acc.name}`}
                  />
                  <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-blue-500 after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all" />
                </label>
              </div>

              {config.autoReplyEnabled && (
                <div className="space-y-3 pl-6">
                  <p className="text-xs text-zinc-500">
                    LLM sẽ dùng catalog sản phẩm để trả lời chính xác giá, thông tin sản phẩm
                  </p>
                  <div className="space-y-1.5">
                    <Label>Tone reply</Label>
                    <select
                      aria-label="Tone reply"
                      value={config.replyTone}
                      onChange={(e) => updateConfig(acc._id, 'replyTone', e.target.value)}
                      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="friendly">Thân thiện</option>
                      <option value="professional">Chuyên nghiệp</option>
                      <option value="fun">Vui tươi</option>
                    </select>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.skipSpam}
                      onChange={(e) => updateConfig(acc._id, 'skipSpam', e.target.checked)}
                      className="rounded border-zinc-300"
                    />
                    <span className="text-sm text-zinc-700">Bỏ qua comment spam / không liên quan</span>
                  </label>
                </div>
              )}
            </div>

            {error && saving === null && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3">{error}</p>
            )}

            <Button
              onClick={() => save(acc._id)}
              loading={saving === acc._id}
              className="w-full"
            >
              <Zap className="size-4" />
              {saving === acc._id ? 'Đang lưu...' : 'Lưu cấu hình'}
            </Button>
          </div>
        )
      })}
    </div>
  )
}

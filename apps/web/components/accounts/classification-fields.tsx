'use client'

import { useState } from 'react'
import { X, Plus } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { AGE_RANGES, CATEGORY_SUGGESTIONS } from '@/lib/taxonomy'

interface Props {
  ageRange: string
  categories: string[]
  onAgeRangeChange: (value: string) => void
  onCategoriesChange: (value: string[]) => void
}

export function ClassificationFields({
  ageRange,
  categories,
  onAgeRangeChange,
  onCategoriesChange,
}: Props) {
  const [custom, setCustom] = useState('')

  function addCategory(tag: string) {
    const value = tag.trim()
    if (!value) return
    if (categories.some((c) => c.toLowerCase() === value.toLowerCase())) return
    onCategoriesChange([...categories, value])
  }

  function removeCategory(tag: string) {
    onCategoriesChange(categories.filter((c) => c !== tag))
  }

  const remainingSuggestions = CATEGORY_SUGGESTIONS.filter(
    (s) => !categories.some((c) => c.toLowerCase() === s.toLowerCase())
  )

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="ageRange">Độ tuổi đối tượng</Label>
        <select
          id="ageRange"
          aria-label="Độ tuổi đối tượng"
          value={ageRange}
          onChange={(e) => onAgeRangeChange(e.target.value)}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">— Chưa phân loại —</option>
          {AGE_RANGES.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label>Ngành hàng / chủ đề</Label>

        {categories.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {categories.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 px-2.5 py-0.5 text-xs font-medium"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeCategory(tag)}
                  className="hover:text-blue-900"
                  aria-label={`Bỏ ${tag}`}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Tự nhập ngành hàng..."
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addCategory(custom)
                setCustom('')
              }
            }}
            className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={() => {
              addCategory(custom)
              setCustom('')
            }}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            <Plus className="size-4" />
          </button>
        </div>

        {remainingSuggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {remainingSuggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => addCategory(s)}
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-zinc-300 px-2.5 py-0.5 text-xs text-zinc-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
              >
                <Plus className="size-3" />
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Taxonomy phân loại tài khoản — nguồn dùng chung cho form, filter, badge.

export interface AgeRangeOption {
  value: string
  label: string
}

// ageRange: chọn 1 giá trị / account
export const AGE_RANGES: AgeRangeOption[] = [
  { value: '12-18', label: '12–18 tuổi' },
  { value: '18-25', label: '18–25 tuổi' },
  { value: '25-35', label: '25–35 tuổi' },
  { value: '35-50', label: '35–50 tuổi' },
  { value: '50+', label: 'Trên 50 tuổi' },
  { value: 'all', label: 'Mọi độ tuổi' },
]

export const AGE_RANGE_VALUES = AGE_RANGES.map((a) => a.value)

export function ageRangeLabel(value?: string): string | undefined {
  if (!value) return undefined
  return AGE_RANGES.find((a) => a.value === value)?.label ?? value
}

// categories: chọn nhiều, gợi ý sẵn nhưng cho tự nhập thêm
export const CATEGORY_SUGGESTIONS: string[] = [
  'Đồ ăn',
  'Quần áo',
  'Công nghệ',
  'Sức khỏe',
  'Làm đẹp',
  'Mẹ & bé',
  'Nhà cửa',
  'Du lịch',
  'Thể thao',
  'Giáo dục',
]

// Chuẩn hóa 1 tag category: trim + bỏ rỗng + dedupe (giữ nguyên hoa/thường người dùng nhập)
export function normalizeCategories(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of input) {
    if (typeof raw !== 'string') continue
    const tag = raw.trim()
    if (!tag) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(tag)
  }
  return out
}

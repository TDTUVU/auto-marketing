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

// Khung giờ "vàng" gợi ý đăng bài theo ngành (giờ trong ngày, 0–23) — thị trường VN.
// Đây chỉ là GỢI Ý; người dùng vẫn chỉnh tay được từng giờ.
// Key viết thường để khớp không phân biệt hoa/thường với category người dùng nhập.
export const CATEGORY_TIME_WINDOWS: Record<string, number[]> = {
  'đồ ăn': [10, 16, 20], // trước bữa trưa/tối + thèm ăn buổi tối
  'quần áo': [12, 20, 21], // nghỉ trưa lướt + tối rảnh mua sắm
  'công nghệ': [9, 12, 20], // sáng đi làm, trưa, tối
  'sức khỏe': [7, 19], // sáng sớm tập, tối thư giãn
  'làm đẹp': [10, 20, 21], // giữa sáng + tối
  'mẹ & bé': [9, 14, 21], // lúc con ngủ / rảnh tay
  'nhà cửa': [19, 20], // tối, cuối ngày
  'du lịch': [12, 20], // trưa + tối lên kế hoạch
  'thể thao': [6, 18], // sáng sớm + chiều tối
  'giáo dục': [9, 20], // sáng + tối học
}

/** Giờ vàng gộp từ nhiều category (union, unique, sorted). Rỗng nếu không khớp ngành nào. */
export function peakHoursFor(categories: string[] = []): number[] {
  const set = new Set<number>()
  for (const c of categories) {
    const hours = CATEGORY_TIME_WINDOWS[c.trim().toLowerCase()]
    if (hours) hours.forEach((h) => set.add(h))
  }
  return Array.from(set).sort((a, b) => a - b)
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

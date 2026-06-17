// Phân bổ tài nguyên đăng bài (posts/day) cho 1 campaign.
// Thuần hàm, không phụ thuộc DB → dùng được cả ở server (apply) lẫn client (preview).

export const FLOOR_PCT = 15 // % tối thiểu mỗi platform được giữ (exploration, không bóp về 0)
export const MAX_PER_ACCOUNT = 10 // cap an toàn theo luật anti-detection / rate-limit
const START_HOUR = 8
const END_HOUR = 20

export interface AllocAccount {
  id: string
  name: string
  platform: string
}

export interface AllocResult {
  accountId: string
  name: string
  platform: string
  postsPerDay: number
  postTimes: string[]
}

export interface PlatformPerf {
  platform: string
  likes: number
  comments: number
  shares: number
  posts: number
}

/**
 * Chia số nguyên `total` theo `weights` sao cho tổng kết quả khớp đúng `total`
 * (Hamilton / largest-remainder). Tránh trôi do làm tròn.
 */
export function largestRemainder(weights: number[], total: number): number[] {
  const sum = weights.reduce((a, b) => a + b, 0)
  if (total <= 0 || sum <= 0) return weights.map(() => 0)

  const raw = weights.map((w) => (w / sum) * total)
  const floor = raw.map((r) => Math.floor(r))
  let used = floor.reduce((a, b) => a + b, 0)

  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac)

  let k = 0
  while (used < total && k < order.length) {
    floor[order[k]!.i]!++
    used++
    k++
  }
  return floor
}

/**
 * Gợi ý trọng số % theo platform dựa trên hiệu suất engagement/bài
 * = (likes+comments+shares)/số bài. Có sàn tối thiểu FLOOR_PCT để giữ exploration.
 * Trả về phần trăm nguyên, tổng = 100.
 */
export function suggestWeights(platforms: string[], byPlatform: PlatformPerf[]): Record<string, number> {
  const uniq = [...new Set(platforms)]
  if (uniq.length === 0) return {}
  if (uniq.length === 1) return { [uniq[0]!]: 100 }

  const effMap = new Map(
    byPlatform.map((p) => [p.platform, (p.likes + p.comments + p.shares) / Math.max(p.posts, 1)])
  )
  const effs = uniq.map((p) => effMap.get(p) ?? 0)
  const totalEff = effs.reduce((a, b) => a + b, 0)

  const n = uniq.length
  const floorTotal = Math.min(FLOOR_PCT * n, 100)
  const remaining = 100 - floorTotal

  // Phần còn lại chia theo hiệu suất; chưa có data thì chia đều.
  const extra =
    totalEff > 0 ? effs.map((e) => (e / totalEff) * remaining) : effs.map(() => remaining / n)
  const floatPct = extra.map((x) => FLOOR_PCT + x)

  const ints = largestRemainder(floatPct, 100)
  return Object.fromEntries(uniq.map((p, i) => [p, ints[i]!]))
}

/** Rải n mốc giờ đều trong khung 08:00–20:00. */
export function spreadTimes(n: number): string[] {
  if (n <= 0) return []
  if (n === 1) return ['12:00']
  const span = END_HOUR - START_HOUR
  const times: string[] = []
  for (let i = 0; i < n; i++) {
    const h = START_HOUR + Math.round((span * i) / (n - 1))
    times.push(`${String(h).padStart(2, '0')}:00`)
  }
  return times
}

/**
 * Chia tổng budget bài/ngày theo trọng số platform → từng account.
 * Account cùng platform chia đều. Clamp [0, MAX_PER_ACCOUNT].
 */
export function computeAllocation(
  totalPostsPerDay: number,
  weights: Record<string, number>,
  accounts: AllocAccount[]
): AllocResult[] {
  const platforms = [...new Set(accounts.map((a) => a.platform))]
  const platBudgets = largestRemainder(
    platforms.map((p) => weights[p] ?? 0),
    totalPostsPerDay
  )
  const budgetByPlatform = new Map(platforms.map((p, i) => [p, platBudgets[i]!]))

  const results: AllocResult[] = []
  for (const platform of platforms) {
    const accs = accounts.filter((a) => a.platform === platform)
    const budget = budgetByPlatform.get(platform) ?? 0
    const perAccount = largestRemainder(
      accs.map(() => 1),
      budget
    ).map((n) => Math.min(n, MAX_PER_ACCOUNT))

    accs.forEach((a, i) => {
      const postsPerDay = perAccount[i]!
      results.push({
        accountId: a.id,
        name: a.name,
        platform: a.platform,
        postsPerDay,
        postTimes: spreadTimes(postsPerDay),
      })
    })
  }
  return results
}

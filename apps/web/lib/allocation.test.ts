import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  suggestPostTimes,
  spreadTimes,
  computeAllocation,
  largestRemainder,
  type AllocAccount,
} from './allocation'

const TIME_RE = /^([01]\d|2[0-3]):00$/

function assertValidTimes(times: string[]) {
  for (const t of times) assert.match(t, TIME_RE, `"${t}" sai định dạng HH:00`)
  // sorted tăng dần
  const sorted = [...times].sort()
  assert.deepEqual(times, sorted, 'giờ phải sắp xếp tăng dần')
  // unique
  assert.equal(new Set(times).size, times.length, 'giờ không được trùng')
}

// ---------- suggestPostTimes: khớp ngành ----------

test('suggestPostTimes: Đồ ăn 2 bài → sáng + tối, không có giờ đêm', () => {
  assert.deepEqual(suggestPostTimes(2, ['Đồ ăn']), ['10:00', '20:00'])
})

test('suggestPostTimes: Đồ ăn 1 bài → 1 mốc giữa khung (16:00)', () => {
  assert.deepEqual(suggestPostTimes(1, ['Đồ ăn']), ['16:00'])
})

test('suggestPostTimes: Đồ ăn 3 bài → đúng 3 giờ vàng', () => {
  assert.deepEqual(suggestPostTimes(3, ['Đồ ăn']), ['10:00', '16:00', '20:00'])
})

test('suggestPostTimes: Quần áo 2 bài → trưa + tối', () => {
  assert.deepEqual(suggestPostTimes(2, ['Quần áo']), ['12:00', '21:00'])
})

test('suggestPostTimes: n nhiều hơn số giờ vàng → chèn thêm, vẫn đủ n & hợp lệ', () => {
  const times = suggestPostTimes(4, ['Đồ ăn'])
  assert.equal(times.length, 4)
  assertValidTimes(times)
  // vẫn giữ các giờ vàng gốc
  for (const peak of ['10:00', '16:00', '20:00']) {
    assert.ok(times.includes(peak), `phải giữ giờ vàng ${peak}`)
  }
})

test('suggestPostTimes: KHÔNG đẩy đồ ăn vào 2h sáng (kịch bản người dùng nêu)', () => {
  for (let n = 1; n <= 6; n++) {
    const times = suggestPostTimes(n, ['Đồ ăn'])
    for (const t of times) {
      const hour = Number(t.slice(0, 2))
      assert.ok(hour >= 6, `n=${n}: giờ ${t} quá sớm (rơi vào đêm/rạng sáng)`)
    }
  }
})

// ---------- suggestPostTimes: nhiều ngành / fallback ----------

test('suggestPostTimes: gộp nhiều ngành lấy từ union giờ vàng', () => {
  // Đồ ăn[10,16,20] + Công nghệ[9,12,20] = [9,10,12,16,20]; n=5 → đúng cả 5
  assert.deepEqual(suggestPostTimes(5, ['Đồ ăn', 'Công nghệ']), [
    '09:00', '10:00', '12:00', '16:00', '20:00',
  ])
})

test('suggestPostTimes: account chưa phân loại → fallback spreadTimes (08–20)', () => {
  assert.deepEqual(suggestPostTimes(2, []), spreadTimes(2))
  assert.deepEqual(suggestPostTimes(2, []), ['08:00', '20:00'])
})

test('suggestPostTimes: ngành lạ → fallback rải đều', () => {
  assert.deepEqual(suggestPostTimes(3, ['Xe cộ']), spreadTimes(3))
})

test('suggestPostTimes: n <= 0 → []', () => {
  assert.deepEqual(suggestPostTimes(0, ['Đồ ăn']), [])
  assert.deepEqual(suggestPostTimes(-2, ['Đồ ăn']), [])
})

test('suggestPostTimes: invariants định dạng/sort/unique cho mọi n', () => {
  for (let n = 1; n <= 8; n++) {
    assertValidTimes(suggestPostTimes(n, ['Đồ ăn', 'Sức khỏe']))
    assertValidTimes(suggestPostTimes(n, []))
  }
})

// ---------- computeAllocation: postTimes phải theo ngành ----------

test('computeAllocation: account ngành Đồ ăn nhận giờ theo ngành', () => {
  const accounts: AllocAccount[] = [
    { id: 'a1', name: 'Food Shop', platform: 'facebook', categories: ['Đồ ăn'] },
  ]
  const res = computeAllocation(2, { facebook: 100 }, accounts)
  assert.equal(res.length, 1)
  assert.equal(res[0]!.postsPerDay, 2)
  assert.deepEqual(res[0]!.postTimes, ['10:00', '20:00'])
})

test('computeAllocation: account không ngành → giờ rải đều', () => {
  const accounts: AllocAccount[] = [
    { id: 'a1', name: 'Generic', platform: 'facebook' },
  ]
  const res = computeAllocation(2, { facebook: 100 }, accounts)
  assert.deepEqual(res[0]!.postTimes, ['08:00', '20:00'])
})

test('computeAllocation: số mốc giờ khớp postsPerDay', () => {
  const accounts: AllocAccount[] = [
    { id: 'a1', name: 'A', platform: 'facebook', categories: ['Đồ ăn'] },
    { id: 'a2', name: 'B', platform: 'twitter', categories: ['Quần áo'] },
  ]
  const res = computeAllocation(6, { facebook: 50, twitter: 50 }, accounts)
  for (const r of res) {
    assert.equal(r.postTimes.length, r.postsPerDay, `${r.name}: số giờ phải = postsPerDay`)
    assertValidTimes(r.postTimes)
  }
})

// ---------- sanity cho hàm nền đã có ----------

test('largestRemainder: tổng phần chia luôn bằng total', () => {
  assert.equal(largestRemainder([50, 50], 6).reduce((a, b) => a + b, 0), 6)
  assert.equal(largestRemainder([1, 1, 1], 5).reduce((a, b) => a + b, 0), 5)
  assert.deepEqual(largestRemainder([100], 3), [3])
})

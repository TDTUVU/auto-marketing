import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeCategories,
  peakHoursFor,
  ageRangeLabel,
  AGE_RANGE_VALUES,
  CATEGORY_TIME_WINDOWS,
} from './taxonomy'

// ---------- normalizeCategories (dùng ở API thêm/sửa phân loại account) ----------

test('normalizeCategories: trim khoảng trắng và bỏ tag rỗng', () => {
  assert.deepEqual(normalizeCategories(['  Đồ ăn  ', '', '   ']), ['Đồ ăn'])
})

test('normalizeCategories: dedupe không phân biệt hoa/thường, giữ bản đầu', () => {
  assert.deepEqual(normalizeCategories(['Đồ ăn', 'đồ ăn', 'ĐỒ ĂN']), ['Đồ ăn'])
})

test('normalizeCategories: bỏ phần tử không phải string', () => {
  assert.deepEqual(
    normalizeCategories(['Quần áo', 123, null, undefined, { x: 1 }, 'Công nghệ']),
    ['Quần áo', 'Công nghệ']
  )
})

test('normalizeCategories: input không phải mảng → []', () => {
  assert.deepEqual(normalizeCategories(undefined), [])
  assert.deepEqual(normalizeCategories('Đồ ăn'), [])
  assert.deepEqual(normalizeCategories(null), [])
})

// ---------- ageRangeLabel ----------

test('ageRangeLabel: map value sang nhãn tiếng Việt', () => {
  assert.equal(ageRangeLabel('18-25'), '18–25 tuổi')
  assert.equal(ageRangeLabel('all'), 'Mọi độ tuổi')
})

test('ageRangeLabel: rỗng → undefined; value lạ → trả về chính nó', () => {
  assert.equal(ageRangeLabel(undefined), undefined)
  assert.equal(ageRangeLabel(''), undefined)
  assert.equal(ageRangeLabel('99-100'), '99-100')
})

test('AGE_RANGE_VALUES: chứa đúng các mốc dùng để validate ở API', () => {
  assert.deepEqual(AGE_RANGE_VALUES, ['12-18', '18-25', '25-35', '35-50', '50+', 'all'])
})

// ---------- peakHoursFor (lõi gợi ý khung giờ) ----------

test('peakHoursFor: ngành đã biết trả đúng giờ vàng', () => {
  assert.deepEqual(peakHoursFor(['Đồ ăn']), [10, 16, 20])
  assert.deepEqual(peakHoursFor(['Quần áo']), [12, 20, 21])
})

test('peakHoursFor: khớp không phân biệt hoa/thường và khoảng trắng', () => {
  assert.deepEqual(peakHoursFor(['  đồ ăn  ']), [10, 16, 20])
  assert.deepEqual(peakHoursFor(['CÔNG NGHỆ']), [9, 12, 20])
})

test('peakHoursFor: gộp nhiều ngành → union, unique, sorted', () => {
  // Đồ ăn [10,16,20] + Công nghệ [9,12,20] → [9,10,12,16,20]
  assert.deepEqual(peakHoursFor(['Đồ ăn', 'Công nghệ']), [9, 10, 12, 16, 20])
})

test('peakHoursFor: ngành lạ hoặc rỗng → [] (sẽ fallback rải đều)', () => {
  assert.deepEqual(peakHoursFor(['Xe cộ']), [])
  assert.deepEqual(peakHoursFor([]), [])
  assert.deepEqual(peakHoursFor(), [])
})

test('CATEGORY_TIME_WINDOWS: mọi giờ nằm trong 0–23 và không rỗng', () => {
  for (const [cat, hours] of Object.entries(CATEGORY_TIME_WINDOWS)) {
    assert.ok(hours.length > 0, `${cat} phải có ít nhất 1 giờ`)
    for (const h of hours) {
      assert.ok(Number.isInteger(h) && h >= 0 && h <= 23, `${cat}: giờ ${h} không hợp lệ`)
    }
  }
})

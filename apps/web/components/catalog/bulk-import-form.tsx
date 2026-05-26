'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Upload, FileSpreadsheet, Check, AlertCircle } from 'lucide-react'

interface Account {
  _id: string
  name: string
  platform: string
}

interface ParsedRow {
  name: string
  description: string
  price?: number
  category?: string
  valid: boolean
}

function parseCSV(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []

  const header = lines[0].toLowerCase()
  const hasHeader = header.includes('name') || header.includes('tên')
  const dataLines = hasHeader ? lines.slice(1) : lines

  return dataLines.map((line) => {
    const cols = splitCSVLine(line)
    const name = (cols[0] ?? '').trim()
    const description = (cols[1] ?? '').trim()
    const priceStr = (cols[2] ?? '').trim()
    const category = (cols[3] ?? '').trim()

    const price = priceStr ? Number(priceStr.replace(/[.,\s]/g, '')) : undefined

    return {
      name,
      description,
      price: price && !isNaN(price) ? price : undefined,
      category: category || undefined,
      valid: !!name && !!description,
    }
  })
}

function splitCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

export function BulkImportForm({ accounts }: { accounts: Account[] }) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [accountId, setAccountId] = useState(accounts[0]?._id ?? '')
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setError('')
    setSuccess('')

    const reader = new FileReader()
    reader.onload = () => {
      const text = reader.result as string
      const parsed = parseCSV(text)
      if (parsed.length === 0) {
        setError('File CSV trống hoặc không đúng format')
        return
      }
      setRows(parsed)
    }
    reader.readAsText(file, 'utf-8')

    if (fileRef.current) fileRef.current.value = ''
  }

  async function submit() {
    const validRows = rows.filter((r) => r.valid)
    if (validRows.length === 0) {
      setError('Không có sản phẩm hợp lệ để import')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/products/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          products: validRows.map(({ name, description, price, category }) => ({
            name,
            description,
            price,
            category,
          })),
        }),
      })

      const json = await res.json() as { data: { count: number } | null; error: string | null }

      if (!res.ok || !json.data) {
        setError(json.error ?? 'Có lỗi xảy ra')
        return
      }

      setSuccess(`Đã import thành công ${json.data.count} sản phẩm!`)
      setRows([])
      setTimeout(() => {
        router.push('/dashboard/catalog')
        router.refresh()
      }, 1500)
    } catch {
      setError('Không thể kết nối server')
    } finally {
      setLoading(false)
    }
  }

  const validCount = rows.filter((r) => r.valid).length
  const invalidCount = rows.length - validCount

  return (
    <div className="space-y-6">
      <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="accountId">Tài khoản</Label>
          <select
            id="accountId"
            aria-label="Tài khoản"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {accounts.map((a) => (
              <option key={a._id} value={a._id}>
                {a.name} ({a.platform})
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label>File CSV</Label>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFile}
            className="hidden"
            aria-label="Chọn file CSV"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 rounded-lg border border-dashed border-zinc-300 px-4 py-4 text-sm text-zinc-500 hover:border-zinc-400 hover:text-zinc-600 transition-colors w-full justify-center"
          >
            <FileSpreadsheet className="size-5" />
            Chọn file CSV từ máy tính
          </button>
          <p className="text-xs text-zinc-400">
            Format: <code className="bg-zinc-100 px-1 rounded">name,description,price,category</code> — mỗi dòng 1 sản phẩm
          </p>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-900">
              Preview ({validCount} hợp lệ{invalidCount > 0 ? `, ${invalidCount} lỗi` : ''})
            </span>
          </div>
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500">#</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500">Tên</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500">Mô tả</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500">Giá</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500">Danh mục</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-zinc-500">OK</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.map((row, i) => (
                  <tr key={i} className={row.valid ? '' : 'bg-red-50'}>
                    <td className="px-4 py-2 text-zinc-400">{i + 1}</td>
                    <td className="px-4 py-2 max-w-[150px] truncate">{row.name || '—'}</td>
                    <td className="px-4 py-2 max-w-[200px] truncate">{row.description || '—'}</td>
                    <td className="px-4 py-2">
                      {row.price ? `${row.price.toLocaleString('vi-VN')}đ` : '—'}
                    </td>
                    <td className="px-4 py-2">{row.category ?? '—'}</td>
                    <td className="px-4 py-2 text-center">
                      {row.valid ? (
                        <Check className="size-4 text-green-500 mx-auto" />
                      ) : (
                        <AlertCircle className="size-4 text-red-400 mx-auto" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 border-t border-zinc-100 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setRows([])}
              className="text-sm text-zinc-500 hover:text-zinc-700"
            >
              Hủy
            </button>
            <Button onClick={submit} loading={loading} disabled={validCount === 0}>
              <Upload className="size-4" />
              {loading ? 'Đang import...' : `Import ${validCount} sản phẩm`}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
      )}
      {success && (
        <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">{success}</p>
      )}
    </div>
  )
}

import {
  Globe, Clock, ShieldCheck, Plus,
  Download, RotateCcw, Trash2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

// Trang CLONE — chỉ mô phỏng giao diện + chỉ số của trang Tài khoản thật.
// Dữ liệu tĩnh (mock), các nút chỉ để hiển thị, không xử lý gì.

const accounts = [
  {
    name: 'Shop Thời Trang ABC (Clone)',
    ageRange: '25-34',
    categories: ['Quần áo', 'Làm đẹp'],
    pageId: '100xxxxxxxxxxxx',
    total: 42,
    published: 37,
    createdAt: '2026-05-12',
  },
  {
    name: 'Quán Ăn XYZ (Clone)',
    ageRange: '18-24',
    categories: ['Đồ ăn'],
    pageId: '100yyyyyyyyyyyy',
    total: 18,
    published: 15,
    createdAt: '2026-06-01',
  },
]

export default function AccountClonePage() {
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Tài khoản — Clone</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{accounts.length} tài khoản đã kết nối</p>
        </div>
        <Button>
          <Plus className="size-4" />
          Thêm tài khoản
        </Button>
      </div>

      <div className="space-y-3">
        {accounts.map((account, idx) => (
          <div key={idx} className="bg-white border border-zinc-200 rounded-xl p-4 flex items-center gap-4">
            <div className="size-10 rounded-full bg-zinc-100 flex items-center justify-center shrink-0">
              <Globe className="size-4 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-zinc-900 text-sm">{account.name}</span>
                <span className="text-xs text-zinc-400">Facebook</span>
                <Badge variant="scheduled">{account.ageRange}</Badge>
                {account.categories.map((c) => (
                  <Badge key={c}>{c}</Badge>
                ))}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="inline-flex items-center gap-1 text-xs text-green-600">
                  <ShieldCheck className="size-3" />
                  Session mã hóa
                </span>
                <span className="text-xs text-zinc-400 ml-2">Page: {account.pageId}</span>
              </div>
            </div>
            <div className="flex gap-4 text-center shrink-0">
              <div>
                <p className="text-lg font-semibold text-zinc-900">{account.total}</p>
                <p className="text-xs text-zinc-400">Tổng bài</p>
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
              {/* Nút Fetch / Reset / Xóa — chỉ hiển thị */}
              <button
                type="button"
                className="p-1.5 rounded-lg text-zinc-400 hover:text-green-600 hover:bg-green-50 transition-colors"
                title="Fetch dữ liệu"
              >
                <Download className="size-4" />
              </button>
              <button
                type="button"
                className="p-1.5 rounded-lg text-zinc-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                title="Reset"
              >
                <RotateCcw className="size-4" />
              </button>
              <button
                type="button"
                className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                title="Xóa tài khoản"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

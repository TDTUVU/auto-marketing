export const dynamic = 'force-dynamic'

import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { AccountForm } from '@/components/accounts/account-form'

export default function NewAccountPage() {
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link
          href="/dashboard/facebook/accounts"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 transition-colors mb-4"
        >
          <ArrowLeft className="size-4" />
          Quay lại
        </Link>
        <h1 className="text-xl font-semibold text-zinc-900">Thêm tài khoản mới</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Paste cookie từ trình duyệt để kết nối tài khoản
        </p>
      </div>

      <div className="bg-white border border-zinc-200 rounded-xl p-6">
        <AccountForm basePath="/dashboard/facebook" />
      </div>
    </div>
  )
}

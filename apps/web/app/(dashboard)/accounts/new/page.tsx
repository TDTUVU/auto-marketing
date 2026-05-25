import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { AccountForm } from '@/components/accounts/account-form'

export default function NewAccountPage() {
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link
          href="/dashboard/accounts"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 transition-colors mb-4"
        >
          <ArrowLeft className="size-4" />
          Quay lại
        </Link>
        <h1 className="text-xl font-semibold text-zinc-900">Thêm tài khoản mới</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Paste cookie từ trình duyệt — hệ thống sẽ mã hóa và lưu an toàn
        </p>
      </div>

      <div className="bg-white border border-zinc-200 rounded-xl p-6">
        <AccountForm />
      </div>
    </div>
  )
}

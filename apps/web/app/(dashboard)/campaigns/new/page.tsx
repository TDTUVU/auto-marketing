export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { connectDB } from '@/lib/db'
import { Account, Product } from '@/lib/db/schema'
import { CampaignForm, type AccountOption } from '@/components/campaigns/campaign-form'

export default async function NewCampaignPage() {
  await connectDB()
  const accounts = await Account.find()
    .select('_id name platform ageRange categories')
    .sort({ createdAt: -1 })
    .lean()
  const options: AccountOption[] = accounts.map((a) => ({
    _id: a._id.toString(),
    name: a.name,
    platform: a.platform,
    ageRange: a.ageRange,
    categories: a.categories ?? [],
  }))

  // Số sản phẩm active mỗi tài khoản (giống trang autopilot) — để cảnh báo account chưa có catalog.
  const productCounts = await Promise.all(
    accounts.map(async (a) => [a._id.toString(), await Product.countDocuments({ accountId: a._id, isActive: true })] as const)
  )
  const productCount = Object.fromEntries(productCounts)

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link
          href="/dashboard/campaigns"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 transition-colors mb-4"
        >
          <ArrowLeft className="size-4" />
          Quay lại
        </Link>
        <h1 className="text-xl font-semibold text-zinc-900">Tạo chiến dịch</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Chọn tài khoản và khoảng thời gian — hệ thống tự gom bài đã đăng
        </p>
      </div>

      <div className="bg-white border border-zinc-200 rounded-xl p-6">
        <CampaignForm accounts={options} productCount={productCount} />
      </div>
    </div>
  )
}

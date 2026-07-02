export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { Music2, Megaphone, ArrowRight } from 'lucide-react'
import { FacebookIcon, TwitterIcon, InstagramIcon } from '@/components/icons/brand-icons'
import { connectDB } from '@/lib/db'
import { Account } from '@/lib/db/schema'
import { platforms } from '@/lib/platforms'
import { Badge } from '@/components/ui/badge'

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Facebook: FacebookIcon, Twitter: TwitterIcon, Instagram: InstagramIcon, Music2,
}

export default async function PlatformHubPage() {
  await connectDB()

  const accountCounts = await Account.aggregate([
    { $group: { _id: '$platform', count: { $sum: 1 } } },
  ])
  const countMap: Record<string, number> = Object.fromEntries(
    accountCounts.map((a: { _id: string; count: number }) => [a._id, a.count])
  )

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-10">
          <h1 className="text-2xl font-semibold text-zinc-900">Social Auto</h1>
          <p className="text-sm text-zinc-500 mt-1">Chọn nền tảng để quản lý</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {platforms.map((platform) => {
            const connected = countMap[platform.slug] ?? 0
            const Icon = iconMap[platform.iconName]

            return (
              <Link key={platform.slug} href={`/dashboard/${platform.slug}`}>
                <div className={`bg-white border rounded-xl p-6 hover:shadow-md transition-all cursor-pointer ${
                  platform.available ? 'border-zinc-200 hover:border-zinc-300' : 'border-zinc-100 opacity-75 hover:opacity-100'
                }`}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`size-10 rounded-full ${platform.bgClass} flex items-center justify-center text-white`}>
                      {Icon && <Icon className="size-5" />}
                    </div>
                    <div>
                      <h2 className="font-semibold text-zinc-900">{platform.label}</h2>
                      {platform.available ? (
                        <span className="text-xs text-green-600">
                          {connected > 0 ? `${connected} tài khoản kết nối` : 'Sẵn sàng sử dụng'}
                        </span>
                      ) : (
                        <Badge variant="draft">Sắp ra mắt</Badge>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>

        <Link href="/dashboard/campaigns" className="block mt-4">
          <div className="bg-white border border-zinc-200 rounded-xl p-5 hover:border-zinc-300 hover:shadow-md transition-all flex items-center gap-3">
            <div className="size-10 rounded-full bg-amber-500 flex items-center justify-center text-white">
              <Megaphone className="size-5" />
            </div>
            <div className="flex-1">
              <h2 className="font-semibold text-zinc-900">Chiến dịch</h2>
              <p className="text-xs text-zinc-500">Tổng hợp hiệu quả nhiều tài khoản</p>
            </div>
            <ArrowRight className="size-4 text-zinc-400" />
          </div>
        </Link>
      </div>
    </div>
  )
}

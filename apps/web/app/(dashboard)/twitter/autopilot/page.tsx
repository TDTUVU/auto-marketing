export const dynamic = 'force-dynamic'

import { Zap } from 'lucide-react'
import { connectDB } from '@/lib/db'
import { Account, AutoPilotConfig, Product } from '@/lib/db/schema'
import { AutoPilotConfigForm } from '@/components/autopilot/autopilot-config-form'

export default async function TwitterAutoPilotPage() {
  await connectDB()
  const accounts = await Account.find({ platform: 'twitter' }).lean()
  const accountIds = accounts.map((a) => a._id)
  const configs = await AutoPilotConfig.find({ accountId: { $in: accountIds } }).lean()

  const configMap: Record<string, {
    accountId: string; enabled: boolean; postsPerDay: number; postTimes: string[]
    tone: 'friendly' | 'professional' | 'fun'; minIntervalDays: number; categories: string[]
    autoReplyEnabled: boolean; replyTone: 'friendly' | 'professional' | 'fun'; skipSpam: boolean
  }> = {}

  for (const c of configs) {
    configMap[c.accountId.toString()] = {
      accountId: c.accountId.toString(), enabled: c.enabled, postsPerDay: c.postsPerDay,
      postTimes: c.postTimes, tone: c.tone, minIntervalDays: c.minIntervalDays,
      categories: c.categories, autoReplyEnabled: c.autoReplyEnabled,
      replyTone: c.replyTone, skipSpam: c.skipSpam,
    }
  }

  const productCounts = await Promise.all(
    accounts.map(async (a) => ({
      id: a._id.toString(),
      count: await Product.countDocuments({ accountId: a._id, isActive: true }),
    }))
  )
  const productCountMap = Object.fromEntries(productCounts.map((p) => [p.id, p.count]))

  const accountList = accounts.map((a) => ({
    _id: a._id.toString(),
    name: a.name,
    platform: a.platform,
    categories: a.categories ?? [],
  }))

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <Zap className="size-5 text-amber-500" />
          <h1 className="text-xl font-semibold text-zinc-900">Auto-pilot Twitter</h1>
        </div>
        <p className="text-sm text-zinc-500 mt-1">
          Bật auto-pilot để hệ thống tự tạo tweet và đăng theo lịch.
        </p>
      </div>

      {accounts.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          Chưa có tài khoản Twitter nào. Thêm tài khoản trước.
        </div>
      ) : (
        <AutoPilotConfigForm
          accounts={accountList}
          existingConfigs={configMap}
          productCount={productCountMap}
          basePath="/dashboard/twitter"
        />
      )}
    </div>
  )
}

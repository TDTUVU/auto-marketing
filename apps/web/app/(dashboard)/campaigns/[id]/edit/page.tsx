export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { connectDB } from '@/lib/db'
import { Account, Campaign } from '@/lib/db/schema'
import { CampaignForm, type AccountOption, type CampaignInitial } from '@/components/campaigns/campaign-form'

export default async function EditCampaignPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  await connectDB()

  const campaign = await Campaign.findById(id).lean()
  if (!campaign) notFound()

  const accounts = await Account.find().select('_id name platform').sort({ createdAt: -1 }).lean()
  const options: AccountOption[] = accounts.map((a) => ({
    _id: a._id.toString(),
    name: a.name,
    platform: a.platform,
  }))

  const initial: CampaignInitial = {
    _id: campaign._id.toString(),
    name: campaign.name,
    ...(campaign.brandName ? { brandName: campaign.brandName } : {}),
    status: campaign.status,
    accountIds: (campaign.accountIds ?? []).map((a: { toString(): string }) => a.toString()),
    ...(campaign.startAt ? { startAt: new Date(campaign.startAt).toISOString() } : {}),
    ...(campaign.endAt ? { endAt: new Date(campaign.endAt).toISOString() } : {}),
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link
          href={`/dashboard/campaigns/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 transition-colors mb-4"
        >
          <ArrowLeft className="size-4" />
          Quay lại
        </Link>
        <h1 className="text-xl font-semibold text-zinc-900">Sửa chiến dịch</h1>
      </div>

      <div className="bg-white border border-zinc-200 rounded-xl p-6">
        <CampaignForm accounts={options} campaign={initial} />
      </div>
    </div>
  )
}

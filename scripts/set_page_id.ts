/**
 * Gán Page ID cho một account trong MongoDB.
 * Chạy: tsx --env-file=.env scripts/set_page_id.ts
 */

import mongoose from 'mongoose'

const MONGODB_URI = process.env['MONGODB_URI'] ?? ''
if (!MONGODB_URI) throw new Error('MONGODB_URI is not set')

const AccountSchema = new mongoose.Schema(
  {
    platform: String,
    name: String,
    cookiesPath: String,
    pageId: String,
  },
  { timestamps: true }
)

const Account = mongoose.models['Account'] ?? mongoose.model('Account', AccountSchema)

async function main() {
  await mongoose.connect(MONGODB_URI)

  const result = await Account.findOneAndUpdate(
    { name: 'bkshop' },
    { pageId: '1058941240645383' },
    { new: true }
  )

  if (!result) {
    console.error('Không tìm thấy account bkshop')
    process.exit(1)
  }

  console.log('Đã cập nhật account:')
  console.log(`  name  : ${result.name}`)
  console.log(`  pageId: ${result.pageId}`)
  await mongoose.disconnect()
}

main().catch((err) => { console.error(err); process.exit(1) })

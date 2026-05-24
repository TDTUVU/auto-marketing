/**
 * Tạo Account trong MongoDB để test API.
 * Chạy: tsx --env-file=.env scripts/seed_account.ts
 */

import mongoose from 'mongoose'

const MONGODB_URI = process.env['MONGODB_URI'] ?? ''
if (!MONGODB_URI) throw new Error('MONGODB_URI is not set — chạy với --env-file=.env')

const AccountSchema = new mongoose.Schema(
  {
    platform: { type: String, enum: ['facebook', 'instagram', 'tiktok'], required: true },
    name: { type: String, required: true },
    cookiesPath: { type: String, required: true },
  },
  { timestamps: true }
)

const Account = mongoose.models['Account'] ?? mongoose.model('Account', AccountSchema)

async function main() {
  await mongoose.connect(MONGODB_URI)

  const existing = await Account.findOne({ name: 'bkshop' })
  if (existing) {
    console.log('Account đã tồn tại:')
    console.log(`  _id        : ${existing._id}`)
    console.log(`  name       : ${existing.name}`)
    console.log(`  platform   : ${existing.platform}`)
    console.log(`  cookiesPath: ${existing.cookiesPath}`)
  } else {
    const account = await Account.create({
      platform: 'facebook',
      name: 'bkshop',
      cookiesPath: 'sessions/bkshop.json',
    })
    console.log('Account tạo thành công:')
    console.log(`  _id        : ${account._id}`)
    console.log(`  name       : ${account.name}`)
    console.log(`  platform   : ${account.platform}`)
    console.log(`  cookiesPath: ${account.cookiesPath}`)
  }

  console.log('\nDùng _id này làm accountId trong POST /api/posts')
  await mongoose.disconnect()
}

main().catch((err) => { console.error(err); process.exit(1) })

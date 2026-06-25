/**
 * Dọn các comment-poll job scheduler "mồ côi" trong BullMQ (comment-queue):
 * scheduler trỏ tới post/account đã bị xoá → cứ chạy mỗi 5 phút rồi fail
 * "Account not found" / "post không tồn tại", làm rác log.
 *
 * Tiêu chí mồ côi: post không còn, HOẶC account của post không còn, HOẶC post
 * không còn ở trạng thái `published` (đã bị gỡ/đổi trạng thái).
 *
 * Mặc định DRY-RUN. Thêm `--apply` để thực sự gỡ scheduler.
 *
 * Chạy:
 *   tsx --env-file=.env scripts/clean_orphan_comment_jobs.ts          # xem trước
 *   tsx --env-file=.env scripts/clean_orphan_comment_jobs.ts --apply  # áp dụng
 */

import dns from 'dns'
dns.setServers(['8.8.8.8', '1.1.1.1']) // router nhà chặn DNS SRV → ép resolver công cộng

import mongoose from 'mongoose'
import { connectDB } from '../apps/web/lib/db/index'
import { Account, Post } from '../apps/web/lib/db/schema'
import { getCommentQueue } from '../apps/web/lib/queue/jobs'

const APPLY = process.argv.includes('--apply')

async function main() {
  await connectDB()
  const queue = getCommentQueue()

  const schedulers = await queue.getJobSchedulers(0, -1, true)
  console.log(`Tổng số comment-poll scheduler: ${schedulers.length}\n`)

  const orphans: { key: string; postId: string; reason: string }[] = []

  for (const s of schedulers) {
    const match = s.key?.match(/^comment-poll-(.+)$/)
    if (!match) continue // bỏ qua scheduler không phải dạng comment-poll
    const postId = match[1]!

    let reason: string | null = null
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      reason = 'postId không hợp lệ'
    } else {
      const post = await Post.findById(postId).select('accountId status').lean()
      if (!post) {
        reason = 'post đã bị xoá'
      } else if (post.status !== 'published') {
        reason = `post.status = ${post.status} (không còn published)`
      } else {
        const acc = await Account.exists({ _id: post.accountId })
        if (!acc) reason = `account ${post.accountId} đã bị xoá`
      }
    }

    if (reason) orphans.push({ key: s.key!, postId, reason })
  }

  console.log(`Tìm thấy ${orphans.length} scheduler mồ côi:\n`)
  for (const o of orphans) {
    console.log(`  ${o.key} — ${o.reason}`)
  }

  if (orphans.length === 0) {
    console.log('\nKhông có scheduler nào để dọn.')
  } else if (!APPLY) {
    console.log('\nDRY-RUN — chưa gỡ gì. Thêm --apply để gỡ các scheduler trên.')
  } else {
    for (const o of orphans) {
      await queue.removeJobScheduler(o.key)
    }
    console.log(`\nĐã gỡ ${orphans.length} scheduler.`)
  }

  await queue.close()
  await mongoose.disconnect()
  process.exit(0)
}

main().catch((err) => { console.error(err); process.exit(1) })

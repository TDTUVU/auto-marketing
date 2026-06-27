/**
 * Dọn Post trùng platformPostId (cùng 1 bài FB/X bị lưu thành nhiều Post → nhiều
 * poller cùng xử lý 1 bài → fail log lệch postId, isOwnReply sai vì reply lưu ở postId khác).
 *
 * Với mỗi nhóm trùng: giữ 1 post "canonical" (nhiều comment đã-reply nhất, hoà thì lấy
 * cũ nhất), dời mọi comment của bản trùng về canonical, rồi xoá bản trùng.
 * Scheduler comment-poll của post bị xoá sẽ TỰ được worker gỡ ở vòng poll kế (handleCommentJob
 * thấy post không tồn tại → removeCommentPoll).
 *
 * Chạy (từ repo root):
 *   pnpm dedupe:posts --dry-run   # chỉ xem
 *   pnpm dedupe:posts             # dọn thật
 */

import dns from 'dns'
dns.setServers(['8.8.8.8', '1.1.1.1'])

import mongoose from 'mongoose'

const dryRun = process.argv.includes('--dry-run')
const uri = process.env['MONGODB_URI']
if (!uri) {
  console.error('Thiếu MONGODB_URI — chạy qua tsx --env-file=.env')
  process.exit(1)
}

async function main(): Promise<void> {
  await mongoose.connect(uri as string)
  const db = mongoose.connection.db!
  const posts = db.collection('posts')
  const comments = db.collection('comments')

  const groups = await posts
    .aggregate<{ _id: string; ids: mongoose.Types.ObjectId[] }>([
      { $match: { platformPostId: { $ne: null } } },
      { $group: { _id: '$platformPostId', ids: { $push: '$_id' } } },
      { $match: { $expr: { $gt: [{ $size: '$ids' }, 1] } } },
    ])
    .toArray()

  console.log(`\n=== Dedupe posts ===\nNhóm trùng: ${groups.length}${dryRun ? '  [DRY-RUN]' : ''}`)

  let deletedPosts = 0
  let movedComments = 0

  for (const g of groups) {
    // Chọn canonical: nhiều comment đã reply nhất, hoà → _id nhỏ nhất (cũ nhất).
    const stats = await Promise.all(
      g.ids.map(async (id) => ({
        id,
        replied: await comments.countDocuments({ postId: id, repliedAt: { $exists: true } }),
        total: await comments.countDocuments({ postId: id }),
      }))
    )
    stats.sort((a, b) => b.replied - a.replied || a.id.toString().localeCompare(b.id.toString()))
    const canonical = stats[0]!.id
    const losers = stats.slice(1)

    console.log(`\nURL: ${g._id}`)
    console.log(`   GIỮ ${canonical} (replied=${stats[0]!.replied}, total=${stats[0]!.total})`)

    for (const l of losers) {
      console.log(`   XOÁ ${l.id} (replied=${l.replied}, total=${l.total}) → dời ${l.total} comment về canonical`)
      if (!dryRun) {
        if (l.total > 0) {
          const r = await comments.updateMany({ postId: l.id }, { $set: { postId: canonical } })
          movedComments += r.modifiedCount
        }
        await posts.deleteOne({ _id: l.id })
        deletedPosts++
      }
    }
  }

  console.log(
    dryRun
      ? `\n[DRY-RUN] Sẽ xoá ${groups.reduce((s, g) => s + g.ids.length - 1, 0)} post trùng. Bỏ --dry-run để chạy thật.`
      : `\nXong: xoá ${deletedPosts} post trùng, dời ${movedComments} comment. ✅ (worker sẽ tự gỡ scheduler mồ côi ở vòng poll kế)`
  )
  await mongoose.disconnect()
}

main().catch((err) => {
  console.error('Lỗi dedupe:', err)
  process.exit(1)
})

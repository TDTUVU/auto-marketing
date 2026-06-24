import { connectDB } from '../db/index'
import { Account, Post, Product, Image, AutoPilotConfig, AutomationLog, Campaign } from '../db/schema'
import { createAutoPilotWorker, schedulePost, type PostJobData, type ImageJobData } from './jobs'
import { generateContent } from '../llm/content'

// Bài scheduled chỉ tính vào quota nếu mới tạo trong khoảng này — đủ để chặn tạo
// trùng trong cùng một slot, nhưng không để bài kẹt (worker chết) khóa quota mãi.
const SCHEDULED_FRESH_MS = 20 * 60 * 1000

async function handleAutoPilotTick(): Promise<void> {
  await connectDB()

  const configs = await AutoPilotConfig.find({ enabled: true }).lean()
  if (configs.length === 0) return

  const now = new Date()
  const currentHH = String(now.getHours()).padStart(2, '0')
  const currentMM = String(now.getMinutes()).padStart(2, '0')

  for (const config of configs) {
    try {
      // Gate theo campaign: account thuộc campaign nào thì chỉ đăng khi có campaign
      // đang active VÀ nằm trong khoảng [startAt, endAt]. Account không thuộc campaign
      // nào → autopilot chạy độc lập như cũ.
      const campaigns = await Campaign.find({ accountIds: config.accountId })
        .select('status startAt endAt createdAt')
        .lean()

      // Mốc bắt đầu đếm quota theo campaign: chỉ tính bài đăng TỪ KHI campaign bắt đầu
      // chạy, để bài đăng trước khi tạo campaign không ăn mất quota của campaign.
      let campaignCountSince: Date | null = null
      if (campaigns.length > 0) {
        const runnable = campaigns.filter((c) => {
          if (c.status !== 'active') return false
          if (c.startAt && now < new Date(c.startAt)) return false
          if (c.endAt && now > endOfDay(new Date(c.endAt))) return false
          return true
        })
        if (runnable.length === 0) continue

        // Mốc = sớm nhất trong các campaign đang chạy; mỗi campaign lấy thời điểm
        // muộn hơn giữa createdAt và startAt (giống campaignWindow ở lib/campaigns).
        for (const c of runnable) {
          const created = c.createdAt ? new Date(c.createdAt) : null
          const startAt = c.startAt ? new Date(c.startAt) : null
          const wStart =
            created && startAt ? (created > startAt ? created : startAt) : (created ?? startAt)
          if (wStart && (!campaignCountSince || wStart < campaignCountSince)) {
            campaignCountSince = wStart
          }
        }
      }

      const shouldPost = config.postTimes.some((time: string) => {
        const [hh, mm] = time.split(':')
        const diffMinutes =
          Math.abs(Number(currentHH) * 60 + Number(currentMM) - Number(hh) * 60 - Number(mm))
        return diffMinutes <= 7
      })

      if (!shouldPost) continue

      const todayStart = new Date(now)
      todayStart.setHours(0, 0, 0, 0)

      // Không tính bài tạo trước khi campaign bắt đầu, nhưng vẫn giữ cap theo NGÀY.
      const countSince =
        campaignCountSince && campaignCountSince > todayStart ? campaignCountSince : todayStart

      // Đếm bài đã đăng + bài scheduled còn "tươi" (vừa tạo, đang chờ worker đăng).
      // Bỏ qua bài scheduled bị kẹt (worker chết) để không khóa quota vĩnh viễn.
      const freshCutoff = new Date(now.getTime() - SCHEDULED_FRESH_MS)
      const postsToday = await Post.countDocuments({
        accountId: config.accountId,
        createdAt: { $gte: countSince },
        $or: [
          { status: 'published' },
          { status: 'scheduled', createdAt: { $gte: freshCutoff } },
        ],
      })

      if (postsToday >= config.postsPerDay) continue

      const product = await pickProduct(
        config.accountId.toString(),
        config.minIntervalDays,
        config.categories
      )

      if (!product) {
        console.log(`[AutoPilot] No eligible product for account ${config.accountId}`)
        continue
      }

      const account = await Account.findById(config.accountId)
      if (!account) continue

      const generated = await generateContent({
        platform: account.platform as 'facebook' | 'instagram' | 'twitter' | 'tiktok',
        idea: buildProductIdea(product.name, product.description, product.price),
        shopName: account.name,
        tone: config.tone,
      })

      let fullContent: string
      if (account.platform === 'twitter') {
        // Twitter: hashtags đã nằm trong caption, không ghép thêm để tránh vượt 280 ký tự
        fullContent = generated.caption
      } else {
        const hashtagLine = generated.hashtags.join(' ')
        fullContent = hashtagLine
          ? `${generated.caption}\n\n${hashtagLine}`
          : generated.caption
      }

      const imageFilenames: string[] = product.imageUrls ?? []
      const jobImages: ImageJobData[] = []
      for (const filename of imageFilenames) {
        const img = await Image.findOne({ filename })
        if (img) {
          jobImages.push({
            base64: img.data.toString('base64'),
            filename: img.filename,
            mimeType: img.mimeType,
          })
        }
      }

      const post = await Post.create({
        accountId: config.accountId,
        content: fullContent,
        imageUrls: imageFilenames,
        status: 'scheduled',
        scheduledAt: now,
      })

      const jobData: PostJobData = {
        postId: post._id.toString(),
        accountId: config.accountId.toString(),
        content: fullContent,
        images: jobImages,
      }

      await schedulePost(jobData, now)

      await Product.findByIdAndUpdate(product._id, {
        lastPostedAt: now,
        $inc: { postCount: 1 },
      })

      await AutomationLog.create({
        postId: post._id,
        action: 'autopilot_create',
        success: true,
        detail: `Auto-created post from product "${product.name}"`,
        timestamp: now,
      })

      console.log(`[AutoPilot] Created post for "${product.name}" on account ${account.name}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[AutoPilot] Error for config ${config._id}:`, msg)

      await AutomationLog.create({
        action: 'autopilot_error',
        success: false,
        detail: msg,
        timestamp: now,
      })
    }
  }
}

async function pickProduct(
  accountId: string,
  minIntervalDays: number,
  categories: string[]
): Promise<InstanceType<typeof Product> | null> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - minIntervalDays)

  const filter: Record<string, unknown> = {
    accountId,
    isActive: true,
    $or: [
      { lastPostedAt: { $exists: false } },
      { lastPostedAt: null },
      { lastPostedAt: { $lt: cutoff } },
    ],
  }

  if (categories.length > 0) {
    filter['category'] = { $in: categories }
  }

  return Product.findOne(filter).sort({ lastPostedAt: 1, postCount: 1 })
}

function endOfDay(d: Date): Date {
  const e = new Date(d)
  e.setHours(23, 59, 59, 999)
  return e
}

function buildProductIdea(name: string, description: string, price?: number): string {
  let idea = `Sản phẩm: ${name}\nMô tả: ${description}`
  if (price) idea += `\nGiá: ${price.toLocaleString('vi-VN')}đ`
  return idea
}

export const autopilotWorker = createAutoPilotWorker(async () => {
  await handleAutoPilotTick()
})

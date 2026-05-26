import { connectDB } from '../db/index'
import { Account, Post, Product, Image, AutoPilotConfig, AutomationLog } from '../db/schema'
import { createAutoPilotWorker, schedulePost, type PostJobData, type ImageJobData } from './jobs'
import { generateContent } from '../llm/content'

async function handleAutoPilotTick(): Promise<void> {
  await connectDB()

  const configs = await AutoPilotConfig.find({ enabled: true }).lean()
  if (configs.length === 0) return

  const now = new Date()
  const currentHH = String(now.getHours()).padStart(2, '0')
  const currentMM = String(now.getMinutes()).padStart(2, '0')

  for (const config of configs) {
    try {
      const shouldPost = config.postTimes.some((time: string) => {
        const [hh, mm] = time.split(':')
        const diffMinutes =
          Math.abs(Number(currentHH) * 60 + Number(currentMM) - Number(hh) * 60 - Number(mm))
        return diffMinutes <= 7
      })

      if (!shouldPost) continue

      const todayStart = new Date(now)
      todayStart.setHours(0, 0, 0, 0)

      const postsToday = await Post.countDocuments({
        accountId: config.accountId,
        createdAt: { $gte: todayStart },
        status: { $in: ['scheduled', 'published'] },
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
        platform: 'facebook',
        idea: buildProductIdea(product.name, product.description, product.price),
        shopName: account.name,
        tone: config.tone,
      })

      const hashtagLine = generated.hashtags.join(' ')
      const fullContent = hashtagLine
        ? `${generated.caption}\n\n${hashtagLine}`
        : generated.caption

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

function buildProductIdea(name: string, description: string, price?: number): string {
  let idea = `Sản phẩm: ${name}\nMô tả: ${description}`
  if (price) idea += `\nGiá: ${price.toLocaleString('vi-VN')}đ`
  return idea
}

export const autopilotWorker = createAutoPilotWorker(async () => {
  await handleAutoPilotTick()
})

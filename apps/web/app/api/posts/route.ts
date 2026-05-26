import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { Account, Post, Image } from '@/lib/db/schema'
import { generateContent } from '@/lib/llm/content'
import { schedulePost, type ImageJobData } from '@/lib/queue/jobs'

export async function GET() {
  await connectDB()
  const posts = await Post.find().sort({ createdAt: -1 }).limit(20).lean()
  return NextResponse.json({ data: posts, error: null })
}

export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') ?? ''

  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json({ data: null, error: 'Expected multipart/form-data' }, { status: 400 })
  }

  const formData = await request.formData()
  const accountId = formData.get('accountId') as string | null
  const idea = formData.get('idea') as string | null
  const scheduledAt = formData.get('scheduledAt') as string | null
  const tone = (formData.get('tone') as string | null) ?? 'friendly'

  if (!accountId || !idea?.trim()) {
    return NextResponse.json({ data: null, error: 'accountId and idea are required' }, { status: 400 })
  }

  if (!['friendly', 'professional', 'fun'].includes(tone)) {
    return NextResponse.json({ data: null, error: 'Invalid tone' }, { status: 400 })
  }

  const imageFiles = formData.getAll('images') as File[]

  try {
    await connectDB()

    const account = await Account.findById(accountId)
    if (!account) {
      return NextResponse.json({ data: null, error: 'Account not found' }, { status: 404 })
    }

    let generated
    try {
      generated = await generateContent({
        platform: 'facebook',
        idea: idea.trim(),
        shopName: account.name,
        tone: tone as 'friendly' | 'professional' | 'fun',
      })
    } catch (err) {
      console.error('[/api/posts] generateContent failed:', err)
      return NextResponse.json({ data: null, error: 'Content generation failed' }, { status: 500 })
    }

    const hashtagLine = generated.hashtags.join(' ')
    const fullContent = hashtagLine
      ? `${generated.caption}\n\n${hashtagLine}`
      : generated.caption

    const imageFilenames: string[] = []
    const jobImages: ImageJobData[] = []
    for (const file of imageFiles) {
      if (!file.type.startsWith('image/')) continue
      const ext = file.name.split('.').pop() ?? 'jpg'
      const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const arrayBuf = await file.arrayBuffer()
      const buf = Buffer.from(arrayBuf)
      await Image.create({
        filename: uniqueName,
        data: buf,
        mimeType: file.type,
      })
      imageFilenames.push(uniqueName)
      jobImages.push({
        base64: buf.toString('base64'),
        filename: uniqueName,
        mimeType: file.type,
      })
    }

    const postAt = scheduledAt ? new Date(scheduledAt) : new Date()

    const post = await Post.create({
      accountId,
      content: fullContent,
      imageUrls: imageFilenames,
      status: 'scheduled',
      scheduledAt: postAt,
    })

    const jobData = {
      postId: post._id.toString(),
      accountId,
      content: fullContent,
      images: jobImages,
    }

    const jobId = await schedulePost(jobData, postAt)

    return NextResponse.json({
      data: { postId: post._id.toString(), jobId },
      error: null,
    })
  } catch (err) {
    console.error('[/api/posts] unexpected error:', err)
    return NextResponse.json({ data: null, error: 'Internal server error' }, { status: 500 })
  }
}

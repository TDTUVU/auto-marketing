import { NextResponse } from 'next/server'
import { z } from 'zod'
import { connectDB } from '@/lib/db'
import { Post } from '@/lib/db/schema'
import { scheduleCommentPoll } from '@/lib/queue/jobs'

const RequestSchema = z.object({
  postId: z.string().min(1),
  postUrl: z.string().url().optional(),
})

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ data: null, error: parsed.error.flatten() }, { status: 400 })
  }

  const { postId, postUrl: clientPostUrl } = parsed.data

  try {
    await connectDB()

    const post = await Post.findById(postId)
    if (!post) {
      return NextResponse.json({ data: null, error: 'Post not found' }, { status: 404 })
    }
    if (post.status !== 'published') {
      return NextResponse.json(
        { data: null, error: `Post chưa published (status: ${post.status})` },
        { status: 400 }
      )
    }

    const resolvedUrl = post.platformPostId || clientPostUrl
    if (!resolvedUrl) {
      return NextResponse.json(
        { data: null, error: 'Không có URL bài viết — vui lòng nhập URL thủ công' },
        { status: 400 }
      )
    }

    if (clientPostUrl && !post.platformPostId) {
      await Post.findByIdAndUpdate(postId, { platformPostId: clientPostUrl })
    }

    const jobId = await scheduleCommentPoll({
      postId: post._id.toString(),
      accountId: post.accountId.toString(),
      postUrl: resolvedUrl,
      postContent: post.content,
    })

    await Post.findByIdAndUpdate(postId, { autoReplyEnabled: true })

    return NextResponse.json({
      data: { postId: post._id.toString(), jobId, pollInterval: '5 phút' },
      error: null,
    })
  } catch (err) {
    console.error('[/api/comments] unexpected error:', err)
    return NextResponse.json({ data: null, error: 'Internal server error' }, { status: 500 })
  }
}

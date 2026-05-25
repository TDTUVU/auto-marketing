import { NextResponse } from 'next/server'
import { z } from 'zod'
import { connectDB } from '@/lib/db'
import { Post } from '@/lib/db/schema'
import { scheduleCommentPoll } from '@/lib/queue/jobs'

const RequestSchema = z.object({
  postId: z.string().min(1),
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

  const { postId } = parsed.data

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
    if (!post.platformPostId) {
      return NextResponse.json(
        { data: null, error: 'Post không có platformPostId — không biết URL để scrape comments' },
        { status: 400 }
      )
    }

    const jobId = await scheduleCommentPoll({
      postId: post._id.toString(),
      accountId: post.accountId.toString(),
      postUrl: post.platformPostId,   // lưu full URL ở đây
      postContent: post.content,
    })

    return NextResponse.json({
      data: { postId: post._id.toString(), jobId, pollInterval: '5 phút' },
      error: null,
    })
  } catch (err) {
    console.error('[/api/comments] unexpected error:', err)
    return NextResponse.json({ data: null, error: 'Internal server error' }, { status: 500 })
  }
}

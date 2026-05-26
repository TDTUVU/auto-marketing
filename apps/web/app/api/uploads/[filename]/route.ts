import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { Image } from '@/lib/db/schema'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params

  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 })
  }

  try {
    await connectDB()
    const image = await Image.findOne({ filename })

    if (!image) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    return new NextResponse(image.data, {
      headers: {
        'Content-Type': image.mimeType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

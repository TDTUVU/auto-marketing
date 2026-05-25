import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { Product } from '@/lib/db/schema'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    await connectDB()
    const body = await request.json() as Record<string, unknown>

    const allowed = ['name', 'description', 'price', 'category', 'isActive']
    const update: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in body) update[key] = body[key]
    }

    const product = await Product.findByIdAndUpdate(id, update, { new: true })
    if (!product) {
      return NextResponse.json({ data: null, error: 'Product not found' }, { status: 404 })
    }

    return NextResponse.json({ data: product, error: null })
  } catch (err) {
    console.error('[/api/products/[id]] error:', err)
    return NextResponse.json({ data: null, error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    await connectDB()
    const product = await Product.findByIdAndDelete(id)
    if (!product) {
      return NextResponse.json({ data: null, error: 'Product not found' }, { status: 404 })
    }

    return NextResponse.json({ data: { deleted: true }, error: null })
  } catch (err) {
    console.error('[/api/products/[id]] error:', err)
    return NextResponse.json({ data: null, error: 'Internal server error' }, { status: 500 })
  }
}

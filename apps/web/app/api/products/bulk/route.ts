import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { Product, Account, Image } from '@/lib/db/schema'

interface BulkProductInput {
  name: string
  description: string
  price?: number
  category?: string
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      accountId: string
      products: BulkProductInput[]
    }

    if (!body.accountId || !Array.isArray(body.products) || body.products.length === 0) {
      return NextResponse.json(
        { data: null, error: 'accountId and products array are required' },
        { status: 400 }
      )
    }

    if (body.products.length > 200) {
      return NextResponse.json(
        { data: null, error: 'Tối đa 200 sản phẩm mỗi lần import' },
        { status: 400 }
      )
    }

    await connectDB()

    const account = await Account.findById(body.accountId)
    if (!account) {
      return NextResponse.json({ data: null, error: 'Account not found' }, { status: 404 })
    }

    const docs = body.products
      .filter((p) => p.name?.trim() && p.description?.trim())
      .map((p) => ({
        accountId: body.accountId,
        name: p.name.trim(),
        description: p.description.trim(),
        price: p.price ? Number(p.price) : undefined,
        category: p.category?.trim() || undefined,
        imageUrls: [],
        isActive: true,
        postCount: 0,
      }))

    if (docs.length === 0) {
      return NextResponse.json(
        { data: null, error: 'Không có sản phẩm hợp lệ (cần name và description)' },
        { status: 400 }
      )
    }

    const created = await Product.insertMany(docs)

    return NextResponse.json({
      data: { count: created.length },
      error: null,
    })
  } catch (err) {
    console.error('[/api/products/bulk] error:', err)
    return NextResponse.json({ data: null, error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json() as { ids?: unknown }

    if (!Array.isArray(body.ids) || body.ids.length === 0) {
      return NextResponse.json(
        { data: null, error: 'ids array is required' },
        { status: 400 }
      )
    }

    const ids = body.ids.filter((id): id is string => typeof id === 'string')
    if (ids.length === 0) {
      return NextResponse.json({ data: null, error: 'No valid ids' }, { status: 400 })
    }

    await connectDB()

    const products = await Product.find({ _id: { $in: ids } }).select('imageUrls').lean()
    const filenames = products.flatMap((p) => p.imageUrls)

    const result = await Product.deleteMany({ _id: { $in: ids } })

    if (filenames.length > 0) {
      await Image.deleteMany({ filename: { $in: filenames } })
    }

    return NextResponse.json({
      data: { count: result.deletedCount },
      error: null,
    })
  } catch (err) {
    console.error('[/api/products/bulk] DELETE error:', err)
    return NextResponse.json({ data: null, error: 'Internal server error' }, { status: 500 })
  }
}

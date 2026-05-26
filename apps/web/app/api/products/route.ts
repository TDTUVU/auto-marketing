import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { Product, Account, Image } from '@/lib/db/schema'

export async function GET(request: Request) {
  await connectDB()

  const { searchParams } = new URL(request.url)
  const accountId = searchParams.get('accountId')

  const filter: Record<string, unknown> = {}
  if (accountId) filter['accountId'] = accountId

  const products = await Product.find(filter).sort({ createdAt: -1 }).lean()
  return NextResponse.json({ data: products, error: null })
}

export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') ?? ''

  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json({ data: null, error: 'Expected multipart/form-data' }, { status: 400 })
  }

  const formData = await request.formData()
  const accountId = formData.get('accountId') as string | null
  const name = formData.get('name') as string | null
  const description = formData.get('description') as string | null
  const price = formData.get('price') as string | null
  const category = formData.get('category') as string | null

  if (!accountId || !name?.trim() || !description?.trim()) {
    return NextResponse.json(
      { data: null, error: 'accountId, name, and description are required' },
      { status: 400 }
    )
  }

  try {
    await connectDB()

    const account = await Account.findById(accountId)
    if (!account) {
      return NextResponse.json({ data: null, error: 'Account not found' }, { status: 404 })
    }

    const imageFiles = formData.getAll('images') as File[]
    const imageFilenames: string[] = []

    for (const file of imageFiles) {
      if (!file.type.startsWith('image/')) continue
      const ext = file.name.split('.').pop() ?? 'jpg'
      const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const arrayBuf = await file.arrayBuffer()
      await Image.create({
        filename: uniqueName,
        data: Buffer.from(arrayBuf),
        mimeType: file.type,
      })
      imageFilenames.push(uniqueName)
    }

    const product = await Product.create({
      accountId,
      name: name.trim(),
      description: description.trim(),
      imageUrls: imageFilenames,
      price: price ? Number(price) : undefined,
      category: category?.trim() || undefined,
    })

    return NextResponse.json({ data: product, error: null })
  } catch (err) {
    console.error('[/api/products] error:', err)
    return NextResponse.json({ data: null, error: 'Internal server error' }, { status: 500 })
  }
}

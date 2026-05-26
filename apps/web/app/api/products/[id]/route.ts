import { NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { connectDB } from '@/lib/db'
import { Product } from '@/lib/db/schema'

const UPLOADS_DIR = path.join(process.cwd(), 'uploads')

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    await connectDB()
    const product = await Product.findById(id).lean()
    if (!product) {
      return NextResponse.json({ data: null, error: 'Product not found' }, { status: 404 })
    }
    return NextResponse.json({ data: product, error: null })
  } catch (err) {
    console.error('[/api/products/[id]] GET error:', err)
    return NextResponse.json({ data: null, error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const contentType = request.headers.get('content-type') ?? ''

  try {
    await connectDB()

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const update: Record<string, unknown> = {}

      const name = formData.get('name') as string | null
      const description = formData.get('description') as string | null
      const price = formData.get('price') as string | null
      const category = formData.get('category') as string | null
      const accountId = formData.get('accountId') as string | null
      const existingImagesRaw = formData.get('existingImages') as string | null

      if (name?.trim()) update['name'] = name.trim()
      if (description?.trim()) update['description'] = description.trim()
      if (price) update['price'] = Number(price)
      if (category?.trim()) update['category'] = category.trim()
      if (accountId) update['accountId'] = accountId

      const existingImages: string[] = existingImagesRaw
        ? JSON.parse(existingImagesRaw) as string[]
        : []

      const imageFiles = formData.getAll('images') as File[]
      const newFilenames: string[] = []

      if (imageFiles.length > 0) {
        await mkdir(UPLOADS_DIR, { recursive: true })
        for (const file of imageFiles) {
          if (!file.type.startsWith('image/')) continue
          const ext = file.name.split('.').pop() ?? 'jpg'
          const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
          const filePath = path.join(UPLOADS_DIR, uniqueName)
          const arrayBuf = await file.arrayBuffer()
          await writeFile(filePath, Buffer.from(arrayBuf))
          newFilenames.push(uniqueName)
        }
      }

      update['imageUrls'] = [...existingImages, ...newFilenames]

      const product = await Product.findByIdAndUpdate(id, update, { new: true })
      if (!product) {
        return NextResponse.json({ data: null, error: 'Product not found' }, { status: 404 })
      }
      return NextResponse.json({ data: product, error: null })
    }

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

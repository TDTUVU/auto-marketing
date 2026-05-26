import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { Account } from '@/lib/db/schema'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    await connectDB()
    const deleted = await Account.findByIdAndDelete(id)

    if (!deleted) {
      return NextResponse.json({ data: null, error: 'Account not found' }, { status: 404 })
    }

    return NextResponse.json({ data: { deleted: true }, error: null })
  } catch (err) {
    console.error('[DELETE /api/accounts/[id]]', err)
    return NextResponse.json({ data: null, error: 'Internal server error' }, { status: 500 })
  }
}

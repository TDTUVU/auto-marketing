import mongoose from 'mongoose'

const MONGODB_URI = process.env['MONGODB_URI'] ?? ''

if (!MONGODB_URI) throw new Error('MONGODB_URI is not set')

// Reuse connection across hot reloads in Next.js dev
declare global {
  // eslint-disable-next-line no-var
  var _mongooseConn: typeof mongoose | undefined
}

export async function connectDB(): Promise<typeof mongoose> {
  if (global._mongooseConn) return global._mongooseConn

  const conn = await mongoose.connect(MONGODB_URI)
  global._mongooseConn = conn
  return conn
}

import { Music2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

export default function TikTokPage() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <div className="size-16 rounded-full bg-zinc-100 flex items-center justify-center mx-auto mb-4">
          <Music2 className="size-8 text-zinc-700" />
        </div>
        <h1 className="text-xl font-semibold text-zinc-900 mb-2">TikTok</h1>
        <Badge variant="draft">Sắp ra mắt</Badge>
        <p className="text-sm text-zinc-500 mt-3 max-w-sm">
          Tính năng đăng video và quản lý TikTok đang được phát triển.
        </p>
      </div>
    </div>
  )
}

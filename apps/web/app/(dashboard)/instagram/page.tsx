import { InstagramIcon as Instagram } from '@/components/icons/brand-icons'
import { Badge } from '@/components/ui/badge'

export default function InstagramPage() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <div className="size-16 rounded-full bg-pink-100 flex items-center justify-center mx-auto mb-4">
          <Instagram className="size-8 text-pink-500" />
        </div>
        <h1 className="text-xl font-semibold text-zinc-900 mb-2">Instagram</h1>
        <Badge variant="draft">Sắp ra mắt</Badge>
        <p className="text-sm text-zinc-500 mt-3 max-w-sm">
          Tính năng đăng bài và quản lý Instagram đang được phát triển.
        </p>
      </div>
    </div>
  )
}

'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, FileText, Users, ScrollText, Package, Zap,
  LogOut, ChevronLeft, Music2,
} from 'lucide-react'
import { FacebookIcon, TwitterIcon, InstagramIcon } from '@/components/icons/brand-icons'
import { getPlatform } from '@/lib/platforms'

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard, FileText, Users, ScrollText, Package, Zap,
  Facebook: FacebookIcon, Twitter: TwitterIcon, Instagram: InstagramIcon, Music2,
}

export function PlatformSidebar({ platform }: { platform: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const config = getPlatform(platform)

  if (!config) return null

  const basePath = `/dashboard/${platform}`
  const PlatformIcon = iconMap[config.iconName]

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  return (
    <aside className="w-56 shrink-0 border-r border-zinc-200 bg-white flex flex-col">
      <div className="px-5 py-4 border-b border-zinc-100">
        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-600 transition-colors mb-2"
        >
          <ChevronLeft className="size-3" />
          Chọn nền tảng
        </Link>
        <div className="flex items-center gap-2">
          {PlatformIcon && (
            <div className={`size-6 rounded-md ${config.bgClass} flex items-center justify-center text-white`}>
              <PlatformIcon className="size-3.5" />
            </div>
          )}
          <span className="text-sm font-semibold text-zinc-900">{config.label}</span>
        </div>
      </div>

      <nav className="flex-1 px-3 py-3 space-y-0.5">
        {config.navItems.map((item) => {
          const href = `${basePath}${item.href}`
          const Icon = iconMap[item.iconName]
          const active = item.exact ? pathname === href : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? 'bg-zinc-100 text-zinc-900 font-medium'
                  : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700'
              }`}
            >
              {Icon && <Icon className="size-4" />}
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="px-3 py-3 border-t border-zinc-100">
        <button
          onClick={handleLogout}
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700 transition-colors w-full"
        >
          <LogOut className="size-4" />
          Đăng xuất
        </button>
      </div>
    </aside>
  )
}

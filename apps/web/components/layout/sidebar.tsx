'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, FileText, Users, ScrollText, Package, Zap, LogOut } from 'lucide-react'

const navItems = [
  { href: '/dashboard', label: 'Tổng quan', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/posts', label: 'Bài đăng', icon: FileText },
  { href: '/dashboard/catalog', label: 'Catalog', icon: Package },
  { href: '/dashboard/autopilot', label: 'Auto-pilot', icon: Zap },
  { href: '/dashboard/accounts', label: 'Tài khoản', icon: Users },
  { href: '/dashboard/logs', label: 'Logs', icon: ScrollText },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  return (
    <aside className="w-56 shrink-0 border-r border-zinc-200 bg-white flex flex-col">
      <div className="px-5 py-4 border-b border-zinc-100">
        <span className="text-sm font-semibold text-zinc-900 tracking-tight">Social Auto</span>
      </div>
      <nav className="flex-1 px-3 py-3 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href)
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
              <Icon className="size-4" />
              {label}
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

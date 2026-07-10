export interface NavItem {
  href: string
  label: string
  iconName: string
  exact?: boolean
}

export interface PlatformConfig {
  slug: string
  label: string
  iconName: string
  bgClass: string
  textClass: string
  borderClass: string
  available: boolean
  navItems: NavItem[]
}

export const platforms: PlatformConfig[] = [
  {
    slug: 'facebook',
    label: 'Facebook',
    iconName: 'Facebook',
    bgClass: 'bg-blue-600',
    textClass: 'text-blue-600',
    borderClass: 'border-blue-200',
    available: true,
    navItems: [
      { href: '', label: 'Tổng quan', iconName: 'LayoutDashboard', exact: true },
      { href: '/posts', label: 'Bài đăng', iconName: 'FileText' },
      { href: '/catalog', label: 'Catalog', iconName: 'Package' },
      { href: '/autopilot', label: 'Auto-pilot', iconName: 'Zap' },
      { href: '/accounts', label: 'Tài khoản', iconName: 'Users' },
      { href: '/accounts-clone', label: 'Tài khoản (Clone)', iconName: 'Users' },
      { href: '/logs', label: 'Logs', iconName: 'ScrollText' },
    ],
  },
  {
    slug: 'twitter',
    label: 'Twitter / X',
    iconName: 'Twitter',
    bgClass: 'bg-sky-500',
    textClass: 'text-sky-500',
    borderClass: 'border-sky-200',
    available: true,
    navItems: [
      { href: '', label: 'Tổng quan', iconName: 'LayoutDashboard', exact: true },
      { href: '/tweets', label: 'Tweets', iconName: 'FileText' },
      { href: '/catalog', label: 'Catalog', iconName: 'Package' },
      { href: '/autopilot', label: 'Auto-pilot', iconName: 'Zap' },
      { href: '/accounts', label: 'Tài khoản', iconName: 'Users' },
      { href: '/logs', label: 'Logs', iconName: 'ScrollText' },
    ],
  },
  {
    slug: 'instagram',
    label: 'Instagram',
    iconName: 'Instagram',
    bgClass: 'bg-pink-500',
    textClass: 'text-pink-500',
    borderClass: 'border-pink-200',
    available: false,
    navItems: [
      { href: '', label: 'Tổng quan', iconName: 'LayoutDashboard', exact: true },
    ],
  },
  {
    slug: 'tiktok',
    label: 'TikTok',
    iconName: 'Music2',
    bgClass: 'bg-zinc-900',
    textClass: 'text-zinc-900',
    borderClass: 'border-zinc-300',
    available: false,
    navItems: [
      { href: '', label: 'Tổng quan', iconName: 'LayoutDashboard', exact: true },
    ],
  },
]

export function getPlatform(slug: string): PlatformConfig | undefined {
  return platforms.find((p) => p.slug === slug)
}

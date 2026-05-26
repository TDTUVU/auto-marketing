import { PlatformSidebar } from '@/components/layout/platform-sidebar'

export default function InstagramLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen">
      <PlatformSidebar platform="instagram" />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}

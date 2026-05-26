import { PlatformSidebar } from '@/components/layout/platform-sidebar'

export default function FacebookLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen">
      <PlatformSidebar platform="facebook" />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}

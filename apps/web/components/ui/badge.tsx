import { cn } from '@/lib/utils'

type Variant = 'draft' | 'scheduled' | 'published' | 'failed' | 'default'

interface BadgeProps {
  children: React.ReactNode
  variant?: Variant
  className?: string
}

const variantClass: Record<Variant, string> = {
  default: 'bg-zinc-100 text-zinc-700',
  draft: 'bg-zinc-100 text-zinc-600',
  scheduled: 'bg-blue-50 text-blue-700',
  published: 'bg-green-50 text-green-700',
  failed: 'bg-red-50 text-red-700',
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        variantClass[variant],
        className
      )}
    >
      {children}
    </span>
  )
}

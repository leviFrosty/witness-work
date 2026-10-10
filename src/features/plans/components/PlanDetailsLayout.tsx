import type { ReactNode } from 'react'
import DetailsLayout from '@/components/ui/layout/DetailsLayout'
import i18n from '@/lib/locales'

/** Plan Details' header (with any actions) over its scrolling body. */
export default function PlanDetailsLayout({
  actions,
  children,
}: {
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <DetailsLayout title={i18n.t('plan')} actions={actions}>
      {children}
    </DetailsLayout>
  )
}

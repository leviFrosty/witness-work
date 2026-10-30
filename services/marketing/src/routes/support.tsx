import { createFileRoute } from '@tanstack/react-router'
import { SupportPage } from '@/components/landing/support'

export const Route = createFileRoute('/support')({
  component: () => <SupportPage locale='en-US' />,
})

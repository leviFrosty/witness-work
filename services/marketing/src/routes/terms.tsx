import { createFileRoute } from '@tanstack/react-router'
import Terms from '@/components/landing/terms'

export const Route = createFileRoute('/terms')({ component: Terms })

import { createFileRoute } from '@tanstack/react-router'
import { NotFoundPage } from '@/components/landing/not-found'

export const Route = createFileRoute('/404')({ component: NotFoundPage })

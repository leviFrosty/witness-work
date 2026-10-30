import { createFileRoute } from '@tanstack/react-router'
import { NotFoundPage } from '@/components/landing/not-found'

/** Prerendered to /404.html, which Workers Static Assets serves for misses. */
export const Route = createFileRoute('/404')({ component: NotFoundPage })

import { type ReactNode, useEffect } from 'react'
import { useRootHeaderTitleFit } from '@/components/RootHeader'

export type TitleFit = { room: number; needs: number }

export default function TitleFitProbe({
  onFit,
  children,
}: {
  onFit: (fit: TitleFit) => void
  children: ReactNode
}) {
  const fit = useRootHeaderTitleFit()
  const room = fit?.room
  const needs = fit?.needs
  useEffect(() => {
    if (room !== undefined && needs !== undefined) onFit({ room, needs })
  }, [room, needs, onFit])
  return children
}

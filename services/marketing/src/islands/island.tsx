import type { ComponentProps, ComponentType } from 'react'
import CopyLink from '@/components/help-center/copy-link'
import PlatformFilter from '@/components/help-center/platform-filter'
import HelpSearch from '@/components/help-center/search'

export const ISLANDS = {
  search: HelpSearch,
  platform: PlatformFilter,
  'copy-link': CopyLink,
} satisfies Record<string, ComponentType<never>>

export type IslandName = keyof typeof ISLANDS

export function Island<N extends IslandName>({
  name,
  props,
}: {
  name: N
  props: ComponentProps<(typeof ISLANDS)[N]>
}) {
  const Component = ISLANDS[name] as ComponentType<object>
  return (
    <div
      data-island={name}
      data-props={JSON.stringify(props)}
      style={{ display: 'contents' }}
    >
      <Component {...props} />
    </div>
  )
}

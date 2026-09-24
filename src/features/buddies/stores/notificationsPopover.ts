import { create } from 'zustand'

/**
 * Asks the Home bell to open its popover, e.g. after tapping a Buddies push.
 * The bell consumes the request once it's on screen.
 */
export const useNotificationsPopover = create<{ openRequested: boolean }>(
  () => ({ openRequested: false })
)

export function requestNotificationsPopover() {
  useNotificationsPopover.setState({ openRequested: true })
}

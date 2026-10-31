/**
 * Stands in for `@/constants/appLinkSwitch`, so a test can flip
 * `CREATE_LINKS_ON_NEW_HOST` for the link generators under test:
 *
 *     vi.mock(
 *       '@/constants/appLinkSwitch',
 *       () => import('@/__tests__/helpers/appLinkSwitch')
 *     )
 *
 * Then call `setLinksOnNewHost(true)` in a test (and reset it after).
 */
export let CREATE_LINKS_ON_NEW_HOST = false

export function setLinksOnNewHost(onNewHost: boolean) {
  CREATE_LINKS_ON_NEW_HOST = onNewHost
}

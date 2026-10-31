/**
 * Create an Account until web sign-up exists: a placeholder that opens the app
 * in this tab without an account, in dev builds only. Never while this browser
 * keeps an account's data: signing in picks that up, and edits made signed out
 * would sync into the account later. `chosen` when the User picked it in this
 * tab (`webSignInLater`).
 */
export function createAccountOffer({
  dev,
  keptData,
  chosen,
}: {
  dev: boolean
  keptData: boolean
  chosen: boolean
}): { offered: boolean; open: boolean } {
  const offered = dev && !keptData
  return { offered, open: offered && chosen }
}

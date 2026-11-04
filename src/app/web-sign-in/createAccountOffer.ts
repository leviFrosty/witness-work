/**
 * Create an Account on the sign-in screen (web sign-up), never while this
 * browser keeps an account's data: signing in picks that up, and signing up as
 * someone else would erase it.
 *
 * `withoutAccount`: dev builds only, the web smoke tests' way into the app with
 * no account (`webSignInLater`, set by `e2e/web/fixtures.ts`; nothing on screen
 * sets it). Never into an account's kept data either.
 */
export function createAccountOffer({
  dev,
  keptData,
  withoutAccount,
}: {
  dev: boolean
  keptData: boolean
  withoutAccount: boolean
}): { offered: boolean; open: boolean } {
  return { offered: !keptData, open: dev && !keptData && withoutAccount }
}

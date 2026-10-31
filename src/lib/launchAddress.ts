/**
 * What the web entry took out of the address the app loaded with
 * (`src/app/launch/scrubLaunchAddress.web.ts`), for this page load only. Never
 * saved anywhere.
 */
type LaunchAddress = {
  /** Checkout's `app_user_id` (docs/web-purchases.md "The return page"). */
  returnedAppUserId: string | null
  /** The return page came forwarded from another origin, with no id. */
  forwardedReturn: boolean
  /** `?dev_country=`, honored only in a development build on localhost. */
  devCountry: string | null
  /** `?dev_buy_gate=1`, honored only in a development build on localhost. */
  devBuyGate: boolean
}

let launch: LaunchAddress = {
  returnedAppUserId: null,
  forwardedReturn: false,
  devCountry: null,
  devBuyGate: false,
}

/** Called once, by the web entry, before anything else loads. */
export const setLaunchAddress = (value: LaunchAddress) => {
  launch = { ...value }
}

/**
 * The `app_user_id` the checkout return came back with, only to tell whether
 * it's the customer this browser is: never log in with it, save it, show it or
 * send it anywhere. Null on every other launch, and after a forwarded return.
 */
export const returnedAppUserId = (): string | null => launch.returnedAppUserId

/**
 * Whether this launch is a checkout return the web entry forwarded from another
 * origin (docs/web-purchases.md "The return page" step 2). For analytics.
 */
export const forwardedReturn = (): boolean => launch.forwardedReturn

/** The country a development build on localhost was asked to pretend. */
export const devCountryOverride = (): string | null => launch.devCountry

/**
 * Whether a development build on localhost was asked to gate web Buy as Beta
 * and production do (`useWebCheckoutCustomer`), for the web specs.
 */
export const devBuyGateOverride = (): boolean => launch.devBuyGate

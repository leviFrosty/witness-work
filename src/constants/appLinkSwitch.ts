/**
 * Where new links are made. `false` keeps making them on the old host, which
 * every shipped build opens. A later release flips it to `true` to make
 * `https://witnesswork.app/<full-word path>#…` links, once about 95% of active
 * installs run a release that reads the apex (ADR 0042 §3, rollout step 3).
 *
 * Only `appLinkBase` (`@/constants/appLinks`) reads it. Tests flip it with
 * `@/__tests__/helpers/appLinkSwitch`.
 */
export const CREATE_LINKS_ON_NEW_HOST: boolean = false

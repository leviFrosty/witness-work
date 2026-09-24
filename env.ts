import { z } from 'zod'

const envVariables = z.object({
  EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY: z
    .string()
    .describe(
      '[iOS] Allows use of revenuecat service for in-app purchases for donations. Used at runtime.'
    ),
  APP_VARIANT: z
    .string()
    .optional()
    .describe(
      'Set to `development` when working locally, targets the eas build to create the `WitnessWork Dev` bundle instead of production `WitnessWork`'
    ),
  EXPO_PUBLIC_SILENT: z
    .string()
    .optional()
    .describe('BOOLEAN, Set to true to silence all logs. Defaults to false.'),
  POSTHOG_PROJECT_TOKEN: z
    .string()
    .optional()
    .describe('Public PostHog project token embedded in the Expo app config.'),
  POSTHOG_HOST: z
    .string()
    .url()
    .optional()
    .describe('PostHog ingestion host embedded in the Expo app config.'),
  EXPO_PUBLIC_NOTES_IMPORT_BASE_URL: z
    .string()
    .optional()
    .describe(
      'Override the proxy base URL for Notes Import (e.g. a dev/staging worker) so the App Attest dev-bypass never hits production. Defaults to the prod proxy.'
    ),
  EXPO_PUBLIC_BUDDIES_BASE_URL: z
    .string()
    .optional()
    .describe(
      'Override the relay base URL for Buddies. Defaults to the Notes Import base URL, then the prod proxy.'
    ),
  EXPO_PUBLIC_NOTES_IMPORT_DEV_BYPASS: z
    .string()
    .optional()
    .describe(
      'DEV ONLY. When set, Notes Import skips App Attest and sends this token as the x-ww-dev-bypass header so the iOS simulator (no Secure Enclave) can exercise the flow against a dev worker sharing the token. Never set in production.'
    ),
})

// Validate runtime env in all builds. In dev we throw to fail fast; in
// production we log the validation failure so a misconfigured EAS env var
// (e.g. the RevenueCat key shipped as a `secret`-visibility variable and
// thus stripped from the bundle) surfaces loudly instead of silently
// breaking features in TestFlight.
const result = envVariables.safeParse(process.env)
if (!result.success) {
  if (__DEV__) {
    throw new Error(
      `[env] Missing/invalid runtime env vars:\n${result.error.toString()}`
    )
  } else {
    console.error(
      '[env] Missing/invalid runtime env vars',
      result.error.format()
    )
  }
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace NodeJS {
    interface ProcessEnv extends z.infer<typeof envVariables> {}
  }
}

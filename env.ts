import { z } from 'zod'

const envVariables = z.object({
  GOOGLE_CLOUD_API_KEY: z
    .string()
    .describe('Used for cloud translation API calls in CLI'),
  HERE_API_KEY: z
    .string()
    .describe(
      'Used for geocoding api calls when users create address to fetch coordinates'
    ),
  GOOGLE_MAPS_ANDROID_SDK_API_KEY: z
    .string()
    .describe(
      '[Android] Maps SDK Api allows use of Google Maps within application'
    ),
  REVENUECAT_APPLE_API_KEY: z
    .string()
    .describe(
      '[iOS] Allows use of revenuecat service for in-app purchases for donations'
    ),
  SENTRY_AUTH_TOKEN: z
    .string()
    .describe('Token that enables Sentry application error logging'),
  EXPO_PUBLIC_SENTRY_PROJECT: z
    .string()
    .describe("Configuration for sentry's project"),
  EXPO_PUBLIC_SENTRY_ORG: z
    .string()
    .describe("Configuration for sentry's organization"),
  APP_VARIANT: z
    .string()
    .optional()
    .describe(
      'Set to `development` when working locally, targets the eas build to create the `JW Time Dev` bundle instead of production `JW Time`'
    ),
})

if (__DEV__) {
  // Only runtime checks environment variables for dev mode.
  // Ensures production still launches always.
  // envVariables.parse(process.env)
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace NodeJS {
    interface ProcessEnv extends z.infer<typeof envVariables> {}
  }
}

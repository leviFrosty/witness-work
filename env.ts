import { z } from 'zod'

const envVariables = z.object({
  EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY: z
    .string()
    .describe(
      '[iOS] Allows use of revenuecat service for in-app purchases for donations. Used at runtime.'
    ),
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
      'Set to `development` when working locally, targets the eas build to create the `WitnessWork Dev` bundle instead of production `WitnessWork`'
    ),
})

if (__DEV__) {
  // Check for runtime environment variables.
  envVariables.parse(process.env)
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace NodeJS {
    interface ProcessEnv extends z.infer<typeof envVariables> {}
  }
}

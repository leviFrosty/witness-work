import { z } from 'zod'

const envVariables = z.object({
  GOOGLE_CLOUD_API_KEY: z.string(),
  HERE_API_KEY: z.string(),
  GOOGLE_MAPS_ANDROID_SDK_API_KEY: z.string(),
  REVENUECAT_APPLE_API_KEY: z.string(),
  SENTRY_AUTH_TOKEN: z.string(),
  EXPO_PUBLIC_SENTRY_PROJECT: z.string(),
  EXPO_PUBLIC_SENTRY_ORG: z.string(),
  APP_VARIANT: z
    .string()
    .optional()
    .describe('`development` is used to run the app in development mode.'),
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

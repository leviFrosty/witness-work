import { z } from 'zod'

const envVariables = z.object({
  GOOGLE_CLOUD_API_KEY: z.string().optional(),
  HERE_API_KEY: z.string().optional(),
  GOOGLE_MAPS_ANDROID_SDK_API_KEY: z.string().optional(),
  REVENUECAT_APPLE_API_KEY: z.string().optional(),
  SENTRY_AUTH_TOKEN: z.string().optional(),
  EXPO_PUBLIC_SENTRY_PROJECT: z.string().optional(),
  EXPO_PUBLIC_SENTRY_ORG: z.string().optional(),
  APP_VARIANT: z
    .string()
    .optional()
    .describe('`development` is used to run the app in development mode.'),
})

envVariables.parse(process.env)

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace NodeJS {
    interface ProcessEnv extends z.infer<typeof envVariables> {}
  }
}

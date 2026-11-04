import apis from '@/constants/apis'
import { fetchAppConfig, type AppConfig } from '@/lib/appUpdate/updateRequired'

let launch: Promise<AppConfig> | null = null

/**
 * The launch's first `GET /app/v1/config`, shared: the app config check's first
 * read at launch, and the web visitor's location (`readVisitorLocation`), wait
 * on the same request. A failed read is forgotten, so the next caller asks
 * again.
 */
export const readLaunchAppConfig = (): Promise<AppConfig> => {
  if (!launch) {
    const read = fetchAppConfig(apis.appConfig)
    launch = read
    read.catch(() => {
      if (launch === read) launch = null
    })
  }
  return launch
}

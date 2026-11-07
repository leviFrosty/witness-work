import apis from '@/constants/apis'
import { fetchAppConfig, type AppConfig } from '@/lib/appUpdate/updateRequired'

let launch: Promise<AppConfig> | null = null

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

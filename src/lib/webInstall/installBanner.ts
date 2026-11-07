import type { AndroidInstallTarget } from '@/constants/webInstall'

export type InstallContext = {
  userAgent: string

  standalone: boolean

  dismissed: boolean

  canPrompt: boolean

  installed: boolean
}

export function isAndroidPhone(userAgent: string): boolean {
  return /Android/i.test(userAgent) && /Mobile/i.test(userAgent)
}

export function installBannerShows(
  context: InstallContext,
  target: AndroidInstallTarget
): boolean {
  if (!isAndroidPhone(context.userAgent)) return false
  if (context.standalone || context.dismissed || context.installed) return false
  return target.source === 'play' || context.canPrompt
}

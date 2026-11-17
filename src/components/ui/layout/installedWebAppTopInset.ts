export const INSTALLED_WEB_APP_TOP_INSET = 12

export function installedWebAppTopInset(top: number, frameTop: number) {
  return Math.max(top, INSTALLED_WEB_APP_TOP_INSET - frameTop)
}

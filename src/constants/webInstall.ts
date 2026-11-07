export type AndroidInstallTarget =
  | { source: 'browser' }
  | { source: 'play'; url: string }

export const ANDROID_INSTALL_TARGET: AndroidInstallTarget = {
  source: 'browser',
}

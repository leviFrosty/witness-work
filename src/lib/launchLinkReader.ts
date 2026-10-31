/**
 * What reads the launch link (`launchLinks.ts`, and its web stand-in). Each
 * gets it once: a listener that remounts (or a navigator that mounts again)
 * would otherwise handle it again, because the startup link and
 * `Linking.getInitialURL` keep answering it for the app's lifetime, and replay
 * an "Import Contact?" prompt or a navigation.
 */
export type LaunchLinkReader =
  | 'navigation'
  | 'contact-import'
  | 'shared-good-news'
  | 'buddy-invite'
  | 'handoff'

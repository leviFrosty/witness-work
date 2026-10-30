/**
 * The web's Cloud Sync screen (ADR 0040 §5), for the web sign-in to show after
 * signing in: `WebCloudSyncScreen` with `createWebCloudSyncClient(accountKey)`,
 * the browser's own slot id, `onReady` and `onSignOut`.
 */
export { default as WebCloudSyncScreen } from '@/app/web-cloud-sync/WebCloudSyncScreen'
export {
  createWebCloudSyncClient,
  type WebCloudSyncClient,
} from '@/app/web-cloud-sync/webCloudSyncClient'
export {
  CLOUD_SYNC_REQUEST_MIN_APP_VERSION,
  decideWebCloudSync,
  type WebCloudSyncSession,
  type WebCloudSyncSlot,
  type WebCloudSyncState,
} from '@/app/web-cloud-sync/webCloudSyncGate'

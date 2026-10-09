import * as Application from 'expo-application'
import * as Notifications from 'expo-notifications'
import * as BuddiesKeychain from '../../../modules/buddies-keychain'
import apis from '@/constants/apis'
import { fromB64u } from '@/features/buddies/lib/bytes'
import { deriveIdentity } from '@/features/buddies/lib/keys'
import { isBuddiesNewsKind } from '@/features/buddies/lib/pushAlerts'
import { buddiesPushTemplates } from '@/features/buddies/lib/pushRegistration'
import { randomBytes } from '@/features/buddies/lib/random'
import { createRelayClient } from '@/features/buddies/lib/relay'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

/** APNs refuses a payload over 4 KB (ww-api `APNS_PAYLOAD_LIMIT`). */
const APNS_PAYLOAD_LIMIT = 4096

let prepared: unknown = null

/**
 * Dev only. The APNs payload the relay would send this device for an event in
 * its inbox (the newest, or the one at `seq`), built as ww-api's
 * `buildBuddiesPayload` builds it, with this device's own template. A local
 * relay can't reach APNs, so the verify harness replays it with `xcrun simctl
 * push` to drive the Notification Service Extension. `inline: false` leaves the
 * event out, as for one too big for the push. Starts the read; get the result
 * from `preparedBuddiesPush()`.
 */
export function prepareBuddiesPush({
  seq,
  inline = true,
}: { seq?: number; inline?: boolean } = {}) {
  prepared = 'pending'
  void (async () => {
    try {
      if (useBuddies.getState().registeredInboxId === null)
        throw new Error('Buddies has not started on this device')
      const me = deriveIdentity(
        fromB64u(await BuddiesKeychain.getOrCreateRootSeed())
      )
      const relay = createRelayClient({ baseUrl: apis.buddies, randomBytes })
      const { events } = await relay.syncInbox(
        { inboxId: me.inboxId, ownerSeed: me.ownerSeed, ownerPub: me.ownerPub },
        0
      )
      const event =
        seq === undefined
          ? [...events].sort((a, b) => b.seq - a.seq)[0]
          : events.find((candidate) => candidate.seq === seq)
      if (!event) throw new Error('No such event in the inbox')
      const templates: Record<string, { title: string; body: string }> =
        await buddiesPushTemplates()
      const template = templates[event.kind] ?? { title: event.kind, body: '' }
      const build = (withEvent: boolean) => ({
        'Simulator Target Bundle': Application.applicationId,
        aps: {
          alert: { title: template.title, body: template.body },
          ...(isBuddiesNewsKind(event.kind)
            ? { 'interruption-level': 'passive' }
            : { sound: 'default' }),
          'thread-id': 'buddies',
          'content-available': 1,
          'mutable-content': 1,
        },
        ww: {
          kind: event.kind,
          seq: event.seq,
          ...(withEvent ? { eventId: event.eventId, blob: event.blob } : {}),
        },
      })
      const full = build(true)
      prepared =
        inline &&
        new TextEncoder().encode(JSON.stringify(full)).length <=
          APNS_PAYLOAD_LIMIT
          ? full
          : build(false)
    } catch (error) {
      prepared = { error: String(error) }
    }
  })()
  return 'started'
}

export const preparedBuddiesPush = () => prepared

let token: unknown = null

/**
 * Dev only: this device's APNs or FCM token, for sending it a push by hand
 * (e.g. the message a relay from before named alerts sent). Read it a moment
 * later with `devicePushToken()`.
 */
export function prepareDevicePushToken() {
  token = 'pending'
  void Notifications.getDevicePushTokenAsync()
    .then((value) => {
      token = value.data
    })
    .catch((error: unknown) => {
      token = { error: String(error) }
    })
  return 'started'
}

export const devicePushToken = () => token

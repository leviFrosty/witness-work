import PostHog from 'posthog-react-native'
import {
  PostHogPersistedProperty as P,
  retriable,
  type PostHogCoreOptions,
  type PostHogEventProperties,
  type PostHogQueueItem,
  type RetriableOptions,
} from '@posthog/core'
import { analyticsEventsAllowed, isAnalyticsEvent } from '@/lib/analyticsPolicy'

const surveyHistory = [P.SurveysSeen, P.SurveyLastSeenDate]
const appVersion = [P.InstalledAppBuild, P.InstalledAppVersion]

/** SDK-specific privacy behavior; verify these seams when upgrading PostHog. */
export class AnonymousPostHog extends PostHog {
  private consentRevision = 0

  protected override setupBootstrap(
    options?: Partial<PostHogCoreOptions>
  ): void {
    // RN calls this after storage loads, before any capture, flags or native
    // initialization. reset() here would defer until after those requests.
    // Anonymous clients never persist DistinctId, so clearing it is one-time.
    if (this.getPersistedProperty(P.DistinctId)) {
      const keep = [
        ...surveyHistory,
        ...appVersion,
        P.Surveys,
        P.RemoteConfig,
        P.SessionReplay,
        P.PushRegistered,
        P.OptedOut,
      ]
      for (const key of Object.values(P)) {
        if (!keep.includes(key)) this.setPersistedProperty(key, null)
      }
      // This also discards old queues: even diagnostic/survey payloads can
      // contain the old account ID. Never replay them into anonymous analytics.
    }
    if (!analyticsEventsAllowed()) this.discardPendingUsage()
    super.setupBootstrap(options)
  }

  private discardPendingUsage(): void {
    const queue = this.getPersistedProperty<PostHogQueueItem[]>(P.Queue) ?? []
    this.setPersistedProperty(
      P.Queue,
      queue.filter((item) => {
        const event = item.message?.event
        return typeof event === 'string' && !isAnalyticsEvent(event)
      })
    )
  }

  override reset(): void {
    this.consentRevision++
    this.wrap(() => {
      this.discardPendingUsage()
      // A custom keep-list replaces RN's defaults, so include them explicitly.
      super.reset([...appVersion, P.DeviceId, ...surveyHistory])
    })
  }

  protected override async sendBatch(
    messages: (PostHogEventProperties | undefined)[],
    retryOptions?: Partial<RetriableOptions>,
    route?: string
  ): Promise<void> {
    const revision = this.consentRevision
    // Own the retry loop so each attempt rechecks consent instead of replaying
    // an already serialized payload. A quick off/on still revokes old usage.
    await retriable(
      async () => {
        const allowed = messages.filter(
          (message) =>
            (analyticsEventsAllowed() && revision === this.consentRevision) ||
            (typeof message?.event === 'string' &&
              !isAnalyticsEvent(message.event))
        )
        if (allowed.length) {
          await super.sendBatch(
            allowed,
            { ...retryOptions, retryCount: 0 },
            route
          )
        }
      },
      { ...this._retryOptions, ...retryOptions }
    )
  }
}

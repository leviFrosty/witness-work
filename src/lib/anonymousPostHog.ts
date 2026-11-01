import PostHog from 'posthog-react-native'
import {
  PostHogPersistedProperty as P,
  retriable,
  type PostHogCoreOptions,
  type PostHogEventProperties,
  type PostHogQueueItem,
  type RetriableOptions,
} from '@posthog/core'
import { analyticsEventAllowed, isAnalyticsEvent } from '@/lib/analyticsPolicy'
import { resetAnalyticsFrequency } from '@/lib/analyticsFrequency'
import { scrubAnalyticsEventProperties } from '@/lib/shareLinkScrub'

const surveyHistory = [P.SurveysSeen, P.SurveyLastSeenDate]
const appVersion = [P.InstalledAppBuild, P.InstalledAppVersion]

export class AnonymousPostHog extends PostHog {
  private consentRevision = 0

  protected override setupBootstrap(
    options?: Partial<PostHogCoreOptions>
  ): void {
    if (this.getPersistedProperty(P.DistinctId)) {
      resetAnalyticsFrequency()
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
    }
    const queue = this.getPersistedProperty<PostHogQueueItem[]>(P.Queue) ?? []
    this.setPersistedProperty(
      P.Queue,
      queue.filter(
        (item) =>
          typeof item.message?.event === 'string' &&
          analyticsEventAllowed(item.message.event, item.message.properties)
      )
    )
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

      super.reset([...appVersion, P.DeviceId, ...surveyHistory])
    })
  }

  protected override async sendBatch(
    messages: (PostHogEventProperties | undefined)[],
    retryOptions?: Partial<RetriableOptions>,
    route?: string
  ): Promise<void> {
    const revision = this.consentRevision

    await retriable(
      async () => {
        const allowed = messages.filter(
          (message): message is PostHogEventProperties & { event: string } =>
            typeof message?.event === 'string' &&
            analyticsEventAllowed(message.event, message.properties) &&
            (!isAnalyticsEvent(message.event) ||
              revision === this.consentRevision)
        )
        if (allowed.length) {
          await super.sendBatch(
            allowed.map((message) => ({
              ...message,
              properties: scrubAnalyticsEventProperties(
                message.event,
                message.properties &&
                  typeof message.properties === 'object' &&
                  !Array.isArray(message.properties)
                  ? message.properties
                  : {}
              ),
            })),
            { ...retryOptions, retryCount: 0 },
            route
          )
        }
      },
      { ...this._retryOptions, ...retryOptions }
    )
  }
}

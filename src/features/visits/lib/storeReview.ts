import moment from 'moment'
import * as StoreReview from 'expo-store-review'
import { useTakeover } from '@/stores/takeover'

/**
 * Can be called safely from any major app action.
 *
 * Will only request a review if user has reached certain usage criteria, and
 * never while something is taking over the screen (ADR 0021): it just skips,
 * and a later action asks again.
 */
export const maybeRequestStoreReview = async ({
  installedOn,
  lastTimeRequestedAReview,
  calledGoecodeApiTimes,
  updateLastTimeRequestedStoreReview,
}: {
  installedOn: Date
  lastTimeRequestedAReview: Date | null
  calledGoecodeApiTimes: number
  updateLastTimeRequestedStoreReview: () => void
}) => {
  const installedAppMoreThanADayAgo = moment(installedOn).isBefore(
    moment().subtract(1, 'day')
  )

  const lastRequestWasSomeTimeAgo =
    lastTimeRequestedAReview === null ||
    moment(lastTimeRequestedAReview).isBefore(moment().subtract(3, 'days'))

  if (useTakeover.getState().isTakingOver()) return
  if (
    calledGoecodeApiTimes > 1 &&
    installedAppMoreThanADayAgo &&
    lastRequestWasSomeTimeAgo
  ) {
    try {
      if (await StoreReview.hasAction()) {
        updateLastTimeRequestedStoreReview()
        await StoreReview.requestReview()
      }
    } catch (error) {
      // Do nothing as the user doesn't have Play Store installed / isn't able to leave a review.
    }
  }
}

import moment from 'moment'
import * as StoreReview from 'expo-store-review'
import { useTakeover } from '@/stores/takeover'

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
    } catch (error) {}
  }
}

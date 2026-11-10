import { useWindowDimensions } from 'react-native'
import {
  BRAND_MARK_CARD_PATH,
  BRAND_MARK_LINES_PATH,
  BRAND_MARK_PERSON_PATH,
  BRAND_MARK_SIZE,
} from '@/constants/brandMark'
import {
  splashMarkWidth,
  type LaunchSplashProps,
} from '@/app/launch/splashMark'
import i18n from '@/lib/locales'

export { splashMarkWidth }

const barStart = (bar: Element | null | undefined) =>
  bar?.getAnimations?.()[0]?.startTime ?? null

let clock =
  typeof document === 'undefined'
    ? null
    : barStart(document.querySelector('#launch-splash-progress > *'))

const keepTime = (bar: HTMLDivElement | null) => {
  const animation = bar?.getAnimations?.()[0]
  if (!animation) return
  clock ??= animation.startTime ?? document.timeline.currentTime
  if (clock !== null) animation.startTime = clock
}

const LaunchSplash = ({ indicator = true }: LaunchSplashProps) => {
  const width = splashMarkWidth(useWindowDimensions())
  const height = (width / BRAND_MARK_SIZE.width) * BRAND_MARK_SIZE.height

  return (
    <div className='launch-splash'>
      <div className='launch-splash-mark'>
        <svg
          viewBox={`0 0 ${BRAND_MARK_SIZE.width} ${BRAND_MARK_SIZE.height}`}
          aria-hidden='true'
          style={{ width, height }}
        >
          <path fillRule='evenodd' d={BRAND_MARK_CARD_PATH} />
          <path d={BRAND_MARK_PERSON_PATH} />
          <path d={BRAND_MARK_LINES_PATH} />
        </svg>
        {indicator && (
          <div
            className='launch-splash-progress'
            role='progressbar'
            aria-label={i18n.t('common_loading')}
          >
            <div className='launch-splash-bar' ref={keepTime} />
          </div>
        )}
      </div>
    </div>
  )
}

export default LaunchSplash

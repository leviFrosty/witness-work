import type { CSSProperties, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { screenSrcSet, type ScreenName } from './screens'

/**
 * Generic device frames for the app's screenshots, drawn in CSS so they can
 * fold, float and light up. They are deliberately not replicas of any
 * manufacturer's hardware: no camera housings, buttons or logos. The outer
 * element is a size container (landing.css), so set its width and everything
 * inside scales with it.
 */

type ScreenProps = {
  screen: ScreenName
  alt: string
  /**
   * `sizes` for the screenshot's srcset, e.g. "(min-width: 1024px) 300px,
   * 60vw".
   */
  sizes: string
  priority?: boolean
}

type FrameProps = {
  className?: string
  style?: CSSProperties
  /** Overlays drawn on the glass, above the screenshot. */
  children?: ReactNode
}

export function Screen({
  screen,
  alt,
  sizes,
  priority,
  className,
  style,
}: ScreenProps & { className?: string; style?: CSSProperties }) {
  const { src, srcSet, width, height } = screenSrcSet(screen)
  return (
    <img
      src={src}
      srcSet={srcSet}
      sizes={sizes}
      width={width}
      height={height}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      decoding='async'
      fetchPriority={priority ? 'high' : undefined}
      draggable={false}
      className={cn('wwd-img', className)}
      style={style}
    />
  )
}

function Frame({
  kind,
  className,
  style,
  children,
  screen,
}: FrameProps & { kind: string; screen?: ScreenProps }) {
  return (
    <div className={cn('wwd', kind, className)} style={style}>
      <div className='wwd-rim'>
        <div className='wwd-glass'>
          {screen ? <Screen {...screen} /> : null}
          {children}
        </div>
      </div>
    </div>
  )
}

/** A phone: thin even bezel, softly rounded, no hardware details. */
export const Phone = ({
  className,
  style,
  children,
  ...screen
}: FrameProps & ScreenProps) => (
  <Frame kind='wwd-phone' className={className} style={style} screen={screen}>
    {children}
  </Frame>
)

/** A tablet in landscape. */
export const Tablet = ({
  className,
  style,
  children,
  ...screen
}: FrameProps & ScreenProps) => (
  <Frame kind='wwd-tablet' className={className} style={style} screen={screen}>
    {children}
  </Frame>
)

/** The foldable's outer display: a short, wide phone. */
export const FoldableClosed = ({
  className,
  style,
  children,
  ...screen
}: FrameProps & ScreenProps) => (
  <Frame
    kind='wwd-fold-closed'
    className={className}
    style={style}
    screen={screen}
  >
    {children}
  </Frame>
)

/** A watch face on a soft band. */
export function Watch({
  className,
  style,
  children,
  ...screen
}: FrameProps & ScreenProps) {
  return (
    <div className={cn('wwd-watch', className)} style={style}>
      <div className='wwd-band wwd-band-top' aria-hidden />
      <div className='wwd-band wwd-band-bottom' aria-hidden />
      <Frame kind='wwd-watch-case' screen={screen}>
        {children}
      </Frame>
    </div>
  )
}

/**
 * A book-style foldable, open. `--fold` (0 = flat, 1 = nearly shut) bends the
 * two halves toward the viewer around the hinge; the screenshot is split across
 * them.
 */
export function Foldable({
  className,
  style,
  screen,
  alt,
  sizes,
  priority,
}: Omit<FrameProps, 'children'> & ScreenProps) {
  const half = (side: 'left' | 'right') => (
    <div className={`wwd-fold-half wwd-fold-${side}`}>
      <div className='wwd-rim'>
        <div className='wwd-glass'>
          <Screen screen={screen} alt='' sizes={sizes} priority={priority} />
        </div>
      </div>
    </div>
  )
  return (
    <div
      className={cn('wwd-fold', className)}
      style={style}
      role='img'
      aria-label={alt}
    >
      {half('left')}
      {half('right')}
      <div className='wwd-hinge' aria-hidden />
    </div>
  )
}

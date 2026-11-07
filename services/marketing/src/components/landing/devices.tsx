import type { CSSProperties, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { screenSrcSet, type ScreenName } from './screens'

type ScreenProps = {
  screen: ScreenName
  alt: string

  sizes: string
  priority?: boolean
}

type FrameProps = {
  className?: string
  style?: CSSProperties

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

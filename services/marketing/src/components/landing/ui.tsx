import { Pause, Play } from 'lucide-react'
import type { CSSProperties, ElementType, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { LandingLocale } from './i18n'
import { storeBadges, storeLinks } from './store'

/** Copy with `**marked**` phrases, rendered as highlighted text. */
export function Rich({ text }: { text: string }) {
  return (
    <>
      {text
        .split('**')
        .map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part))}
    </>
  )
}

/**
 * Fades its children in once they scroll into view (the engine sets `data-in`;
 * landing.css animates it). `delay` staggers siblings.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  variant,
  as: Tag = 'div',
  style,
  ...rest
}: {
  children: ReactNode
  className?: string
  delay?: number
  variant?: 'scale' | 'blur'
  as?: ElementType
  style?: CSSProperties
  id?: string
}) {
  return (
    <Tag
      suppressHydrationWarning
      className={cn('ww-reveal', className)}
      data-variant={variant}
      style={{ '--delay': `${delay}ms`, ...style } as CSSProperties}
      {...rest}
    >
      {children}
    </Tag>
  )
}

export function SectionHeading({
  eyebrow,
  title,
  body,
  align = 'center',
  className,
  id,
}: {
  eyebrow?: string
  title: string
  body?: string
  align?: 'center' | 'start'
  className?: string
  id?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4',
        align === 'center'
          ? 'mx-auto max-w-3xl items-center text-center'
          : 'max-w-2xl items-start text-start',
        className
      )}
    >
      {eyebrow && (
        <Reveal as='p' className='ww-eyebrow'>
          {eyebrow}
        </Reveal>
      )}
      <Reveal as='h2' id={id} className='ww-h2' delay={60}>
        {title}
      </Reveal>
      {body && (
        <Reveal as='p' className='ww-lead max-w-2xl' delay={120}>
          <Rich text={body} />
        </Reveal>
      )}
    </div>
  )
}

/**
 * The Codex-style backdrop behind the hero and the closing call to action: a
 * silk field (WebGL) that drifts and leans toward the pointer. The engine draws
 * it while it's on screen ([data-ww-field] in landing.js); without it, or
 * without WebGL, the CSS glow under it stays.
 */
export function Field({ className }: { className?: string }) {
  return (
    <div
      className={cn('ww-field', className)}
      data-ww-field=''
      aria-hidden
      suppressHydrationWarning
    >
      {/* landing.js sizes it, sometimes before React hydrates. */}
      <canvas className='ww-field-silk' suppressHydrationWarning />
    </div>
  )
}

/** The official, localized store badges. */
export function StoreBadges({
  locale,
  labels,
  className,
  size = 'md',
}: {
  locale: LandingLocale
  labels: { appStore: string; googlePlay: string }
  className?: string
  size?: 'md' | 'lg'
}) {
  const badges = storeBadges(locale)
  const links = storeLinks(locale)
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-center gap-3',
        className
      )}
    >
      <a
        href={links.appStore}
        className='ww-store'
        data-size={size}
        aria-label={labels.appStore}
      >
        <img src={badges.appStore} alt='' width={120} height={40} />
      </a>
      <a
        href={links.googlePlay}
        className='ww-store'
        data-size={size}
        aria-label={labels.googlePlay}
      >
        <img src={badges.googlePlay} alt='' width={135} height={40} />
      </a>
    </div>
  )
}

export function Stars({ className }: { className?: string }) {
  return (
    <span
      className={cn('inline-flex gap-0.5 text-[var(--ww-gold)]', className)}
      aria-hidden
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} viewBox='0 0 20 20' className='size-[1em]'>
          <path
            fill='currentColor'
            d='M10 1.5l2.6 5.5 6 .7-4.4 4.1 1.2 5.9L10 14.8l-5.4 2.9 1.2-5.9L1.4 7.7l6-.7z'
          />
        </svg>
      ))}
    </span>
  )
}

/**
 * Holds the moving rows after it still, for anyone who wants to read them. A
 * checkbox, so it works by keyboard and touch without the motion script:
 * sections.css pauses every marquee among its later siblings while checked.
 */
export function PauseToggle({ id, label }: { id: string; label: string }) {
  return (
    <>
      <input type='checkbox' id={id} className='ww-radio ww-pause-input' />
      <label htmlFor={id} className='ww-pause' title={label}>
        <Pause className='ww-pause-off size-4' aria-hidden />
        <Play className='ww-pause-on size-4' aria-hidden />
        <span className='sr-only'>{label}</span>
      </label>
    </>
  )
}

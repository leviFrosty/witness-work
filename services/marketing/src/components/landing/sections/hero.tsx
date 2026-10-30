import {
  AudioLines,
  BookUser,
  CalendarDays,
  ChartColumnIncreasing,
  Clock,
  Flame,
  MapPin,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { CSSProperties } from 'react'
import { Phone } from '../devices'
import type { LandingLocale, LandingMessages } from '../i18n'
import { Field, Reveal, StoreBadges, Stars } from '../ui'

type Tile = {
  Icon: LucideIcon
  color: string
  /** Where it floats on wide screens, in percent of the headline area. */
  x: number
  y: number
  /** Tilt, in degrees. */
  r: number
  /** How far it drifts on scroll. */
  d: number
  /** "top" tiles also line up above the headline on phones. */
  top?: boolean
}

/** Feature icons floating around the headline (T3 Code's agent tiles). */
const TILES: Tile[] = [
  {
    Icon: Clock,
    color: 'var(--ww-green)',
    x: 10,
    y: 14,
    r: -9,
    d: 26,
    top: true,
  },
  {
    Icon: CalendarDays,
    color: 'var(--ww-teal)',
    x: 19,
    y: 40,
    r: 6,
    d: 16,
    top: true,
  },
  {
    Icon: BookUser,
    color: 'var(--ww-gold)',
    x: 83,
    y: 10,
    r: -5,
    d: 18,
    top: true,
  },
  {
    Icon: AudioLines,
    color: 'var(--ww-violet)',
    x: 91,
    y: 37,
    r: 8,
    d: 28,
    top: true,
  },
  { Icon: MapPin, color: 'var(--ww-rose)', x: 6, y: 63, r: 7, d: 34 },
  { Icon: Users, color: 'var(--ww-cyan)', x: 90, y: 72, r: -7, d: 32 },
  { Icon: Flame, color: 'var(--ww-orange)', x: 16, y: 86, r: -4, d: 12 },
  {
    Icon: ChartColumnIncreasing,
    color: 'var(--ww-mint)',
    x: 79,
    y: 55,
    r: 5,
    d: 14,
  },
]

/** On phones, two more hang beside the iPhone. */
const SIDE_TILES: Tile[] = [
  { Icon: MapPin, color: 'var(--ww-rose)', x: 0, y: 18, r: 7, d: 20 },
  { Icon: Users, color: 'var(--ww-cyan)', x: 100, y: 30, r: -7, d: 22 },
]

function TileIcon({ tile, i }: { tile: Tile; i: number }) {
  const { Icon } = tile
  return (
    <span
      className='ww-tile-pos'
      data-top={tile.top ? '' : undefined}
      style={
        {
          '--x': `${tile.x}%`,
          '--y': `${tile.y}%`,
          '--r': `${tile.r}deg`,
          '--d': tile.d,
          '--i': i,
          '--c': tile.color,
        } as CSSProperties
      }
    >
      <span className='ww-tile'>
        <Icon className='ww-tile-icon' strokeWidth={2.1} />
      </span>
    </span>
  )
}

/**
 * The opening, Apple-style: the name, one promise, the download, and one big
 * iPhone that rises as the page scrolls (--p). Behind it, a silk field that
 * leans toward the pointer (Field), and feature icons that drift on scroll.
 */
export function Hero({
  locale,
  t,
}: {
  locale: LandingLocale
  t: LandingMessages
}) {
  return (
    <section
      className='ww-hero relative isolate overflow-hidden'
      data-ww-progress=''
      aria-labelledby='ww-hero-title'
      suppressHydrationWarning
    >
      <Field />
      <div className='ww-grid-bg' aria-hidden />
      <div className='ww-hero-top'>
        <div className='ww-tiles' aria-hidden>
          {TILES.map((tile, i) => (
            <TileIcon key={i} tile={tile} i={i} />
          ))}
        </div>
        <div className='ww-hero-head'>
          <Reveal as='p' className='ww-hero-eyebrow'>
            WitnessWork
          </Reveal>
          <h1
            id='ww-hero-title'
            className='ww-display ww-hero-title mt-3 sm:mt-4'
          >
            <Reveal as='span' className='block' delay={90} variant='blur'>
              {t.hero.title}
            </Reveal>
          </h1>
          <Reveal
            as='p'
            className='ww-lead ww-hero-lead mt-5 max-w-[34rem] sm:mt-6 lg:max-w-[38rem]'
            delay={220}
          >
            {t.hero.body}
          </Reveal>
          <Reveal delay={320} className='mt-8 sm:mt-9'>
            <StoreBadges locale={locale} labels={t.store} size='lg' />
          </Reveal>
          <Reveal delay={400} className='ww-hero-meta'>
            <p className='ww-note'>{t.hero.note}</p>
            <p className='flex items-center gap-2'>
              <Stars className='text-[15px]' />
              <span>
                <strong className='font-semibold text-[var(--ww-ink)]'>
                  {t.hero.rating}
                </strong>{' '}
                {t.hero.ratingLabel}
              </span>
            </p>
          </Reveal>
        </div>
      </div>

      <div className='ww-hero-device'>
        <div className='ww-hero-halo' aria-hidden />
        <div className='ww-tiles ww-tiles-side' aria-hidden>
          {SIDE_TILES.map((tile, i) => (
            <TileIcon key={i} tile={tile} i={i + 4} />
          ))}
        </div>
        <div className='ww-hero-phone'>
          <Phone
            screen='iphone-home'
            alt={t.hero.screenAlt}
            sizes='(min-width: 1024px) 380px, 78vw'
            priority
          />
        </div>
      </div>
    </section>
  )
}

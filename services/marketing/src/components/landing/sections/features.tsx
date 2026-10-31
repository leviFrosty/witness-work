import {
  Accessibility,
  AudioLines,
  CalendarSync,
  Car,
  Check,
  Clock,
  DatabaseBackup,
  Download,
  LayoutGrid,
  LockKeyhole,
  NotebookPen,
  Palette,
  Plus,
  RotateCw,
} from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Phone, Screen } from '../devices'
import type { LandingMessages } from '../i18n'
import type { ScreenName } from '../screens'
import { Reveal, Rich } from '../ui'

/** Eyebrow, title and body for one feature, beside its visual. */
function Chapter({
  id,
  eyebrow,
  title,
  body,
  visual,
  reverse,
  accent = 'var(--ww-green)',
}: {
  id?: string
  eyebrow: string
  title: string
  body: string
  visual: ReactNode
  reverse?: boolean
  accent?: string
}) {
  return (
    <section
      id={id}
      className='ww-chapter relative mx-auto grid max-w-[1200px] items-center gap-12 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-2 lg:gap-20'
      style={{ '--accent': accent } as CSSProperties}
      aria-label={eyebrow}
    >
      <div
        className={cn(
          'flex flex-col items-center gap-5 text-center lg:items-start lg:text-start',
          reverse && 'lg:order-2'
        )}
      >
        <Reveal
          as='p'
          className='ww-eyebrow'
          style={{ color: 'var(--accent)' }}
        >
          {eyebrow}
        </Reveal>
        <Reveal as='h2' className='ww-h2' delay={60}>
          {title}
        </Reveal>
        <Reveal as='p' className='ww-lead max-w-xl' delay={120}>
          <Rich text={body} />
        </Reveal>
      </div>
      <div className={cn('relative', reverse && 'lg:order-1')}>{visual}</div>
    </section>
  )
}

/**
 * Two phones, one tucked behind the other. They drift apart a little as the
 * pair scrolls through the screen (--p).
 */
function PhonePair({
  front,
  back,
  frontAlt,
  backAlt,
  flip,
}: {
  front: ScreenName
  back: ScreenName
  frontAlt: string
  backAlt: string
  flip?: boolean
}) {
  return (
    <div
      className='ww-pair mx-auto'
      data-flip={flip ? '' : undefined}
      data-ww-progress=''
      suppressHydrationWarning
    >
      <div className='ww-pair-glow' aria-hidden />
      <Reveal className='ww-pair-back' delay={140} variant='scale'>
        <Phone
          screen={back}
          alt={backAlt}
          sizes='(min-width: 1024px) 270px, 48vw'
        />
      </Reveal>
      <Reveal className='ww-pair-front' variant='scale'>
        <Phone
          screen={front}
          alt={frontAlt}
          sizes='(min-width: 1024px) 290px, 54vw'
        />
      </Reveal>
    </div>
  )
}

function SinglePhone({
  screen,
  alt,
  children,
}: {
  screen: ScreenName
  alt: string
  children?: ReactNode
}) {
  return (
    <div
      className='ww-single mx-auto'
      data-ww-progress=''
      suppressHydrationWarning
    >
      <div className='ww-pair-glow' aria-hidden />
      <Reveal variant='scale' className='relative'>
        <Phone
          screen={screen}
          alt={alt}
          sizes='(min-width: 1024px) 300px, 62vw'
        />
      </Reveal>
      {children}
    </div>
  )
}

function ScribeDemo({ t }: { t: LandingMessages }) {
  const demo = t.scribe.demo
  return (
    <div
      className='ww-scribe'
      data-ww-scribe=''
      data-step='0'
      suppressHydrationWarning
    >
      <div className='ww-scribe-glow' aria-hidden />
      <div className='ww-scribe-panel'>
        <div className='flex items-center gap-4'>
          <div className='ww-orb ww-orb-sm' aria-hidden />
          <div className='flex flex-col'>
            <span className='text-[15px] font-semibold'>Scribe AI</span>
            <span className='ww-scribe-status text-[13px] text-[var(--ww-muted)]'>
              {demo.listening}
            </span>
          </div>
          <div className='ww-wave ms-auto' aria-hidden>
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>
        <div className='mt-6 flex flex-col gap-3'>
          <p className='ww-bubble' data-show='1'>
            <span data-ww-type={demo.transcript} suppressHydrationWarning>
              {demo.transcript}
            </span>
          </p>
          <p className='text-[14px] text-[var(--ww-muted)]' data-show='2'>
            {demo.reply}
          </p>
          <ul className='flex flex-col gap-2.5' data-show='3'>
            {demo.cards.map((card, i) => (
              <li key={card.title} className='ww-proposal'>
                <span className='ww-proposal-check' aria-hidden>
                  <Check className='size-3.5' strokeWidth={3} />
                </span>
                <span className='ww-proposal-icon' aria-hidden>
                  {i === 0 ? (
                    <Clock className='size-4' />
                  ) : (
                    <CalendarSync className='size-4' />
                  )}
                </span>
                <span className='flex min-w-0 flex-col'>
                  <span className='text-[11px] font-medium tracking-wide text-[var(--ww-mint)] uppercase'>
                    {card.kind}
                  </span>
                  <span className='truncate text-[15px] font-semibold'>
                    {card.title}
                  </span>
                  <span className='truncate text-[13px] text-[var(--ww-muted)]'>
                    {card.detail}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <div className='ww-scribe-add' data-show='3'>
            <span className='ww-scribe-add-label'>{demo.add}</span>
            <span className='ww-scribe-added'>
              <Check className='size-4' strokeWidth={3} aria-hidden />
              {demo.added}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Progress, pinned Apple-style on wide screens: the iPhone stays put while its
 * screen turns from this month to the service year as the page scrolls (--p on
 * the sticky scene). Phones get the two screens side by side instead.
 */
function ProgressScene({ t }: { t: LandingMessages }) {
  const p = t.progress
  return (
    <section
      className='ww-scene'
      data-ww-progress='sticky'
      suppressHydrationWarning
      aria-label={p.eyebrow}
      style={{ '--accent': 'var(--ww-green)' } as CSSProperties}
    >
      <div className='ww-scene-sticky'>
        <div className='ww-chapter mx-auto grid w-full max-w-[1200px] items-center gap-12 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-2 lg:gap-20'>
          <div className='flex flex-col items-center gap-5 text-center lg:items-start lg:text-start'>
            <Reveal
              as='p'
              className='ww-eyebrow'
              style={{ color: 'var(--accent)' }}
            >
              {p.eyebrow}
            </Reveal>
            <Reveal as='h2' className='ww-h2' delay={60}>
              {p.title}
            </Reveal>
            <Reveal as='p' className='ww-lead max-w-xl' delay={120}>
              <Rich text={p.body} />
            </Reveal>
          </div>
          <div className='relative'>
            <div className='ww-scene-pair'>
              <PhonePair
                front='iphone-progress'
                back='iphone-year'
                frontAlt={p.alt}
                backAlt={p.yearAlt}
              />
            </div>
            <div className='ww-scene-media' aria-hidden>
              <div className='ww-pair-glow' />
              <Phone
                screen='iphone-progress'
                alt=''
                sizes='320px'
                className='ww-scene-phone'
              >
                <Screen
                  screen='iphone-year'
                  alt=''
                  sizes='320px'
                  className='ww-scene-next'
                />
              </Phone>
              <p className='ww-scene-caption'>
                <span data-step='a'>{p.month}</span>
                <span data-step='b'>{p.year}</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/**
 * A visit note that types itself out (T3 Code's terminal demo, in the app's own
 * note style) while it's on screen ([data-ww-typing] in landing.js).
 */
function NoteCard({ t }: { t: LandingMessages }) {
  const note = t.visits.note
  return (
    <figure
      className='ww-note-card'
      data-ww-typing=''
      suppressHydrationWarning
      aria-label={`Maria Santos, ${note.when}: ${note.text} ${note.next}`}
    >
      <figcaption className='flex items-center gap-3' aria-hidden>
        <span className='ww-note-avatar'>M</span>
        <span className='flex min-w-0 flex-col'>
          <span className='text-[15px] font-semibold'>Maria Santos</span>
          <span className='text-[12.5px] text-[var(--ww-muted)]'>
            {note.when}
          </span>
        </span>
      </figcaption>
      <p className='ww-note-text' aria-hidden>
        <span className='ww-note-ghost'>{note.text}</span>
        <span>
          <span data-ww-typed={note.text} suppressHydrationWarning>
            {note.text}
          </span>
          <span className='ww-caret' />
        </span>
      </p>
      <p className='ww-note-next' aria-hidden>
        <RotateCw className='size-3.5' aria-hidden />
        {note.next}
      </p>
    </figure>
  )
}

/**
 * "And so much more" items that exist only on iPhone and iPad: widgets, and
 * Siri and Shortcuts (by index into t.more.items).
 */
const APPLE_ONLY = new Set([0, 1])

const MORE_ICONS = [
  LayoutGrid,
  AudioLines,
  Car,
  LockKeyhole,
  Download,
  CalendarSync,
  DatabaseBackup,
  NotebookPen,
  Palette,
  Accessibility,
]

export function Features({ t }: { t: LandingMessages }) {
  return (
    <div id='features' className='relative'>
      <ProgressScene t={t} />

      <Chapter
        eyebrow={t.plan.eyebrow}
        title={t.plan.title}
        body={t.plan.body}
        reverse
        accent='var(--ww-teal)'
        visual={
          <PhonePair
            front='iphone-schedule'
            back='iphone-plan'
            frontAlt={t.plan.alt}
            backAlt={t.plan.detailAlt}
            flip
          />
        }
      />

      <Chapter
        eyebrow={t.visits.eyebrow}
        title={t.visits.title}
        body={t.visits.body}
        accent='var(--ww-gold)'
        visual={
          <div className='ww-visits'>
            <PhonePair
              front='iphone-map'
              back='iphone-contacts'
              frontAlt={t.visits.mapAlt}
              backAlt={t.visits.listAlt}
            />
            <Reveal className='ww-note-wrap' delay={240} variant='scale'>
              <NoteCard t={t} />
            </Reveal>
          </div>
        }
      />

      <section
        className='ww-chapter relative mx-auto max-w-[1200px] px-5 py-20 sm:px-8 sm:py-28'
        aria-label={t.scribe.eyebrow}
        style={{ '--accent': 'var(--ww-mint)' } as CSSProperties}
      >
        <div className='flex flex-col items-center gap-5 text-center'>
          <Reveal as='p' className='ww-eyebrow'>
            {t.scribe.eyebrow}
          </Reveal>
          <Reveal
            as='h2'
            className='ww-h2 text-[clamp(3rem,11vw,7rem)]'
            delay={60}
          >
            {t.scribe.title}
          </Reveal>
          <Reveal as='p' className='ww-lead max-w-2xl' delay={120}>
            <Rich text={t.scribe.body} />
          </Reveal>
        </div>
        <div className='mt-14 grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16'>
          <Reveal variant='scale'>
            <ScribeDemo t={t} />
          </Reveal>
          <SinglePhone screen='iphone-scribe' alt={t.scribe.alt} />
        </div>
      </section>

      <div className='mx-auto grid max-w-[1200px] gap-5 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-2'>
        <BentoCard
          eyebrow={t.buddies.eyebrow}
          title={t.buddies.title}
          body={t.buddies.body}
          accent='var(--ww-violet)'
          screen='iphone-buddy'
          alt={t.buddies.alt}
        />
        <BentoCard
          eyebrow={t.route.eyebrow}
          title={t.route.title}
          body={t.route.body}
          note={t.supporter.included}
          accent='var(--ww-cyan)'
          screen='iphone-route'
          alt={t.route.alt}
          delay={120}
        />
      </div>

      <Chapter
        eyebrow={t.delight.eyebrow}
        title={t.delight.title}
        body={t.delight.body}
        accent='var(--ww-orange)'
        reverse
        visual={
          <PhonePair
            front='iphone-pet'
            back='iphone-badges'
            frontAlt={t.delight.petAlt}
            backAlt={t.delight.badgesAlt}
            flip
          />
        }
      />

      <section
        className='mx-auto max-w-[1200px] px-5 py-20 sm:px-8 sm:py-28'
        aria-labelledby='ww-more-title'
      >
        <Reveal as='h2' id='ww-more-title' className='ww-h2 text-center'>
          {t.more.title}
        </Reveal>
        <div className='mt-12 grid gap-4 lg:grid-cols-[1.15fr_1fr]'>
          <Reveal className='ww-card ww-widget-card relative flex flex-col items-center justify-center gap-5 p-6 sm:p-10'>
            <Screen
              screen='widget-calendar'
              alt={t.more.widgetAlt}
              sizes='(min-width: 1024px) 560px, 90vw'
              className='ww-widget-img'
            />
            <p className='ww-foot'>{t.more.appleOnly}</p>
          </Reveal>
          <ul className='grid grid-cols-2 gap-3 sm:gap-4'>
            {t.more.items.map((item, i) => {
              const Icon = MORE_ICONS[i] ?? Plus
              return (
                <Reveal
                  as='li'
                  key={item.title}
                  delay={(i % 4) * 60}
                  className='ww-card flex flex-col gap-2 p-4 sm:p-5'
                >
                  <Icon className='size-5 text-[var(--ww-mint)]' aria-hidden />
                  <h3 className='text-[15px] font-semibold leading-snug'>
                    {item.title}
                  </h3>
                  <p className='text-[13.5px] leading-relaxed text-[var(--ww-muted)]'>
                    {item.body}
                  </p>
                  {APPLE_ONLY.has(i) && (
                    <p className='ww-foot mt-auto pt-1'>{t.more.appleOnly}</p>
                  )}
                </Reveal>
              )
            })}
          </ul>
        </div>
      </section>
    </div>
  )
}

function BentoCard({
  eyebrow,
  title,
  body,
  note,
  accent,
  screen,
  alt,
  delay = 0,
}: {
  eyebrow: string
  title: string
  body: string
  /** A quiet line under the body, like "Included with Supporter." */
  note?: string
  accent: string
  screen: ScreenName
  alt: string
  delay?: number
}) {
  return (
    <Reveal
      as='section'
      delay={delay}
      className='ww-card ww-bento flex flex-col'
      style={{ '--accent': accent } as CSSProperties}
      aria-label={eyebrow}
    >
      <div className='flex flex-col gap-4 p-7 sm:p-10'>
        <p className='ww-eyebrow' style={{ color: 'var(--accent)' }}>
          {eyebrow}
        </p>
        <h2 className='ww-h3'>{title}</h2>
        <p className='ww-body'>
          <Rich text={body} />
        </p>
        {note && <p className='ww-foot'>{note}</p>}
      </div>
      <div className='ww-bento-device mt-auto'>
        <Phone
          screen={screen}
          alt={alt}
          sizes='(min-width: 1024px) 300px, 70vw'
        />
      </div>
    </Reveal>
  )
}

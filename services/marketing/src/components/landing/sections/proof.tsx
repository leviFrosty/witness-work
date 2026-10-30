import type { LandingMessages } from '../i18n'
import { REVIEWS, type Review } from '../reviews'
import { PauseToggle, Reveal, Stars } from '../ui'

/**
 * Splits "4.9", "4,9" or "10K+" into the number to count up to and the text
 * around it. Anything else ("10.000+", "1万+" with other digits) stays still, so
 * a thousands separator is never read as a decimal point.
 */
function countParts(value: string) {
  const match = value.match(/^(\D*)(\d+(?:[.,]\d)?)(\D*)$/)
  if (!match) return null
  const [, prefix = '', digits = '', suffix = ''] = match
  return {
    prefix,
    suffix,
    to: Number(digits.replace(',', '.')),
    decimals: /[.,]/.test(digits) ? 1 : 0,
  }
}

function ReviewCard({ review }: { review: Review }) {
  return (
    <figure className='ww-review' lang={review.lang}>
      <Stars className='text-[13px]' />
      <blockquote className='mt-3'>
        <p className='text-[15px] font-semibold text-[var(--ww-ink)]'>
          {review.title}
        </p>
        <p className='mt-1.5 text-[14px] leading-relaxed text-[var(--ww-muted)]'>
          {review.body}
        </p>
      </blockquote>
      <figcaption className='mt-4 text-[12px] text-[var(--ww-faint)]'>
        {review.author} · App Store {review.store}
      </figcaption>
    </figure>
  )
}

function Marquee({
  reviews,
  reverse,
  duration,
}: {
  reviews: Review[]
  reverse?: boolean
  duration: string
}) {
  return (
    <div
      className='ww-marquee'
      data-reverse={reverse ? '' : undefined}
      style={{ '--duration': duration } as React.CSSProperties}
    >
      {[0, 1].map((copy) => (
        <div
          key={copy}
          className='ww-marquee-track'
          aria-hidden={copy === 1 ? true : undefined}
        >
          {reviews.map((review) => (
            <ReviewCard key={review.author} review={review} />
          ))}
        </div>
      ))}
    </div>
  )
}

export function Proof({ t }: { t: LandingMessages }) {
  const half = Math.ceil(REVIEWS.length / 2)
  return (
    <section
      className='relative py-16 sm:py-24'
      aria-labelledby='ww-proof-title'
    >
      <h2 id='ww-proof-title' className='sr-only'>
        {t.proof.title}
      </h2>
      <dl className='mx-auto grid max-w-[1100px] grid-cols-2 gap-y-10 px-5 sm:px-8 lg:grid-cols-4'>
        {t.proof.stats.map((stat, i) => {
          const parts = countParts(stat.value)
          return (
            <Reveal
              key={stat.label}
              delay={i * 90}
              className='flex flex-col items-center gap-2 text-center'
            >
              <dt className='order-2 max-w-[12rem] text-sm text-[var(--ww-muted)]'>
                {stat.label}
              </dt>
              <dd className='ww-stat order-1'>
                {parts ? (
                  <span
                    data-ww-count=''
                    suppressHydrationWarning
                    data-to={parts.to}
                    data-decimals={parts.decimals}
                    data-prefix={parts.prefix}
                    data-suffix={parts.suffix}
                  >
                    {stat.value}
                  </span>
                ) : (
                  stat.value
                )}
              </dd>
            </Reveal>
          )
        })}
      </dl>
      <div className='ww-marquees mt-14 sm:mt-20'>
        <PauseToggle id='ww-pause-reviews' label={t.nav.pause} />
        <div className='flex flex-col gap-4' dir='ltr'>
          <Marquee reviews={REVIEWS.slice(0, half)} duration='80s' />
          <Marquee reviews={REVIEWS.slice(half)} duration='95s' reverse />
        </div>
      </div>
    </section>
  )
}

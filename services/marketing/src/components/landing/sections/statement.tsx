import type { LandingLocale, LandingMessages } from '../i18n'
import { Reveal } from '../ui'

/** Languages that don't put spaces between words light up by character. */
const UNSPACED = new Set<LandingLocale>(['ja-JP', 'zh-CN', 'zh-TW'])

/** One big sentence whose words light up as it scrolls past. */
export function Statement({
  locale,
  t,
}: {
  locale: LandingLocale
  t: LandingMessages
}) {
  const pieces = UNSPACED.has(locale)
    ? Array.from(t.statement.title)
    : t.statement.title.split(' ')
  const joiner = UNSPACED.has(locale) ? '' : ' '
  return (
    <section
      className='relative mx-auto max-w-[1100px] px-5 py-20 text-center sm:px-8 sm:py-32'
      aria-labelledby='ww-statement'
    >
      <Reveal as='p' className='ww-eyebrow'>
        {t.statement.eyebrow}
      </Reveal>
      <div data-ww-progress='' data-ww-words='' suppressHydrationWarning>
        <h2
          id='ww-statement'
          className='ww-words ww-display mt-6 text-[clamp(2.6rem,9vw,6.4rem)]'
          aria-label={t.statement.title}
        >
          {pieces.map((piece, i) => (
            <span key={i} aria-hidden>
              <span className='ww-word' suppressHydrationWarning>
                {piece}
              </span>
              {i < pieces.length - 1 ? joiner : null}
            </span>
          ))}
        </h2>
      </div>
      <Reveal as='p' className='ww-lead mx-auto mt-8 max-w-2xl' delay={100}>
        {t.statement.body}
      </Reveal>
    </section>
  )
}

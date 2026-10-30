import { Foldable, FoldableClosed } from '../devices'
import type { LandingMessages } from '../i18n'
import { Reveal } from '../ui'

/**
 * IPhone Duo, pinned the way Apple shows it: closed on its outer display at
 * first, then opening flat as the page scrolls. --p on the sticky scene drives
 * the hand-off and --fold (sections.css); without the engine, or with reduced
 * motion, it simply shows open.
 */
export function Unfold({ t }: { t: LandingMessages }) {
  const d = t.devices
  const duo = d.tabs.duo
  return (
    <section
      className='ww-unfold'
      data-ww-progress='sticky'
      aria-labelledby='ww-unfold-title'
      suppressHydrationWarning
    >
      <div className='ww-unfold-sticky'>
        <div className='mx-auto flex w-full max-w-[1100px] flex-col items-center px-5 text-center sm:px-8'>
          <Reveal as='p' className='ww-eyebrow'>
            {duo.name}
          </Reveal>
          <Reveal
            as='h2'
            id='ww-unfold-title'
            className='ww-h2 mt-3'
            delay={60}
          >
            {duo.title}
          </Reveal>
          <div className='ww-unfold-stage'>
            <FoldableClosed
              screen='duo-closed-home'
              alt={d.duoClosedAlt}
              sizes='(min-width: 1024px) 260px, 44vw'
              className='ww-unfold-closed'
            />
            <Foldable
              screen='duo-open-contacts'
              alt={d.duoOpenAlt}
              sizes='(min-width: 1024px) 680px, 92vw'
              className='ww-unfold-open'
            />
          </div>
          {/* One slot under the device: the pose while it opens, then the
              body once it lies flat. */}
          <div className='ww-unfold-caption'>
            <p data-step='closed' aria-hidden>
              {d.poses.closed}
            </p>
            <p data-step='half' aria-hidden>
              {d.poses.half}
            </p>
            <p data-step='open' className='ww-lead max-w-xl'>
              {duo.body}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

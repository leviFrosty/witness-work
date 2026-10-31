import type { ReactNode } from 'react'
import { Foldable, Phone, Tablet, Watch } from '../devices'
import type { LandingMessages } from '../i18n'
import type { ScreenName } from '../screens'
import { Reveal, SectionHeading } from '../ui'

type Kind = 'watch' | 'phone' | 'fold' | 'tablet'

/** The device and capture for each step of the day, in order. */
const STEPS: { kind: Kind; screen: ScreenName }[] = [
  { kind: 'watch', screen: 'watch-upnext' },
  { kind: 'phone', screen: 'iphone-home' },
  { kind: 'phone', screen: 'iphone-contact' },
  { kind: 'fold', screen: 'duo-open-contacts' },
  { kind: 'tablet', screen: 'ipad-progress' },
]

function Device({
  kind,
  screen,
  alt,
  stage,
}: {
  kind: Kind
  screen: ScreenName
  alt: string
  stage?: boolean
}): ReactNode {
  switch (kind) {
    case 'watch':
      return (
        <Watch
          screen={screen}
          alt={alt}
          sizes={stage ? '240px' : '48vw'}
          className='ww-j-watch'
        />
      )
    case 'phone':
      return (
        <Phone
          screen={screen}
          alt={alt}
          sizes={stage ? '300px' : '64vw'}
          className='ww-j-phone'
        />
      )
    case 'fold':
      return (
        <Foldable
          screen={screen}
          alt={alt}
          sizes={stage ? '560px' : '92vw'}
          className='ww-j-fold'
        />
      )
    case 'tablet':
      return (
        <Tablet
          screen={screen}
          alt={alt}
          sizes={stage ? '600px' : '90vw'}
          className='ww-j-tablet'
        />
      )
  }
}

/**
 * A day in service, hour by hour. On wide screens the steps scroll past a
 * sticky stage that swaps devices (the engine marks the step in the middle of
 * the screen); on phones each step carries its own device.
 */
export function Journey({ t }: { t: LandingMessages }) {
  const steps = t.journey.steps
  return (
    <section
      id='journey'
      className='relative py-24 sm:py-32'
      aria-labelledby='ww-journey-title'
    >
      <div className='mx-auto max-w-[1200px] px-5 sm:px-8'>
        <SectionHeading
          id='ww-journey-title'
          eyebrow={t.journey.eyebrow}
          title={t.journey.title}
          body={t.journey.body}
        />
        <div
          className='ww-journey mt-16 lg:mt-8 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16'
          data-ww-journey=''
          suppressHydrationWarning
          data-ww-progress=''
          data-active='0'
        >
          <ol className='ww-j-steps relative'>
            {steps.map((step, i) => (
              <li
                key={step.time}
                className='ww-j-step'
                data-ww-step={i}
                suppressHydrationWarning
                data-active={i === 0 ? '' : undefined}
              >
                <Reveal className='ww-j-copy'>
                  <p className='ww-j-time'>
                    <time>{step.time}</time>
                  </p>
                  <h3 className='ww-h3 mt-2'>{step.title}</h3>
                  <p className='ww-body mt-3 max-w-md text-[1.05rem]'>
                    {step.body}
                  </p>
                </Reveal>
                <Reveal
                  className='ww-j-inline mt-10 flex justify-center lg:hidden'
                  variant='scale'
                >
                  <Device
                    kind={STEPS[i]!.kind}
                    screen={STEPS[i]!.screen}
                    alt={step.alt}
                  />
                </Reveal>
              </li>
            ))}
          </ol>
          <div className='ww-j-stage-wrap hidden lg:block' aria-hidden>
            <div className='ww-j-stage'>
              <div className='ww-j-halo' />
              {steps.map((step, i) => (
                <div
                  key={step.time}
                  className='ww-j-item'
                  data-ww-stage-item={i}
                  suppressHydrationWarning
                  data-kind={STEPS[i]!.kind}
                  data-active={i === 0 ? '' : undefined}
                >
                  <Device
                    kind={STEPS[i]!.kind}
                    screen={STEPS[i]!.screen}
                    alt=''
                    stage
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

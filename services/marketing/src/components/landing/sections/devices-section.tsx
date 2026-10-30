import type { CSSProperties } from 'react'
import { Phone, Tablet, Watch } from '../devices'
import type { LandingMessages } from '../i18n'
import { Reveal, SectionHeading } from '../ui'

type DeviceKey = keyof LandingMessages['devices']['tabs']
/** IPhone Duo has its own scene just before (unfold.tsx). */
const ORDER: DeviceKey[] = ['iphone', 'ipad', 'watch', 'android']

/**
 * One app on every screen: a tab per device. The tabs are radio buttons, so
 * switching works without JavaScript and the arrow keys move between them;
 * landing.css shows the panel whose radio is checked.
 */
export function DevicesSection({ t }: { t: LandingMessages }) {
  const d = t.devices
  return (
    <section
      id='devices'
      className='relative overflow-hidden py-24 sm:py-32'
      aria-labelledby='ww-devices-title'
    >
      <div className='ww-devices-bg' aria-hidden />
      <div className='relative mx-auto max-w-[1200px] px-5 sm:px-8'>
        <SectionHeading
          id='ww-devices-title'
          eyebrow={d.eyebrow}
          title={d.title}
          body={d.body}
        />
        <div className='ww-dev mt-12'>
          {ORDER.map((key, i) => (
            <input
              key={key}
              type='radio'
              name='ww-device'
              id={`ww-dev-${key}`}
              className='ww-radio'
              defaultChecked={i === 0}
            />
          ))}
          <Reveal className='ww-seg-scroll'>
            <div className='ww-segmented' role='presentation'>
              {ORDER.map((key) => (
                <label key={key} htmlFor={`ww-dev-${key}`}>
                  {d.tabs[key].name}
                </label>
              ))}
            </div>
          </Reveal>
          <div className='ww-dev-panels mt-10'>
            <Panel id='iphone' t={t}>
              <div className='ww-fan'>
                <Phone
                  screen='iphone-progress'
                  alt=''
                  sizes='(min-width: 1024px) 230px, 34vw'
                  className='ww-fan-side ww-fan-start'
                />
                <Phone
                  screen='iphone-home'
                  alt={t.hero.screenAlt}
                  sizes='(min-width: 1024px) 270px, 42vw'
                  className='ww-fan-center'
                />
                <Phone
                  screen='iphone-contacts'
                  alt=''
                  sizes='(min-width: 1024px) 230px, 34vw'
                  className='ww-fan-side ww-fan-end'
                />
              </div>
            </Panel>
            <Panel id='ipad' t={t}>
              <Tablet
                screen='ipad-schedule'
                alt={d.ipadAlt}
                sizes='(min-width: 1024px) 760px, 92vw'
                className='ww-dev-tablet'
              />
            </Panel>
            <Panel id='watch' t={t}>
              <div className='ww-watch-pair'>
                <Watch
                  screen='watch-home'
                  alt={d.watchAlt}
                  sizes='(min-width: 1024px) 220px, 40vw'
                />
                <Watch
                  screen='watch-upnext'
                  alt={t.journey.steps[0]!.alt}
                  sizes='(min-width: 1024px) 220px, 40vw'
                  className='ww-watch-second'
                />
              </div>
            </Panel>
            <Panel id='android' t={t}>
              <div className='ww-fan'>
                <Phone
                  screen='android-home'
                  alt={d.androidAlt}
                  sizes='(min-width: 1024px) 270px, 46vw'
                  className='ww-fan-center ww-android'
                />
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </section>
  )
}

function Panel({
  id,
  t,
  children,
}: {
  id: DeviceKey
  t: LandingMessages
  children: React.ReactNode
}) {
  const tab = t.devices.tabs[id]
  return (
    <div
      className='ww-dev-panel'
      data-panel={id}
      style={{ '--panel': `"${id}"` } as CSSProperties}
    >
      <div className='ww-dev-visual'>{children}</div>
      <div className='mx-auto mt-10 max-w-xl text-center'>
        <h3 className='ww-h3'>{tab.title}</h3>
        <p className='ww-body mt-3 text-[1.05rem]'>{tab.body}</p>
      </div>
    </div>
  )
}

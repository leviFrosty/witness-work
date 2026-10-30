import {
  Code,
  EyeOff,
  Fingerprint,
  HardDrive,
  LockKeyhole,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import type { LandingMessages } from '../i18n'
import { Reveal, SectionHeading } from '../ui'

const ICONS = [UserRound, HardDrive, ShieldCheck, Fingerprint, EyeOff, Code]

/** A note that turns to ciphertext and back: what encryption means, shown. */
function Cipher() {
  return (
    <div className='ww-cipher' aria-hidden>
      <div className='ww-cipher-box'>
        <div className='ww-cipher-card'>
          <div className='ww-cipher-plain'>
            <span className='ww-cipher-avatar'>M</span>
            <span className='flex min-w-0 flex-col'>
              <span className='font-semibold'>Maria Santos</span>
              <span className='text-[13px] text-[var(--ww-muted)]'>
                418 Hyde St · 10:30 AM
              </span>
            </span>
          </div>
          <div className='ww-cipher-text'>
            <span>9f2c 7ab1 e04d 55c8 0d3e</span>
            <span>a71b 4c09 f2e6 13d8 77aa</span>
          </div>
          <span className='ww-cipher-scan' />
        </div>
        <span className='ww-cipher-lock'>
          <LockKeyhole className='size-5' />
        </span>
      </div>
    </div>
  )
}

export function Privacy({ t }: { t: LandingMessages }) {
  return (
    <section
      id='privacy'
      className='relative py-24 sm:py-32'
      aria-labelledby='ww-privacy-title'
    >
      <div className='mx-auto max-w-[1200px] px-5 sm:px-8'>
        <div className='grid items-center gap-12 lg:grid-cols-[1fr_0.9fr] lg:gap-20'>
          <SectionHeading
            id='ww-privacy-title'
            eyebrow={t.privacy.eyebrow}
            title={t.privacy.title}
            body={t.privacy.body}
            align='start'
            className='max-lg:mx-auto max-lg:items-center max-lg:text-center'
          />
          <Reveal variant='scale'>
            <Cipher />
          </Reveal>
        </div>
        <ul className='mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          {t.privacy.items.map((item, i) => {
            const Icon = ICONS[i] ?? ShieldCheck
            return (
              <Reveal
                as='li'
                key={item.title}
                delay={(i % 3) * 80}
                className='ww-card flex gap-4 p-6'
              >
                <span className='ww-icon-tile shrink-0'>
                  <Icon className='size-5' aria-hidden />
                </span>
                <span className='flex flex-col gap-1.5'>
                  <h3 className='text-[17px] font-semibold tracking-tight'>
                    {item.title}
                  </h3>
                  <p className='text-[15px] leading-relaxed text-[var(--ww-muted)]'>
                    {item.body}
                  </p>
                </span>
              </Reveal>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

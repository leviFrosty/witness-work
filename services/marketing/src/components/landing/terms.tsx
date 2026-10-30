import { PolicyPage } from '@/components/landing/policy-page'
import { TERMS_PATH } from '@/lib/paths'

const sections = [
  {
    title: 'Use responsibly',
    body: (
      <p>
        Use WitnessWork lawfully. You are responsible for information you enter
        and share. Do not harm others, disrupt the service, or present a copy as
        official or endorsed by Levi Wilkerson.
      </p>
    ),
  },
  {
    title: 'License',
    body: (
      <p>
        WitnessWork is copyright © 2023–2026 Levi Wilkerson. Noncommercial
        sharing and modification are allowed under the{' '}
        <a
          href='https://github.com/leviFrosty/witness-work/blob/main/LICENSE'
          target='_blank'
          rel='noreferrer'
          className='ww-link'
        >
          Creative Commons Attribution–NonCommercial 4.0 license
        </a>
        , which requires credit, a license link, and notice of changes. Do not
        sell or commercially exploit the app or source code. The full license
        controls.
      </p>
    ),
  },
  {
    title: 'Availability and liability',
    body: (
      <p>
        WitnessWork is provided as is and may change or become unavailable. Back
        up important records. To the extent allowed by law, Levi Wilkerson is
        not responsible for losses from using the app.
      </p>
    ),
  },
]

export default function WitnessWorkTerms() {
  return (
    <PolicyPage
      path={TERMS_PATH}
      eyebrow='Terms'
      title='Terms of Use'
      description='Rules and responsibilities for using WitnessWork.'
      updated='Updated October 27, 2026'
      sections={sections}
    >
      Questions? Email{' '}
      <a
        href='mailto:support@witnesswork.app?subject=WitnessWork%20Terms'
        className='ww-link'
      >
        support@witnesswork.app
      </a>
      .
    </PolicyPage>
  )
}

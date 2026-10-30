import { PolicyPage } from '@/components/landing/policy-page'
import { noWebSaleNames } from '@/lib/noWebSaleNames'
import { TERMS_PATH } from '@/lib/paths'

const noWebSalePlaces = new Intl.ListFormat('en', {
  style: 'long',
  type: 'conjunction',
}).format(noWebSaleNames())

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
    title: 'Supporter purchases',
    body: (
      <p>
        Purchases in the App Store or Google Play follow Apple's or Google's
        terms. On the web, we sell Supporter subscriptions and Tips through
        RevenueCat Billing, with payments processed by Stripe on our own Stripe
        account. Web prices are in US dollars, with taxes included or added
        where required. Subscriptions renew automatically each month or year
        until you cancel. To cancel, use Manage subscription in WitnessWork on
        the web, or the link in any receipt email. Cancelling stops the next
        renewal; Supporter access lasts until the end of the period you paid
        for. For refunds, email support; a refund ends the access it paid for.
        Web purchases are not offered in, or with a card or billing address
        from, {noWebSalePlaces}; there, buy in the WitnessWork app from the App
        Store or Google Play, where available.
      </p>
    ),
  },
  {
    title: 'Availability and liability',
    body: (
      <p>
        WitnessWork, in the apps and on the web, is provided as is and may
        change or become unavailable. Back up important records. To the extent
        allowed by law, Levi Wilkerson is not responsible for losses from using
        the app.
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
      updated='Updated October 30, 2026'
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

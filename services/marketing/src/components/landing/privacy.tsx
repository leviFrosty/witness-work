import { PolicyPage } from '@/components/landing/policy-page'
import { PRIVACY_PATH } from '@/lib/paths'

const sections = [
  {
    title: 'Your records',
    body: (
      <p>
        WitnessWork is built by Levi Wilkerson. Records stay on your devices
        unless you use sync, backups, sharing, or online features. We do not
        sell your data or show ads. Cloud Sync is available to everyone and is
        on by default for new installs. You can turn it off on your phones;
        WitnessWork on the web always uses it. Cloud Sync (including its
        photos), backups, and Buddies content are encrypted end to end; we
        cannot read them. Our server sees a random account ID with no name
        attached, which devices sync and on what platform, and the size and time
        of each upload, but never what's inside. Photos are stored at full size,
        up to 2 GB per account, and the server cannot tell which contact or note
        a photo belongs to. Optional iCloud and Google Drive sync are not
        encrypted end to end by WitnessWork.
      </p>
    ),
  },
  {
    title: 'Signing in',
    body: (
      <p>
        Passkeys let you sign in without a password. For each passkey, our
        server stores its public key and details such as when it was added and
        last used and which password manager holds it. If a passkey can unlock
        your account, we also store your account key sealed so only that passkey
        can open it; we cannot. Face, fingerprint, and passcode checks happen on
        your device and never reach us. When you approve a browser from your
        phone, the phone shows the browser's name, system, and approximate
        location; our server keeps that location only for the few minutes the
        approval takes. New sign-ins appear in your account's activity, which
        records no IP address or location.
      </p>
    ),
  },
  {
    title: 'On the web',
    body: (
      <p>
        WitnessWork on the web (app.witnesswork.app) keeps your data, account
        key, and session in your browser's storage until you sign out, or until
        the server ends the session for security reasons. The account key and
        session are encrypted with a browser key that cannot be exported.
        Signing out erases them and your data from that browser. Anyone who can
        use this browser profile can open WitnessWork in it; on a shared
        computer, sign out when you're done, or turn on App Lock. Safari may
        erase a site's storage after 7 days without a visit, unless you added it
        to your Home Screen on iPhone; changes not yet synced are then lost. Web
        sign-up, and signing in with a recovery key on the web, use Cloudflare
        Turnstile to block automated abuse; Cloudflare processes your IP address
        and browser information for that check. Maps on the web use Apple MapKit
        JS in a separate page on maps.witnesswork.app. It receives only
        coordinates and pin styles, never names or notes. Apple processes map
        requests and connection data.
      </p>
    ),
  },
  {
    title: 'Online features',
    body: (
      <p>
        AI Notes Import sends submitted notes to AI service providers. Address
        and Help Center searches send search information to mapping and search
        providers. Android maps process map activity, device and connection
        data, and location when permitted. Buddies shares selected plans,
        profile information, and other content with your buddies; notification
        providers deliver alerts.
      </p>
    ),
  },
  {
    title: 'Purchases',
    body: (
      <p>
        App stores and purchase-management providers process purchases to verify
        Supporter access. On the web, we are the seller: Supporter subscriptions
        and Tips go through RevenueCat Billing, with payments processed by
        Stripe on our own Stripe account. Checkout runs on RevenueCat's pages
        and asks for an email for your receipt, your billing address, and
        payment details. Stripe processes your card; we never see your full card
        number. Your email and billing address are kept in our Stripe and
        RevenueCat accounts for receipts, tax, and refunds, and are linked to
        your purchases and your WitnessWork account. They are never stored on
        WitnessWork's servers or in the app, and usage statistics never include
        them or purchase identifiers.
      </p>
    ),
  },
  {
    title: 'Service data',
    body: (
      <p>
        We and our service providers use account identifiers, device and
        security information, purchase status, usage statistics, crash reports,
        and optional survey responses to run, protect, and improve WitnessWork.
        Accounts require no name, email, or phone number. Usage statistics
        exclude your records and typed text but may include your Publisher role,
        which can indicate religious affiliation. Hosting providers process
        connection data, including IP addresses.
      </p>
    ),
  },
  {
    title: 'Session replay',
    body: (
      <p>
        On the web, PostHog records about 1 in 10 sessions as masked replays
        that show how the app is used. All text except the app's own labels is
        hidden, every input is hidden, and images, the map, and canvas graphics
        are blocked. Replays never include network requests or console output.
        Replay follows your usage statistics setting, never runs in Data
        protection mode, and in the EU and UK runs only if you opt in. PostHog
        stores usage statistics and replays in the United States, and deletes
        replays after 30 days.
      </p>
    ),
  },
  {
    title: 'Retention',
    body: (
      <p>
        AI imports are normally deleted from our servers within about an hour;
        limited usage and abuse-prevention records remain. Our Cloud Sync copies
        and backups expire within 400 days of their last upload; account
        security history expires after 400 days. Deleted Cloud Sync photos are
        removed 30 days later, and all of an account's Cloud Sync photos are
        deleted a day after it stops using Cloud Sync. Purchase records in
        Stripe and RevenueCat are kept as long as tax and accounting law
        requires. A web session ends after 180 days without use. Some data is
        deleted sooner. Buddies content expires or is deleted through its
        controls; a record preventing reuse of deleted inbox addresses remains.
        We do not keep Help Center search logs.
      </p>
    ),
  },
  {
    title: 'Your choices',
    body: (
      <p>
        In the app, you can delete records, manage sync and backups, remove
        passkeys, sign out devices and browsers, and remove Buddies data. You
        can turn usage statistics off in Privacy settings, which also stops
        session replay; this does not stop crash reports, feature checks, or
        submitted surveys. Manage location permission in your device or browser
        settings. For privacy questions, or to request deletion of server data
        or of your checkout email and billing address (except records we must
        keep by law), email{' '}
        <a
          href='mailto:support@witnesswork.app?subject=WitnessWork%20Privacy'
          className='ww-link'
        >
          support@witnesswork.app
        </a>
        .
      </p>
    ),
  },
]

export default function WitnessWorkPrivacy() {
  return (
    <PolicyPage
      path={PRIVACY_PATH}
      eyebrow='Privacy'
      title='Privacy Policy'
      description='What WitnessWork collects, why, and your choices.'
      updated='Updated October 30, 2026'
      sections={sections}
    />
  )
}

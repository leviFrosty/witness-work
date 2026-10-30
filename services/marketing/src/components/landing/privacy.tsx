import { PolicyPage } from '@/components/landing/policy-page'
import { PRIVACY_PATH } from '@/lib/paths'

const sections = [
  {
    title: 'Your records',
    body: (
      <p>
        WitnessWork is built by Levi Wilkerson. Records stay on your device
        unless you use sharing or online features. We do not sell your data or
        show ads. Cloud Sync, backups, and Buddies content are encrypted end to
        end; we cannot read them. Optional iCloud and Google Drive sync are not
        encrypted end to end by WitnessWork.
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
        providers deliver alerts. App stores and purchase-management providers
        process purchases to verify Supporter access. We do not receive payment
        details.
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
    title: 'Retention',
    body: (
      <p>
        AI imports are normally deleted from our servers within about an hour;
        limited usage and abuse-prevention records remain. Our Cloud Sync copies
        and backups expire within 400 days of their last upload; account
        security history expires after 400 days. Some data is deleted sooner.
        Buddies content expires or is deleted through its controls; a record
        preventing reuse of deleted inbox addresses remains. We do not keep Help
        Center search logs.
      </p>
    ),
  },
  {
    title: 'Your choices',
    body: (
      <p>
        In the app, you can delete records, manage sync and backups, and remove
        Buddies data. You can turn usage statistics off in Privacy settings;
        this does not stop crash reports, feature checks, or submitted surveys.
        Manage location permission in your device settings. For privacy
        questions or server-data deletion requests, email{' '}
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
      updated='Updated October 27, 2026'
      sections={sections}
    />
  )
}

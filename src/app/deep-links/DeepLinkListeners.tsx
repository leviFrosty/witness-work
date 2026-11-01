import ContactImportListener from '@/features/contacts/components/ContactImportListener'
import SharedGoodNewsListener from '@/features/contacts/components/SharedGoodNewsListener'
import BuddyInviteListener from '@/app/deep-links/BuddyInviteListener'
import HandoffLinkListener from '@/app/deep-links/HandoffLinkListener'

export default function DeepLinkListeners() {
  return (
    <>
      <SharedGoodNewsListener />
      <ContactImportListener />
      <BuddyInviteListener />
      <HandoffLinkListener />
    </>
  )
}

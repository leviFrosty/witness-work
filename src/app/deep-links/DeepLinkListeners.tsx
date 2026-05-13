import ContactImportListener from '../../features/contacts/components/ContactImportListener'
import SharedGoodNewsListener from '../../features/contacts/components/SharedGoodNewsListener'

/**
 * Aggregates all components that subscribe to incoming URLs / file intents
 * outside of React Navigation's `linking` config. Each child renders nothing
 * and owns its own `Linking.addEventListener` subscription.
 */
export default function DeepLinkListeners() {
  return (
    <>
      <SharedGoodNewsListener />
      <ContactImportListener />
    </>
  )
}

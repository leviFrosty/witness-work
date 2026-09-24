import { useEffect } from 'react'
import Section from '@/components/ui/inputs/Section'
import TextInputRow from '@/components/ui/inputs/TextInputRow'
import i18n from '@/lib/locales'
import useProfile from '@/stores/profile'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

const MAX_NAME_LENGTH = 60

/** The display name buddies see; renames reach them with the next card. */
export default function BuddiesNameSection() {
  const displayName = useBuddies((state) => state.displayName)

  // Before Buddies has started, suggest the Profile name so the User isn't
  // asked for it twice. Once an inbox exists, an emptied name stays empty.
  useEffect(() => {
    const { displayName: current, registeredInboxId } = useBuddies.getState()
    const profileName = useProfile.getState().name.trim()
    if (!current && registeredInboxId === null && profileName) {
      useBuddies.setState({
        displayName: profileName.slice(0, MAX_NAME_LENGTH),
      })
    }
  }, [])

  return (
    <Section>
      <TextInputRow
        label={i18n.t('buddies_yourName')}
        description={i18n.t('buddies_yourName_description')}
        lastInSection
        textInputProps={{
          value: displayName,
          placeholder: i18n.t('buddies_yourName_placeholder'),
          maxLength: MAX_NAME_LENGTH,
          autoCapitalize: 'words',
          onChangeText: (value: string) =>
            useBuddies.setState({ displayName: value }),
          onEndEditing: () => {
            void buddiesEngine.publishCards().catch(() => {})
          },
        }}
      />
    </Section>
  )
}

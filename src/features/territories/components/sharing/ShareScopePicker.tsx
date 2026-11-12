import { View } from 'react-native'
import {
  Check as CheckIcon,
  HandHelping as HandHelpingIcon,
  Map as MapIcon,
} from 'lucide-react-native'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import Section from '@/components/ui/inputs/Section'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import PickMark from '@/features/territories/components/sharing/PickMark'
import TerritorySectionTitle from '@/features/territories/components/TerritorySectionTitle'
import {
  personName,
  pickedScopeText,
} from '@/features/territories/lib/shareText'
import {
  wholeMarked,
  type ShareScopeMode,
} from '@/features/territories/lib/shareScope'
import type { Territory } from '@/features/territories/types/territory'

export type { ShareScopeMode }

export default function ShareScopePicker({
  territory,
  mode,
  chosen,
  canPickWhole,
  privacy,
  onPickMode,
  onToggleStreet,
}: {
  territory: Territory
  mode: ShareScopeMode
  chosen: string[]
  canPickWhole: boolean
  privacy: boolean
  onPickMode: (mode: ShareScopeMode) => void
  onToggleStreet: (streetId: string) => void
}) {
  const theme = useTheme()
  const choosable = canPickWhole && territory.streets.length > 1
  const streets = mode === 'streets' ? territory.streets : []

  const radio = (value: ShareScopeMode, label: string, last: boolean) => (
    <InputRowButton
      key={value}
      testID={`territory-share-${value}`}
      label={label}
      checked={mode === value}
      onPress={() => onPickMode(value)}
      lastInSection={last}
    >
      <PickMark picked={mode === value} single />
    </InputRowButton>
  )

  return (
    <View style={{ gap: 8 }}>
      <TerritorySectionTitle>
        {i18n.t('territories.share.what')}
      </TerritorySectionTitle>
      <Section>
        {choosable ? (
          [
            radio('whole', i18n.t('territories.share.wholeTerritory'), false),
            radio(
              'streets',
              i18n.t('territories.share.chooseStreets'),
              streets.length === 0
            ),
          ]
        ) : (
          <InputRowButton
            testID='territory-share-scope'
            leftIcon={MapIcon}
            label={pickedScopeText(
              territory.streets,
              chosen,
              wholeMarked(mode, canPickWhole)
            )}
            lastInSection
          >
            {(wholeMarked(mode, canPickWhole) || chosen.length > 0) && (
              <LucideIcon
                icon={CheckIcon}
                size={20}
                color={theme.colors.accent}
              />
            )}
          </InputRowButton>
        )}
        {choosable &&
          streets.map((street, index) => {
            const last = index === streets.length - 1
            return street.handoff ? (
              <InputRowButton
                key={street.id}
                label={street.name}
                sublabel={i18n.t('territories.share.handedToName', {
                  name: personName(territory, street.handoff.personId),
                })}
                disabled
                lastInSection={last}
              >
                <LucideIcon
                  icon={HandHelpingIcon}
                  size={20}
                  color={theme.colors.textAlt}
                />
              </InputRowButton>
            ) : (
              <InputRowButton
                key={street.id}
                testID={`territory-share-street-${street.id}`}
                label={street.name}
                checked={chosen.includes(street.id)}
                onPress={() => onToggleStreet(street.id)}
                lastInSection={last}
              >
                <PickMark picked={chosen.includes(street.id)} />
              </InputRowButton>
            )
          })}
      </Section>
      {privacy && (
        <Text
          testID='territory-share-privacy'
          style={{
            color: theme.colors.textAlt,
            fontSize: theme.fontSize('sm'),
            paddingHorizontal: 5,
          }}
        >
          {i18n.t('territories.share.privacyNote')}
        </Text>
      )}
    </View>
  )
}

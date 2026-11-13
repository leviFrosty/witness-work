import { View } from 'react-native'
import {
  CircleCheck as CircleCheckIcon,
  HandHelping as HandHelpingIcon,
  MapPinned as MapPinnedIcon,
  Plus as PlusIcon,
} from 'lucide-react-native'
import type { ContextMenuEntries } from '@/components/ui/ContextMenu'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import Section from '@/components/ui/inputs/Section'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import SimpleProgressBar from '@/components/ui/SimpleProgressBar'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { formatNumber } from '@/lib/numbers'
import StreetHereNow from '@/features/territories/components/sharing/StreetHereNow'
import TerritorySectionTitle from '@/features/territories/components/TerritorySectionTitle'
import {
  progressShare,
  territoryHouseProgress,
} from '@/features/territories/lib/houses'
import { personName } from '@/features/territories/lib/shareText'
import {
  handoffSummary,
  streetSummary,
} from '@/features/territories/lib/territoryTitle'
import type {
  TerritoryPerson,
  TerritoryStreet,
} from '@/features/territories/types/territory'

export default function TerritoryStreetsSection({
  streets,
  readOnly,
  onOpen,
  onAdd,
  onSuggest,
  nextId,
  people,
  canAdd = true,
  menu,
}: {
  streets: TerritoryStreet[]

  people?: TerritoryPerson[]

  canAdd?: boolean

  readOnly: boolean
  onOpen: (street: TerritoryStreet) => void
  onAdd: () => void
  onSuggest?: () => void
  nextId?: string
  menu?: (street: TerritoryStreet) => ContextMenuEntries
}) {
  const theme = useTheme()
  if (streets.length === 0 && (readOnly || (!canAdd && !onSuggest))) return null

  const handedTo = (street: TerritoryStreet) =>
    street.handoff && personName({ people }, street.handoff.personId)
  const summary = (street: TerritoryStreet, finished: boolean) => {
    const name = handedTo(street)
    return name ? handoffSummary(street, name) : streetSummary(street, finished)
  }
  const worked = (street: TerritoryStreet) =>
    street.handoff && street.workedAt === undefined ? (
      <LucideIcon
        icon={HandHelpingIcon}
        size={20}
        color={theme.colors.textAlt}
        testID={`street-handed-off-${street.id}`}
      />
    ) : (
      street.workedAt !== undefined && (
        <LucideIcon
          icon={CircleCheckIcon}
          size={20}
          color={theme.colors.textAlt}
          testID={`street-worked-${street.id}`}
        />
      )
    )

  const suggestRow = () =>
    onSuggest && (
      <InputRowButton
        key='suggest'
        testID='territory-suggest-streets'
        leftIcon={MapPinnedIcon}
        label={i18n.t('territories.suggest.action')}
        sublabel={
          streets.length === 0
            ? i18n.t('territories.suggest.action_description')
            : undefined
        }
        onPress={onSuggest}
        lastInSection
      />
    )

  const houses = readOnly ? undefined : territoryHouseProgress({ streets })
  const share = houses && progressShare(houses)

  return (
    <View style={{ gap: 8 }}>
      <TerritorySectionTitle
        info={
          houses
            ? i18n.t('territories.houses.territoryProgress_info')
            : undefined
        }
      >
        {i18n.t('territories.streets')}
      </TerritorySectionTitle>
      {share !== undefined && (
        <View
          testID='territory-house-progress'
          style={{ gap: 6, marginHorizontal: 5, marginBottom: 4 }}
        >
          <Text
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
            }}
          >
            {i18n.t('territories.houses.territoryProgress', {
              percent: formatNumber(share, { style: 'percent' }),
            })}
          </Text>
          <SimpleProgressBar percentage={share} height={6} animated={false} />
        </View>
      )}
      <Section>
        {streets.map((street, index) =>
          readOnly ? (
            <InputRowContainer
              key={street.id}
              label={street.name}
              description={summary(street, true)}
              controlWidth='auto'
              lastInSection={index === streets.length - 1}
            >
              {worked(street)}
            </InputRowContainer>
          ) : (
            <InputRowButton
              key={street.id}
              label={street.name}
              sublabel={summary(street, false)}
              footnote={<StreetHereNow street={street} people={people} />}
              onPress={() => onOpen(street)}
              contextActions={menu?.(street)}
              lastInSection={
                !canAdd && !onSuggest && index === streets.length - 1
              }
              testID={`territory-street-${street.id}`}
              style={{ paddingTop: 12, paddingBottom: 12 }}
            >
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
              >
                {street.id === nextId && (
                  <Text
                    testID='territory-street-next'
                    style={{
                      fontFamily: theme.fonts.semiBold,
                      fontSize: theme.fontSize('sm'),
                      color: theme.colors.accent,
                    }}
                  >
                    {i18n.t('territories.suggest.upNext')}
                  </Text>
                )}
                {worked(street)}
                <LucideIcon
                  icon={ChevronForwardIcon}
                  size={14}
                  color={theme.colors.textAlt}
                />
              </View>
            </InputRowButton>
          )
        )}
        {!readOnly && canAdd && (
          <InputRowButton
            key='add'
            testID='territory-add-street'
            leftIcon={PlusIcon}
            label={i18n.t('territories.addStreet')}
            sublabel={
              streets.length === 0
                ? i18n.t('territories.addStreet_first')
                : undefined
            }
            onPress={onAdd}
            lastInSection={!onSuggest}
          />
        )}
        {!readOnly && onSuggest && suggestRow()}
      </Section>
    </View>
  )
}

import { View } from 'react-native'
import {
  CircleCheck as CircleCheckIcon,
  HandHelping as HandHelpingIcon,
  Plus as PlusIcon,
  Sparkles as SparklesIcon,
} from 'lucide-react-native'
import Button from '@/components/ui/Button'
import type { ContextMenuEntries } from '@/components/ui/ContextMenu'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import Section from '@/components/ui/inputs/Section'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import StreetHereNow from '@/features/territories/components/sharing/StreetHereNow'
import TerritorySectionTitle from '@/features/territories/components/TerritorySectionTitle'
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
        leftIcon={SparklesIcon}
        leftIconColor={theme.colors.accent}
        label={i18n.t('territories.suggest.action')}
        onPress={onSuggest}
        lastInSection
      />
    )

  if (streets.length === 0) {
    const choices = [
      onSuggest && {
        testID: 'territory-suggest-streets',
        icon: SparklesIcon,
        label: i18n.t('territories.suggest.action'),
        caption: i18n.t('territories.suggest.action_description'),
        onPress: onSuggest,
      },
      canAdd && {
        testID: 'territory-add-street',
        icon: PlusIcon,
        label: i18n.t(
          onSuggest ? 'territories.addStreet_byHand' : 'territories.addStreet'
        ),
        caption: onSuggest ? undefined : i18n.t('territories.addStreet_first'),
        onPress: onAdd,
      },
    ].filter((choice) => !!choice)

    return (
      <View style={{ gap: 8 }}>
        <TerritorySectionTitle>
          {i18n.t('territories.streets')}
        </TerritorySectionTitle>
        <View
          testID='territory-streets-start'
          style={{
            gap: 12,
            padding: 20,
            borderRadius: inputLayout.sectionRadius,
            borderCurve: 'continuous',
            backgroundColor: theme.colors.card,
          }}
        >
          {choices.map((choice, index) => {
            const main = index === 0
            const color = main ? theme.colors.textInverse : theme.colors.text
            return (
              <View key={choice.testID} style={{ gap: 8 }}>
                <Button
                  testID={choice.testID}
                  onPress={choice.onPress}
                  submitShortcut={false}
                  style={{
                    minHeight: 52,
                    paddingVertical: 12,
                    paddingHorizontal: 20,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    borderRadius: 26,
                    backgroundColor: main
                      ? theme.colors.accent
                      : theme.colors.background,
                  }}
                >
                  <LucideIcon
                    icon={choice.icon}
                    size={18}
                    color={main ? color : theme.colors.textAlt}
                    fill={main && onSuggest ? color : undefined}
                  />
                  <Text
                    style={{
                      flexShrink: 1,
                      textAlign: 'center',
                      fontFamily: main
                        ? theme.fonts.bold
                        : theme.fonts.semiBold,
                      fontSize: theme.fontSize(main ? 'lg' : 'md'),
                      color,
                    }}
                  >
                    {choice.label}
                  </Text>
                </Button>
                {choice.caption && (
                  <Text
                    style={{
                      textAlign: 'center',
                      color: theme.colors.textAlt,
                      fontSize: theme.fontSize('sm'),
                    }}
                  >
                    {choice.caption}
                  </Text>
                )}
              </View>
            )
          })}
        </View>
      </View>
    )
  }

  return (
    <View style={{ gap: 8 }}>
      <TerritorySectionTitle>
        {i18n.t('territories.streets')}
      </TerritorySectionTitle>
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
            onPress={onAdd}
            lastInSection={!onSuggest}
          />
        )}
        {!readOnly && onSuggest && suggestRow()}
      </Section>
    </View>
  )
}

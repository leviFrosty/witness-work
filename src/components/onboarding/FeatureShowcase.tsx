import { View } from 'react-native'
import { useMemo } from 'react'
import useTheme from '../../contexts/theme'
import Text from '../MyText'
import Card from '../Card'
import i18n, { TranslationKey } from '../../lib/locales'
import { usePreferences } from '../../stores/preferences'
import { Publisher } from '../../types/publisher'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { IconProp } from '@fortawesome/fontawesome-svg-core'
import {
  faStopwatch,
  faUsers,
  faComments,
  faMap,
  faBullseye,
  faCalendar,
  faDownload,
  faBell,
  faChartLine,
  faClock,
  faSquareCheck,
  faClipboardList,
  faHeart,
  faTag,
} from '@fortawesome/free-solid-svg-icons'

export interface Feature {
  id: string
  icon: IconProp
  titleKey: TranslationKey
  descriptionKey: TranslationKey
  availableFor: Publisher[]
  color: string
}

const getFeatureColors = (theme: ReturnType<typeof useTheme>) => [
  theme.colors.accent, // Primary accent (green)
  theme.colors.purple, // Purple
  theme.colors.teal, // Teal
  theme.colors.orange, // Orange
  theme.colors.pink, // Pink
  theme.colors.indigo, // Indigo
  theme.colors.cyan, // Cyan
  theme.colors.lime, // Lime
  theme.colors.rose, // Rose
  theme.colors.accent2, // Secondary accent (coral/pink)
  theme.colors.accent3, // Tertiary accent (blue)
  theme.colors.warn, // Warning color (yellow/orange)
  theme.colors.error, // Error color (red)
  theme.colors.accentBackground, // Accent background (light green)
]

const getFeatures = (theme: ReturnType<typeof useTheme>): Feature[] => {
  const colors = getFeatureColors(theme)

  return [
    {
      id: 'timer-tracking',
      icon: faStopwatch,
      titleKey: 'featureTimerTracking',
      descriptionKey: 'featureTimerTrackingDesc',
      availableFor: [
        'regularAuxiliary',
        'regularPioneer',
        'circuitOverseer',
        'specialPioneer',
        'custom',
      ],
      color: colors[1], // purple
    },
    {
      id: 'simple-time-checkbox',
      icon: faSquareCheck,
      titleKey: 'featureSimpleTimeCheckbox',
      descriptionKey: 'featureSimpleTimeCheckboxDesc',
      availableFor: ['publisher'],
      color: colors[0], // accent (green)
    },
    {
      id: 'detailed-time-tracking',
      icon: faClipboardList,
      titleKey: 'featureDetailedTimeTracking',
      descriptionKey: 'featureDetailedTimeTrackingDesc',
      availableFor: [
        'regularAuxiliary',
        'regularPioneer',
        'circuitOverseer',
        'specialPioneer',
        'custom',
      ],
      color: colors[5], // indigo
    },
    {
      id: 'time-tagging',
      icon: faTag,
      titleKey: 'featureTimeTagging',
      descriptionKey: 'featureTimeTaggingDesc',
      availableFor: [
        'regularAuxiliary',
        'regularPioneer',
        'circuitOverseer',
        'specialPioneer',
        'custom',
      ],
      color: colors[7], // lime
    },
    {
      id: 'contact-pins',
      icon: faMap,
      titleKey: 'featureContactPins',
      descriptionKey: 'featureContactPinsDesc',
      availableFor: [
        'publisher',
        'regularAuxiliary',
        'regularPioneer',
        'circuitOverseer',
        'specialPioneer',
        'custom',
      ],
      color: colors[3], // orange
    },
    {
      id: 'return-visit-conversations',
      icon: faComments,
      titleKey: 'featureReturnVisitConversations',
      descriptionKey: 'featureReturnVisitConversationsDesc',
      availableFor: [
        'publisher',
        'regularAuxiliary',
        'regularPioneer',
        'circuitOverseer',
        'specialPioneer',
        'custom',
      ],
      color: colors[6], // cyan
    },
    {
      id: 'upcoming-visits',
      icon: faBell,
      titleKey: 'featureUpcomingVisits',
      descriptionKey: 'featureUpcomingVisitsDesc',
      availableFor: [
        'publisher',
        'regularAuxiliary',
        'regularPioneer',
        'circuitOverseer',
        'specialPioneer',
        'custom',
      ],
      color: colors[4], // pink
    },
    {
      id: 'contact-actions',
      icon: faUsers,
      titleKey: 'featureContactActions',
      descriptionKey: 'featureContactActionsDesc',
      availableFor: [
        'publisher',
        'regularAuxiliary',
        'regularPioneer',
        'circuitOverseer',
        'specialPioneer',
        'custom',
      ],
      color: colors[6], // teal
    },
    {
      id: 'monthly-reports',
      icon: faChartLine,
      titleKey: 'featureMonthlyReports',
      descriptionKey: 'featureMonthlyReportsDesc',
      availableFor: [
        'regularAuxiliary',
        'regularPioneer',
        'circuitOverseer',
        'specialPioneer',
        'custom',
      ],
      color: colors[1], // purple
    },
    {
      id: 'backup-restore',
      icon: faDownload,
      titleKey: 'featureBackupRestore',
      descriptionKey: 'featureBackupRestoreDesc',
      availableFor: [
        'publisher',
        'regularAuxiliary',
        'regularPioneer',
        'circuitOverseer',
        'specialPioneer',
        'custom',
      ],
      color: colors[7], // lime
    },
    {
      id: 'automatic-goals',
      icon: faBullseye,
      titleKey: 'featureAutomaticGoals',
      descriptionKey: 'featureAutomaticGoalsDesc',
      availableFor: [
        'regularAuxiliary',
        'regularPioneer',
        'circuitOverseer',
        'specialPioneer',
        'custom',
      ],
      color: colors[8], // rose
    },
    {
      id: 'schedule-planning',
      icon: faCalendar,
      titleKey: 'featureSchedulePlanning',
      descriptionKey: 'featureSchedulePlanningDesc',
      availableFor: [
        'regularAuxiliary',
        'regularPioneer',
        'circuitOverseer',
        'specialPioneer',
        'custom',
      ],
      color: colors[5], // indigo
    },
    {
      id: 'gamified-routine',
      icon: faClock,
      titleKey: 'featureGamifiedRoutine',
      descriptionKey: 'featureGamifiedRoutineDesc',
      availableFor: [
        'publisher',
        'regularAuxiliary',
        'regularPioneer',
        'circuitOverseer',
        'specialPioneer',
        'custom',
      ],
      color: colors[3], // orange
    },
    {
      id: 'words-of-affirmation',
      icon: faHeart,
      titleKey: 'featureWordsOfAffirmation',
      descriptionKey: 'featureWordsOfAffirmationDesc',
      availableFor: [
        'publisher',
        'regularAuxiliary',
        'regularPioneer',
        'circuitOverseer',
        'specialPioneer',
        'custom',
      ],
      color: colors[4], // pink
    },
  ]
}

const FeatureRow = ({ feature }: { feature: Feature }) => {
  const theme = useTheme()

  return (
    <Card
      flexDirection='row'
      style={{
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        marginBottom: 8,
        gap: 0,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: feature.color,
          justifyContent: 'center',
          alignItems: 'center',
          marginRight: 12,
        }}
      >
        <FontAwesomeIcon
          icon={feature.icon}
          size={18}
          color={theme.colors.textInverse}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 16,
            fontFamily: 'Inter_600SemiBold',
            color: theme.colors.text,
            marginBottom: 2,
          }}
        >
          {i18n.t(feature.titleKey)}
        </Text>
        <Text
          style={{
            fontSize: 14,
            color: theme.colors.textAlt,
            lineHeight: 18,
          }}
        >
          {i18n.t(feature.descriptionKey)}
        </Text>
      </View>
    </Card>
  )
}

interface FeatureShowcaseProps {
  style?: object
}

const FeatureShowcase = ({ style }: FeatureShowcaseProps) => {
  const theme = useTheme()
  const { publisher } = usePreferences()

  const availableFeatures = useMemo(() => {
    const features = getFeatures(theme)
    return features.filter((feature) =>
      feature.availableFor.includes(publisher)
    )
  }, [publisher, theme])

  return (
    <View style={[{ marginTop: 40 }, style]}>
      <View style={{ marginBottom: 16 }}>
        <Text
          style={{
            fontSize: 18,
            fontFamily: 'Inter_600SemiBold',
            color: theme.colors.text,
            marginBottom: 4,
          }}
        >
          {i18n.t('featuresForYou')}
        </Text>
        <Text
          style={{
            fontSize: 14,
            color: theme.colors.textAlt,
          }}
        >
          {i18n.t('featuresBasedOnType')}
        </Text>
      </View>

      <View style={{}}>
        {availableFeatures.map((feature) => (
          <FeatureRow key={feature.id} feature={feature} />
        ))}
      </View>
    </View>
  )
}

export default FeatureShowcase

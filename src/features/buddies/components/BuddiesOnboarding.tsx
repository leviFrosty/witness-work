import useFormValidation from '@/hooks/useFormValidation'
import { ReactNode, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  CalendarHeart as CalendarHeartIcon,
  Lock as LockIcon,
  ShieldCheck as ShieldCheckIcon,
  Users as UsersIcon,
} from 'lucide-react-native'
import { ChevronBackwardIcon } from '@/components/ui/DirectionalIcon'
import ActionButton from '@/components/ui/ActionButton'
import IconButton from '@/components/ui/IconButton'
import InfoPopover from '@/components/ui/InfoPopover'
import LucideIcon, { AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import WholeWordsText from '@/components/ui/WholeWordsText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { useProfile } from '@/stores/profile'
import BuddiesAccountNameHint from '@/features/buddies/components/BuddiesAccountNameHint'
import BuddiesSharingSection from '@/features/buddies/components/BuddiesSharingSection'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import { useFoldColumn } from '@/components/ui/layout/FoldPane'

const STEPS = ['intro', 'profile'] as const

function Feature({
  icon,
  title,
  body,
}: {
  icon: AppIcon
  title: string
  body: string
}) {
  const theme = useTheme()
  return (
    <View style={{ flexDirection: 'row', gap: 14 }}>
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.accentTranslucent,
        }}
      >
        <LucideIcon icon={icon} size={20} color={theme.colors.accent} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontFamily: theme.fonts.semiBold }}>{title}</Text>
        <Text style={{ color: theme.colors.textAlt }}>{body}</Text>
      </View>
    </View>
  )
}

export default function BuddiesOnboarding({
  onDone,
  profileEditor,
}: {
  onDone: () => void

  profileEditor: (nameInvalid: boolean) => ReactNode
}) {
  const foldColumn = useFoldColumn(560)
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const profileName = useProfile((state) => state.name.trim())

  const accountName = useBuddies((state) => state.cardName?.name)
  const hasName = profileName.length > 0 || !!accountName
  const [step, setStep] = useState(0)
  const validation = useFormValidation({ name: !hasName }, 'buddies_profile')
  const current = STEPS[step]
  const next = () => setStep((index) => index + 1)

  const title = {
    flexShrink: 1,
    fontFamily: theme.fonts.bold,
    fontSize: theme.fontSize('2xl'),
  }
  const lead = { color: theme.colors.textAlt, lineHeight: 22 }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
        paddingTop: 8,
        paddingBottom: insets.bottom + 16,
      }}
    >
      <View
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 15,
            minHeight: 40,
          },

          foldColumn,
        ]}
      >
        {step > 0 ? (
          <IconButton
            icon={ChevronBackwardIcon}
            size='lg'
            onPress={() => setStep((index) => index - 1)}
            accessibilityLabel={i18n.t('goBack')}
          />
        ) : (
          <View />
        )}
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {STEPS.map((key, index) => (
            <View
              key={key}
              style={{
                width: index === step ? 18 : 6,
                height: 6,
                borderRadius: 3,
                backgroundColor:
                  index === step ? theme.colors.accent : theme.colors.border,
              }}
            />
          ))}
        </View>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          {
            gap: 24,
            padding: 20,
            width: '100%',
            maxWidth: 560,
            alignSelf: 'center',
          },
          foldColumn,
        ]}
        keyboardShouldPersistTaps='handled'
      >
        {current === 'intro' && (
          <>
            <View style={{ gap: 10 }}>
              <LucideIcon
                icon={UsersIcon}
                size={44}
                color={theme.colors.accent}
              />
              <WholeWordsText style={title}>
                {i18n.t('buddies_onboardingWelcomeTitle')}
              </WholeWordsText>
              <Text style={lead}>
                {i18n.t('buddies_onboardingWelcomeBody')}
              </Text>
            </View>
            <View style={{ gap: 20 }}>
              <Feature
                icon={CalendarHeartIcon}
                title={i18n.t('buddies_onboardingSharedTitle')}
                body={i18n.t('buddies_invitePlansLine')}
              />
              <Feature
                icon={LockIcon}
                title={i18n.t('buddies_onboardingEncryptedTitle')}
                body={i18n.t('buddies_onboardingEncryptedBody')}
              />
              <Feature
                icon={ShieldCheckIcon}
                title={i18n.t('buddies_onboardingControlTitle')}
                body={i18n.t('buddies_onboardingControlBody')}
              />
            </View>
          </>
        )}
        {current === 'profile' && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <WholeWordsText style={title}>
                {i18n.t('buddies_onboardingProfileTitle')}
              </WholeWordsText>
              <InfoPopover
                title={i18n.t('buddies_onboardingProfileTitle')}
                description={i18n.t('buddies_onboardingProfileInfo')}
              />
            </View>
            {profileEditor(validation.invalid('name'))}
            <BuddiesAccountNameHint style={lead} />
            <BuddiesSharingSection withoutProfile />
          </>
        )}
      </ScrollView>
      <View
        style={[
          {
            gap: 12,
            paddingHorizontal: 20,
            paddingTop: 8,
            width: '100%',
            maxWidth: 560,
            alignSelf: 'center',
          },
          foldColumn,
        ]}
      >
        {current === 'profile' && !hasName && (
          <Text style={{ color: theme.colors.textAlt, textAlign: 'center' }}>
            {i18n.t('buddies_nameRequired')}
          </Text>
        )}
        <ActionButton
          onPress={() => {
            if (step !== STEPS.length - 1) next()
            else if (validation.validate()) onDone()
          }}
        >
          {step === STEPS.length - 1
            ? i18n.t('getStarted')
            : i18n.t('continue')}
        </ActionButton>
      </View>
    </View>
  )
}

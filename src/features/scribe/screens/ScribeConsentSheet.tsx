import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { ScrollView, View } from 'react-native'
import {
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native'
import {
  ShieldCheck as ShieldCheckIcon,
  SquareArrowOutUpRight as ExternalIcon,
} from 'lucide-react-native'
import Button from '@/components/ui/Button'
import { ChecklistIcon } from '@/components/ui/DirectionalIcon'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import links from '@/constants/links'
import useTheme from '@/contexts/theme'
import { openURL } from '@/lib/links'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import type { RootStackNavigation, RootStackParamList } from '@/types/rootStack'
import ScribeSheetFrame from '@/features/scribe/components/ScribeSheetFrame'
import ScribeZeroDataRetentionDetails, {
  ScribeZeroDataRetentionHeading,
} from '@/features/scribe/components/ScribeZeroDataRetentionDetails'
import {
  acceptScribeTerms,
  markScribePrivacySeen,
  pendingScribeConsent,
} from '@/features/scribe/stores/consent'
import {
  trackPrivacyViewed,
  trackScribeTurnedOnOff,
  trackTermsResolved,
} from '@/features/scribe/analytics'

type Step = 'terms' | 'privacy'

const ScribeConsentSheet = () => {
  const navigation = useNavigation<RootStackNavigation>()
  const { params } = useRoute<RouteProp<RootStackParamList, 'ScribeConsent'>>()
  const setPreferences = usePreferences((s) => s.set)
  const surface = params.mode === 'open' ? 'first_open' : 'settings'

  const [steps] = useState<Step[]>(() => {
    if (params.mode === 'enable') return ['terms']
    const pending = pendingScribeConsent()
    return [
      ...(pending.terms ? (['terms'] as const) : []),
      ...(pending.privacy ? (['privacy'] as const) : []),
    ]
  })
  const [index, setIndex] = useState(0)
  const step: Step | undefined = steps[index]

  const finished = useRef(false)

  const finish = () => {
    if (finished.current) return
    finished.current = true
    if (params.mode === 'enable') {
      setPreferences({ scribeAiEnabled: true })
      trackScribeTurnedOnOff(true)
      navigation.goBack()
    } else if (params.next.route === 'ScribeVoice') {
      navigation.replace('ScribeVoice', params.next.params)
    } else {
      navigation.replace('ScribeConversation', params.next.params)
    }
  }
  const advance = () => {
    if (index + 1 < steps.length) setIndex(index + 1)
    else finish()
  }

  const finishIfNothingToAsk = useEffectEvent(() => {
    if (!step) finish()
  })
  useEffect(() => finishIfNothingToAsk(), [])

  useEffect(() => {
    if (step === 'privacy') trackPrivacyViewed('first_open')
  }, [step])

  const close = () => {
    if (step === 'terms') trackTermsResolved(surface, 'dismissed')
    navigation.goBack()
  }

  if (!step) return null

  return (
    <ScribeSheetFrame onDismissRequest={close}>
      {step === 'terms' ? (
        <TermsStep
          onAccept={() => {
            acceptScribeTerms()
            trackTermsResolved(surface, 'accepted')
            advance()
          }}
        />
      ) : (
        <PrivacyStep
          onContinue={() => {
            markScribePrivacySeen()
            advance()
          }}
        />
      )}
    </ScribeSheetFrame>
  )
}

function TermsStep({ onAccept }: { onAccept: () => void }) {
  const theme = useTheme()
  return (
    <>
      {}
      <ScrollView
        style={{ flexGrow: 0, flexShrink: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 22,
          paddingTop: 6,
          gap: 20,
        }}
      >
        <Text
          accessibilityRole='header'
          style={{
            fontSize: theme.fontSize('xl'),
            fontFamily: theme.fonts.bold,
          }}
        >
          {i18n.t('scribe_termsTitle')}
        </Text>
        <Point
          icon={ShieldCheckIcon}
          title={i18n.t('scribe_termsPrivateTitle')}
          body={i18n.t('scribe_termsPrivateBody')}
        />
        <Point
          icon={ChecklistIcon}
          title={i18n.t('scribe_termsMistakesTitle')}
          body={i18n.t('scribe_termsMistakesBody')}
        />
        <View style={{ gap: 4 }}>
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
              lineHeight: 20,
            }}
          >
            {i18n.t('scribe_termsBody')}
          </Text>
          <View
            style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 24 }}
          >
            <PolicyLink label={i18n.t('termsOfUse')} url={links.termsOfUse} />
            <PolicyLink
              label={i18n.t('privacyPolicy')}
              url={links.privacyPolicy}
            />
          </View>
        </View>
      </ScrollView>
      <View style={{ paddingHorizontal: 22, paddingTop: 8, paddingBottom: 8 }}>
        <PrimaryButton label={i18n.t('scribe_termsAgree')} onPress={onAccept} />
      </View>
    </>
  )
}

function Point({
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
    <View accessible style={{ flexDirection: 'row', gap: 14 }}>
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: theme.colors.accentTranslucent,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <LucideIcon icon={icon} size={20} color={theme.colors.accent} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={{
            fontSize: theme.fontSize('md'),
            fontFamily: theme.fonts.semiBold,
            color: theme.colors.text,
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            fontSize: theme.fontSize('sm'),
            color: theme.colors.textAlt,
            lineHeight: 20,
          }}
        >
          {body}
        </Text>
      </View>
    </View>
  )
}

function PolicyLink({ label, url }: { label: string; url: string }) {
  const theme = useTheme()
  return (
    <Button
      noTransform
      accessibilityRole='link'
      onPress={() => openURL(url)}
      style={{
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'transparent',
      }}
    >
      <Text
        style={{
          fontSize: theme.fontSize('md'),
          fontFamily: theme.fonts.semiBold,
          color: theme.colors.accent,
        }}
      >
        {label}
      </Text>
      <LucideIcon icon={ExternalIcon} size={14} color={theme.colors.accent} />
    </Button>
  )
}

function PrivacyStep({ onContinue }: { onContinue: () => void }) {
  return (
    <>
      {}
      <ScrollView
        style={{ flexGrow: 0, flexShrink: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 22,
          paddingTop: 6,
          gap: 20,
        }}
      >
        <ScribeZeroDataRetentionHeading />
        <ScribeZeroDataRetentionDetails />
      </ScrollView>
      <View style={{ paddingHorizontal: 22, paddingTop: 8, paddingBottom: 8 }}>
        <PrimaryButton
          label={i18n.t('scribe_consentContinue')}
          onPress={onContinue}
        />
      </View>
    </>
  )
}

function PrimaryButton({
  label,
  onPress,
}: {
  label: string
  onPress: () => void
}) {
  const theme = useTheme()
  return (
    <Button
      noTransform
      onPress={onPress}
      style={{
        minHeight: 52,
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 999,
        backgroundColor: theme.colors.accent,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          fontSize: theme.fontSize('lg'),
          fontFamily: theme.fonts.semiBold,
          color: theme.colors.textInverse,
        }}
      >
        {label}
      </Text>
    </Button>
  )
}

export default ScribeConsentSheet

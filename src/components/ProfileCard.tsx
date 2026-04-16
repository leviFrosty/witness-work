import { useMemo, useRef, useState } from 'react'
import { Pressable, View } from 'react-native'
import moment from 'moment'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import {
  faChevronRight,
  faClock,
  faHeart,
  faStar,
} from '@fortawesome/free-solid-svg-icons'
import useTheme from '../contexts/theme'
import { usePreferences } from '../stores/preferences'
import usePublisher from '../hooks/usePublisher'
import useCustomer from '../hooks/useCustomer'
import Card from './Card'
import Text from './MyText'
import Avatar from './Avatar'
import TiltableCard from './TiltableCard'
import ProfileDetailOverlay, { OriginRect } from './ProfileDetailOverlay'
import i18n from '../lib/locales'
import { isPioneer } from './ProfileSetupForm'
import { supporterSinceDate } from '../lib/supporterSince'

interface Props {
  /** Disables interaction; used for the live preview inside onboarding. */
  preview?: boolean
  /**
   * Called when the card is tapped in its incomplete state. The home screen
   * wires this to open the existing-user profile setup sheet.
   */
  onPressIncomplete?: () => void
}

const daysSince = (from: Date): number =>
  Math.max(1, moment().diff(moment(from), 'days'))

type TenureTone = 'supporter' | 'pioneer' | 'installed'

type Tenure = {
  tone: TenureTone
  icon: IconDefinition
  tint: string
  text: string
}

const buildTenureText = (tone: TenureTone, days: number): string => {
  const formatted = days.toLocaleString()
  if (tone === 'supporter') {
    return days === 1
      ? i18n.t('profileSupporterForDay')
      : i18n.t('profileSupporterForDays', { days: formatted })
  }
  if (tone === 'pioneer') {
    return days === 1
      ? i18n.t('profilePioneeringForDay')
      : i18n.t('profilePioneeringForDays', { days: formatted })
  }
  return days === 1
    ? i18n.t('profileUsingForDay')
    : i18n.t('profileUsingForDays', { days: formatted })
}

const CARD_PADDING_V = 14
const CARD_PADDING_H = 16

const ProfileCard = ({ preview, onPressIncomplete }: Props) => {
  const theme = useTheme()
  const {
    name,
    avatar,
    installedOn,
    pioneerStartDate,
    hasCompletedProfileSetup,
  } = usePreferences()
  const { status: publisher } = usePublisher()
  const { customer } = useCustomer()
  const supporterSince = useMemo(() => supporterSinceDate(customer), [customer])
  const [detailOpen, setDetailOpen] = useState(false)
  const [origin, setOrigin] = useState<OriginRect | null>(null)
  const anchorRef = useRef<View>(null)

  const isIncomplete = !preview && !hasCompletedProfileSetup

  const handlePress = () => {
    if (preview) return
    if (isIncomplete) onPressIncomplete?.()
  }

  const handleTap = () => {
    anchorRef.current?.measureInWindow((x, y, width, height) => {
      setOrigin({ x, y, width, height })
      setDetailOpen(true)
    })
  }

  const handleClosed = () => {
    setOrigin(null)
  }

  if (isIncomplete) {
    return (
      <Pressable onPress={handlePress}>
        <Card
          flexDirection='row'
          style={{
            alignItems: 'center',
            gap: 12,
            paddingVertical: CARD_PADDING_V,
            paddingHorizontal: CARD_PADDING_H,
          }}
        >
          <Avatar
            avatar={{ type: 'none', value: '' }}
            size={40}
            background={theme.colors.accentBackground}
          />
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontFamily: theme.fonts.semiBold,
                fontSize: 15,
                color: theme.colors.text,
              }}
            >
              {i18n.t('profileIncompleteTitle')}
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: theme.colors.textAlt,
                marginTop: 1,
              }}
            >
              {i18n.t('profileIncompleteSubtitle')}
            </Text>
          </View>
          <FontAwesomeIcon
            icon={faChevronRight}
            size={13}
            color={theme.colors.textAlt}
          />
        </Card>
      </Pressable>
    )
  }

  const trimmedName = name.trim()
  const greeting =
    trimmedName.length > 0
      ? i18n.t('profileGreeting', { name: trimmedName })
      : i18n.t('profileGreetingNoName')

  const tenure: Tenure = (() => {
    if (supporterSince) {
      return {
        tone: 'supporter',
        icon: faHeart,
        tint: theme.colors.rose,
        text: buildTenureText('supporter', daysSince(supporterSince)),
      }
    }
    if (isPioneer(publisher) && pioneerStartDate) {
      return {
        tone: 'pioneer',
        icon: faStar,
        tint: theme.colors.warn,
        text: buildTenureText('pioneer', daysSince(new Date(pioneerStartDate))),
      }
    }
    return {
      tone: 'installed',
      icon: faClock,
      tint: theme.colors.textAlt,
      text: buildTenureText('installed', daysSince(new Date(installedOn))),
    }
  })()

  const cardBody = (
    <Card
      style={{
        paddingVertical: CARD_PADDING_V,
        paddingHorizontal: CARD_PADDING_H,
        gap: 10,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar avatar={avatar} name={trimmedName} size={44} />
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: theme.fonts.semiBold,
              fontSize: 16,
              color: theme.colors.text,
            }}
            numberOfLines={1}
          >
            {greeting}
          </Text>
          <Text
            style={{
              fontSize: 12,
              color: theme.colors.textAlt,
              marginTop: 1,
            }}
          >
            {i18n.t(publisher)}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <FontAwesomeIcon icon={tenure.icon} size={11} color={tenure.tint} />
        <Text style={{ fontSize: 12, color: theme.colors.textAlt }}>
          {tenure.text}
        </Text>
      </View>
    </Card>
  )

  if (preview) {
    return <Pressable disabled>{cardBody}</Pressable>
  }

  return (
    <>
      <View ref={anchorRef} collapsable={false}>
        <TiltableCard onTap={handleTap}>{cardBody}</TiltableCard>
      </View>
      <ProfileDetailOverlay
        origin={origin}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        onClosed={handleClosed}
      />
    </>
  )
}

export default ProfileCard

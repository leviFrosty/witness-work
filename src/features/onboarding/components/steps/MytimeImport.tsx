import {
  CircleAlert as CircleAlertIcon,
  CircleCheck as CircleCheckIcon,
  FileInput as FileInputIcon,
} from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { View } from 'react-native'
import { Spinner } from 'tamagui'
import { styles } from '@/features/onboarding/components/Onboarding.styles'
import OnboardingNav from '@/features/onboarding/components/OnboardingNav'
import Text from '@/components/ui/MyText'
import Wrapper from '@/components/ui/layout/Wrapper'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { useMytimeImport } from '@/features/mytime-import/hooks/useMytimeImport'
import MytimeImportPreview from '@/features/mytime-import/components/MytimeImportPreview'

interface Props {
  goBack: () => void
  goNext: () => void
}

/**
 * Onboarding step offering a one-shot import from a MyTime backup. Uses
 * `'overwrite'` mode — this is a fresh user, so imported Publisher role /
 * Tenure Start Date seed the profile the remaining steps build on. Always
 * skippable; skipping just advances with no side effects.
 *
 * Unlike the iCloud restore step, a successful import does NOT complete
 * onboarding — MyTime carries no profile/preferences, so the user still walks
 * the rest of the flow (with their imported role pre-selected).
 */
const MytimeImport = ({ goBack, goNext }: Props) => {
  const theme = useTheme()
  const {
    status,
    preview,
    errorKind,
    selection,
    toggleSelection,
    canConfirm,
    pickAndParse,
    confirm,
    reset,
  } = useMytimeImport({ publisherMode: 'overwrite' })

  const titleColorInverse = {
    color: theme.colors.textInverse,
    fontFamily: theme.fonts.bold,
    fontSize: theme.fontSize('lg'),
  }

  return (
    <Wrapper
      style={{
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 60,
        paddingBottom: 60,
      }}
    >
      <OnboardingNav goBack={goBack} />
      <View style={{ flex: 1, paddingTop: 30 }}>
        <View
          style={{
            width: 64,
            height: 64,
            marginBottom: 20,
            borderRadius: 32,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.accentTranslucent,
          }}
        >
          <LucideIcon
            icon={FileInputIcon}
            size={28}
            color={theme.colors.accent}
          />
        </View>
        <Text style={styles.stepTitle}>{i18n.t('mytimeImport_title')}</Text>
        <Text
          style={{
            fontSize: 14,
            color: theme.colors.textAlt,
            marginTop: 8,
            marginBottom: 24,
            lineHeight: 20,
          }}
        >
          {i18n.t('mytimeImport_description')}
        </Text>

        {status === 'preview' && preview && (
          <MytimeImportPreview
            preview={preview}
            selection={selection}
            onToggle={toggleSelection}
          />
        )}

        {status === 'committing' && (
          <Card
            style={{
              alignItems: 'center',
              justifyContent: 'center',
              gap: 14,
              paddingVertical: 32,
            }}
          >
            <Spinner size='large' color={theme.colors.accent} />
            <Text style={{ color: theme.colors.textAlt }}>
              {i18n.t('mytimeImport_importing')}
            </Text>
          </Card>
        )}

        {status === 'success' && (
          <Card
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 12,
              borderWidth: 1,
              borderColor: theme.colors.accentTranslucent,
            }}
          >
            <LucideIcon
              icon={CircleCheckIcon}
              size={18}
              color={theme.colors.accent}
            />
            <Text style={{ flex: 1, color: theme.colors.text }}>
              {i18n.t('mytimeImport_success')}
            </Text>
          </Card>
        )}

        {status === 'error' && (
          <Card
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 12,
            }}
          >
            <LucideIcon
              icon={CircleAlertIcon}
              size={18}
              color={theme.colors.textAlt}
            />
            <Text style={{ flex: 1, color: theme.colors.textAlt }}>
              {errorKind === 'invalidFile'
                ? i18n.t('mytimeImport_invalidFile')
                : i18n.t('mytimeImport_error')}
            </Text>
          </Card>
        )}
      </View>

      <View style={{ gap: 10 }}>
        {status === 'success' ? (
          <ActionButton onPress={goNext}>
            <Text style={titleColorInverse}>{i18n.t('continue')}</Text>
          </ActionButton>
        ) : status === 'committing' ? null : status === 'preview' ? (
          <>
            <ActionButton disabled={!canConfirm} onPress={confirm}>
              <Text style={titleColorInverse}>
                {i18n.t('mytimeImport_confirm')}
              </Text>
            </ActionButton>
            <Button
              onPress={reset}
              style={{ alignSelf: 'center', paddingVertical: 10 }}
            >
              <Text
                style={{
                  color: theme.colors.textAlt,
                  textDecorationLine: 'underline',
                }}
              >
                {i18n.t('mytimeImport_chooseDifferent')}
              </Text>
            </Button>
          </>
        ) : (
          <>
            <ActionButton
              disabled={status === 'parsing'}
              onPress={pickAndParse}
            >
              {status === 'parsing' ? (
                <Spinner color={theme.colors.textInverse} />
              ) : (
                <Text style={titleColorInverse}>
                  {i18n.t('mytimeImport_choose')}
                </Text>
              )}
            </ActionButton>
            <Button
              onPress={goNext}
              style={{ alignSelf: 'center', paddingVertical: 10 }}
            >
              <Text
                style={{
                  color: theme.colors.textAlt,
                  textDecorationLine: 'underline',
                }}
              >
                {i18n.t('skip')}
              </Text>
            </Button>
          </>
        )}
      </View>
    </Wrapper>
  )
}

export default MytimeImport

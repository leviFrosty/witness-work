import { View } from 'react-native'
import { Spinner } from 'tamagui'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import {
  faCircleExclamation,
  faFileImport,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import Text from '@/components/ui/MyText'
import Wrapper from '@/components/ui/layout/Wrapper'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import XView from '@/components/ui/layout/XView'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { useMytimeImport } from '@/features/mytime-import/hooks/useMytimeImport'
import MytimeImportPreview from '@/features/mytime-import/components/MytimeImportPreview'

/**
 * Settings surface for the MyTime importer. Uses `'fillIfUnset'` so importing
 * here never clobbers a Publisher role / Tenure Start Date the user already set
 * (decision 4) — onboarding uses `'overwrite'` instead.
 */
const MytimeImportScreen = () => {
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
  } = useMytimeImport({ publisherMode: 'fillIfUnset' })

  return (
    <Wrapper insets='bottom' style={{ paddingHorizontal: 15, paddingTop: 30 }}>
      <KeyboardAwareScrollView contentContainerStyle={{ gap: 24 }}>
        <Text
          style={{
            fontSize: theme.fontSize('xl'),
            fontFamily: theme.fonts.semiBold,
          }}
        >
          {i18n.t('mytimeImport_title')}
        </Text>
        <Text style={{ color: theme.colors.textAlt }}>
          {i18n.t('mytimeImport_description')}
        </Text>

        {status === 'success' ? (
          <Card style={{ gap: 16 }}>
            <XView>
              <Badge color={theme.colors.accentTranslucent}>
                <Text>{i18n.t('mytimeImport_success')}</Text>
              </Badge>
            </XView>
            <Button onPress={reset} style={{ alignSelf: 'center' }}>
              <Text
                style={{
                  color: theme.colors.textAlt,
                  textDecorationLine: 'underline',
                }}
              >
                {i18n.t('mytimeImport_importAnother')}
              </Text>
            </Button>
          </Card>
        ) : status === 'committing' ? (
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
        ) : preview && status === 'preview' ? (
          <View style={{ gap: 16 }}>
            <MytimeImportPreview
              preview={preview}
              selection={selection}
              onToggle={toggleSelection}
            />
            <ActionButton disabled={!canConfirm} onPress={confirm}>
              <Text
                style={{
                  color: theme.colors.textInverse,
                  fontFamily: theme.fonts.bold,
                }}
              >
                {i18n.t('mytimeImport_confirm')}
              </Text>
            </ActionButton>
            <Button
              onPress={reset}
              style={{ alignSelf: 'center', paddingVertical: 8 }}
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
          </View>
        ) : (
          <View style={{ gap: 16 }}>
            {status === 'error' && (
              <Card
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: 12,
                }}
              >
                <FontAwesomeIcon
                  icon={faCircleExclamation}
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
            <Card>
              <ActionButton
                disabled={status === 'parsing'}
                onPress={pickAndParse}
              >
                {status === 'parsing' ? (
                  <Spinner color={theme.colors.textInverse} />
                ) : (
                  <XView>
                    <IconButton
                      icon={faFileImport}
                      color={theme.colors.textInverse}
                    />
                    <Text
                      style={{
                        color: theme.colors.textInverse,
                        fontFamily: theme.fonts.bold,
                      }}
                    >
                      {i18n.t('mytimeImport_choose')}
                    </Text>
                  </XView>
                )}
              </ActionButton>
            </Card>
          </View>
        )}
      </KeyboardAwareScrollView>
    </Wrapper>
  )
}

export default MytimeImportScreen

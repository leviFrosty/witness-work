import { useState } from 'react'
import { I18nManager } from 'react-native'
import { ArrowLeftRight as ArrowLeftRightIcon } from 'lucide-react-native'
import Switch from '@/components/ui/Switch'
import i18n, { _i18n } from '@/lib/locales'
import { logger } from '@/lib/logger'
import { reloadApp } from '@/lib/hotUpdater'
import { isDevForceRtl, setDevForceRtl, syncLayoutDirection } from '@/lib/rtl'
import { ToolList, ToolRow, ToolSection } from '@/app/navigation/tools/ToolsUI'

export default function LayoutDirectionTools() {
  const [forceRtl, setForceRtl] = useState(isDevForceRtl)
  const direction = i18n.t(
    I18nManager.isRTL ? 'layoutDirection_rtl' : 'layoutDirection_ltr'
  )

  function handleForceRtl(on: boolean) {
    setForceRtl(on)
    setDevForceRtl(on)
    syncLayoutDirection(_i18n.locale)
    reloadApp().catch((err: unknown) =>
      logger.error('[LayoutDirectionTools] reload failed', err)
    )
  }

  return (
    <ToolSection
      title={i18n.t('layoutDirection')}
      icon={ArrowLeftRightIcon}
      summary={direction}
    >
      <ToolList>
        <ToolRow
          label={i18n.t('layoutDirection_forceRtl')}
          info={i18n.t('layoutDirection_forceRtl_info')}
          trailing={
            <Switch
              accessibilityLabel={i18n.t('layoutDirection_forceRtl')}
              testID='dev-force-rtl'
              value={forceRtl}
              onValueChange={handleForceRtl}
            />
          }
        />
      </ToolList>
    </ToolSection>
  )
}

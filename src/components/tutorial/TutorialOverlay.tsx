import React, { useEffect, useMemo } from 'react'
import {
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native'
import { Sheet } from 'tamagui'
import Text from '../MyText'
import i18n from '../../lib/locales'
import useTheme from '../../contexts/theme'
import ActionButton from '../ActionButton'
import {
  registerExternalEmitter,
  useTutorialContext,
} from '../../providers/TutorialProvider'
import { Spotlight } from './Spotlight'

/**
 * Single overlay mounted once at the app root. Reads the current tutorial step
 * from context and renders the appropriate UI for it.
 *
 * The modal-step Sheet is always mounted and its open state is derived from the
 * current step kind. This lets Tamagui animate open/close properly when
 * advancing between modal and non-modal steps, and avoids the "stuck dim"
 * glitch that occurs when conditionally ripping the Sheet out of the tree.
 */
export const TutorialOverlay: React.FC = () => {
  const {
    activeTutorial,
    currentStep,
    nextStep,
    skip,
    emitTutorialEvent,
    scrollTargetIntoView,
  } = useTutorialContext()
  const theme = useTheme()
  const { height: screenH } = useWindowDimensions()

  // When entering a spotlight step, ask the registered scroll container to
  // bring the target into the visible area. Fires once per step id change.
  useEffect(() => {
    if (currentStep?.kind !== 'spotlight') return
    const id = currentStep.targetId
    // Wait for any navigation/transition to settle before scrolling.
    const t = setTimeout(() => scrollTargetIntoView(id), 150)
    return () => clearTimeout(t)
  }, [currentStep, scrollTargetIntoView])

  // Wire the module-level emitter so action-site helpers can call
  // `emitTutorialEvent()` without a hook.
  useEffect(() => {
    return registerExternalEmitter(emitTutorialEvent)
  }, [emitTutorialEvent])

  const progressLabel = useMemo(() => {
    if (!activeTutorial || !currentStep) return ''
    const idx = activeTutorial.steps.indexOf(currentStep)
    return i18n.t('tutorial.stepOf', {
      current: idx + 1,
      total: activeTutorial.steps.length,
    })
  }, [activeTutorial, currentStep])

  const isModalStep =
    currentStep?.kind === 'modal' || currentStep?.kind === 'info'

  // Title/body for the modal sheet. Captured here so the Sheet can keep
  // rendering them briefly during close animation even after `currentStep`
  // has advanced.
  const [modalContent, setModalContent] = React.useState<{
    title?: string
    body: string
    ctaKey?: string
  } | null>(null)

  useEffect(() => {
    if (!currentStep) return
    if (currentStep.kind === 'modal') {
      setModalContent({
        title: i18n.t(currentStep.titleKey),
        body: i18n.t(currentStep.bodyKey),
        ctaKey: currentStep.ctaKey,
      })
    } else if (currentStep.kind === 'info') {
      setModalContent({
        title: currentStep.titleKey ? i18n.t(currentStep.titleKey) : undefined,
        body: i18n.t(currentStep.bodyKey),
      })
    }
  }, [currentStep])

  // Only mount the modal Sheet while a tutorial is active. Leaving it in
  // the tree permanently (even with open=false) interferes with other
  // `modal` Tamagui sheets elsewhere in the app — e.g. the ContactDetails
  // AddSheet would fail to close its own backdrop because the tutorial's
  // dormant sheet was holding the shared modal portal open.
  const tutorialActive = !!activeTutorial

  return (
    <>
      {/* Modal / info: mounted only while a tutorial is running. */}
      {tutorialActive && (
        <Sheet
          open={isModalStep}
          modal
          snapPoints={[50]}
          dismissOnSnapToBottom={false}
          animation='quick'
          zIndex={200_000}
        >
          <Sheet.Overlay zIndex={200_000 - 1} />
          <Sheet.Handle />
          <Sheet.Frame
            padding={24}
            gap={16}
            backgroundColor={theme.colors.background}
          >
            <Text
              style={{
                fontSize: theme.fontSize('xs'),
                color: theme.colors.textAlt,
                fontFamily: theme.fonts.medium,
              }}
            >
              {progressLabel}
            </Text>
            {modalContent?.title && (
              <Text
                style={{
                  fontSize: theme.fontSize('xl'),
                  color: theme.colors.text,
                  fontFamily: theme.fonts.bold,
                }}
              >
                {modalContent.title}
              </Text>
            )}
            <Text
              style={{
                fontSize: theme.fontSize('md'),
                color: theme.colors.text,
              }}
            >
              {modalContent?.body}
            </Text>
            <View style={{ flex: 1 }} />
            <ActionButton onPress={nextStep}>
              {i18n.t((modalContent?.ctaKey as never) || 'tutorial.next')}
            </ActionButton>
            <TouchableOpacity onPress={skip} style={{ alignSelf: 'center' }}>
              <Text
                style={{
                  color: theme.colors.textAlt,
                  fontSize: theme.fontSize('sm'),
                  paddingVertical: 8,
                }}
              >
                {i18n.t('tutorial.skipTutorial')}
              </Text>
            </TouchableOpacity>
          </Sheet.Frame>
        </Sheet>
      )}

      {/* Spotlight step: 4-rect dim + tooltip card anchored top/bottom. */}
      {currentStep?.kind === 'spotlight' && (
        <View
          pointerEvents='box-none'
          style={[StyleSheet.absoluteFill, { zIndex: 200_000 }]}
        >
          <Spotlight targetId={currentStep.targetId}>
            {(rect) => {
              // Decide whether to anchor the tooltip to the top or bottom of
              // the screen. When the target sits in the upper half (or we
              // explicitly asked for bottom placement, or no rect is known),
              // anchor to the bottom. Otherwise anchor to the top.
              const hasRect = !!rect
              const targetInUpperHalf = hasRect && rect!.y < screenH / 2
              const anchorToBottom =
                currentStep.placement === 'bottom' ||
                !hasRect ||
                targetInUpperHalf

              return (
                <View
                  pointerEvents='box-none'
                  style={[
                    StyleSheet.absoluteFill,
                    {
                      justifyContent: anchorToBottom
                        ? 'flex-end'
                        : 'flex-start',
                      paddingHorizontal: 20,
                      paddingTop: 80,
                      paddingBottom: 60,
                    },
                  ]}
                >
                  <View
                    style={{
                      backgroundColor: theme.colors.backgroundLighter,
                      borderRadius: theme.numbers.borderRadiusLg,
                      padding: 20,
                      gap: 10,
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.3,
                      shadowRadius: 10,
                      elevation: 10,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: theme.fontSize('xs'),
                        color: theme.colors.textAlt,
                        fontFamily: theme.fonts.medium,
                      }}
                    >
                      {progressLabel}
                    </Text>
                    <Text
                      style={{
                        fontSize: theme.fontSize('lg'),
                        fontFamily: theme.fonts.bold,
                        color: theme.colors.text,
                      }}
                    >
                      {i18n.t(currentStep.titleKey)}
                    </Text>
                    <Text
                      style={{
                        fontSize: theme.fontSize('md'),
                        color: theme.colors.text,
                      }}
                    >
                      {i18n.t(currentStep.bodyKey)}
                    </Text>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginTop: 6,
                      }}
                    >
                      <TouchableOpacity onPress={skip}>
                        <Text
                          style={{
                            color: theme.colors.textAlt,
                            fontSize: theme.fontSize('sm'),
                            paddingVertical: 6,
                          }}
                        >
                          {i18n.t('tutorial.skipTutorial')}
                        </Text>
                      </TouchableOpacity>
                      {/* Manual Next is an escape hatch shown only when the
                          real target can't be measured — e.g. it's off-screen
                          or not mounted. Normally the step advances when the
                          user taps the real highlighted button. */}
                      {!hasRect && (
                        <TouchableOpacity onPress={nextStep}>
                          <Text
                            style={{
                              color: theme.colors.accent,
                              fontFamily: theme.fonts.bold,
                              fontSize: theme.fontSize('md'),
                              paddingVertical: 6,
                              paddingHorizontal: 12,
                            }}
                          >
                            {i18n.t('tutorial.next')}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>
              )
            }}
          </Spotlight>
        </View>
      )}

      {/* waitForAction: hint banner at bottom */}
      {currentStep?.kind === 'waitForAction' && (
        <View
          pointerEvents='box-none'
          style={[StyleSheet.absoluteFill, { zIndex: 200_000 }]}
        >
          <View
            pointerEvents='box-none'
            style={{
              position: 'absolute',
              bottom: 30,
              left: 16,
              right: 16,
            }}
          >
            <View
              style={{
                backgroundColor: theme.colors.backgroundLighter,
                borderRadius: theme.numbers.borderRadiusLg,
                padding: 16,
                gap: 10,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.25,
                shadowRadius: 8,
                elevation: 8,
                borderWidth: 2,
                borderColor: theme.colors.accent,
              }}
            >
              <Text
                style={{
                  fontSize: theme.fontSize('xs'),
                  color: theme.colors.textAlt,
                  fontFamily: theme.fonts.medium,
                }}
              >
                {progressLabel}
              </Text>
              {currentStep.hintKey && (
                <Text
                  style={{
                    fontSize: theme.fontSize('md'),
                    color: theme.colors.text,
                  }}
                >
                  {i18n.t(currentStep.hintKey)}
                </Text>
              )}
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                {currentStep.sample ? (
                  <TouchableOpacity
                    onPress={() => {
                      const form = currentStep.sample!.form
                      emitTutorialEvent(`sample.${form}`)
                    }}
                  >
                    <Text
                      style={{
                        color: theme.colors.accent,
                        fontFamily: theme.fonts.bold,
                        fontSize: theme.fontSize('sm'),
                      }}
                    >
                      {i18n.t('tutorial.fillSample')}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <View />
                )}
                <TouchableOpacity onPress={skip}>
                  <Text
                    style={{
                      color: theme.colors.textAlt,
                      fontSize: theme.fontSize('sm'),
                    }}
                  >
                    {i18n.t('tutorial.skipTutorial')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      )}
    </>
  )
}

import { StyleSheet } from 'react-native'

export const styles = StyleSheet.create({
  onboardingTitleWrapper: {
    flexDirection: 'column',
    flexGrow: 1,
    justifyContent: 'center',
  },
  textContainer: {
    marginBottom: 200,
  },
  subTitle: {
    fontSize: 25,
  },
  actionButton: {
    backgroundColor: '#1BD15D',
    borderRadius: 15,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navContainer: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },

  navProgressSlot: {
    height: 6,
    marginBottom: 12,
    alignSelf: 'center',
    width: '70%',
    justifyContent: 'center',
  },
  navProgressTrack: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  navProgressFill: {
    height: '100%',
    borderRadius: 3,
  },
  navTitleRow: {
    position: 'relative',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  navBack: {
    position: 'absolute',
    left: 0,
    width: 40,
    height: 40,
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chevronLeft: {
    color: '#9B9B9B',
    fontSize: 15,
  },
  navTitle: {
    fontSize: 24,
  },
  navSkip: {
    textDecorationLine: 'underline',
  },
  stepContainer: {
    flexGrow: 1,
    position: 'relative',
    flexDirection: 'column',
    justifyContent: 'space-between',
    marginBottom: 80,
  },
  stepTitle: {
    fontSize: 32,
    marginBottom: 20,
  },
  stepContentContainer: {
    marginRight: 60,
  },
  description: {
    fontSize: 12,
  },
  dropDownPicker: {
    backgroundColor: '#F8F8F6',
    borderColor: '#e2e2e1',
    marginBottom: 15,
  },
  dropDownOptionsContainer: {
    backgroundColor: '#F8F8F6',
    borderColor: '#e2e2e1',
  },
  dropDownSeparatorStyles: {
    backgroundColor: '#e2e2e1',
  },
})

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
  title: {
    fontSize: 40,
    lineHeight: 60,
    fontFamily: 'Inter_700Bold',
  },
  actionButton: {
    backgroundColor: '#1BD15D',
    borderRadius: 15,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonInner: {
    fontSize: 24,
    color: '#fff',
    fontFamily: 'Inter_700Bold',
  },
  navContainer: {
    position: 'relative',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  navBack: {
    position: 'absolute',
    left: 0,
  },
  chevronLeft: {
    color: '#9B9B9B',
    fontSize: 15,
  },
  navTitle: {
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
  },
  navSkip: {
    color: '#9B9B9B',
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
    fontFamily: 'Inter_700Bold',
    marginBottom: 20,
  },
  stepContentContainer: {
    marginRight: 60,
  },
  description: {
    fontSize: 12,
    color: '#9B9B9B',
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

import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  onboardingTitleWrapper: {
    flexDirection: "column",
    flexGrow: 1,
    justifyContent: "center",
  },
  textContainer: {
    marginBottom: 200,
  },
  subTitle: {
    fontSize: 25,
  },
  title: {
    fontSize: 75,
    lineHeight: 85,
    fontWeight: "700",
  },
  actionButton: {
    backgroundColor: "#1BD15D",
    borderRadius: 15,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonInner: {
    fontSize: 24,
    color: "#fff",
    fontWeight: "700",
  },
  navContainer: {
    position: "relative",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  navBack: {
    position: "absolute",
    left: 0,
    color: "#9B9B9B",
    fontSize: 30,
  },
  navTitle: {
    fontSize: 24,
    fontWeight: "700",
  },
  navSkip: {
    color: "#9B9B9B",
    textDecorationLine: "underline",
  },
  stepContainer: {
    flexGrow: 1,
    position: "relative",
    flexDirection: "column",
    justifyContent: "space-between",
    marginBottom: 80,
  },
  stepTitle: {
    fontSize: 32,
    fontWeight: "700",
    marginBottom: 20,
  },
  stepContentContainer: {
    marginRight: 60,
  },
  description: {
    fontSize: 12,
    fontWeight: "400",
    color: "#9B9B9B",
  },
  dropDownPicker: {
    backgroundColor: "#F8F8F6",
    borderColor: "#e2e2e1",
    marginBottom: 15,
  },
  dropDownOptionsContainer: {
    backgroundColor: "#F8F8F6",
    borderColor: "#e2e2e1",
  },
  dropDownSeparatorStyles: {
    backgroundColor: "#e2e2e1",
  },
});

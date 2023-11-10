import { ColorSchemeName } from "react-native";
import { Colors, Theme } from "../types/theme";

export const lightModeColors = {
  text: "#373737",
  textAlt: "#9B9B9B",
  textInverse: "#FFFFFF",
  textInverseAlt: "#E2E2E2",
  accent: "#1BD15D",
  accentBackground: "#4BD27C",
  accentAlt: "#B7DDC5",
  background: "#E9E9E9",
  border: "#E1E1E1",
  backgroundLighter: "#F8F8F8",
  card: "#FFFFFF",
  accent2: "#F19389",
  accent2Alt: "#FFF3F2",
  accent3: "#003D46",
  accent3Alt: "#EBFCFF",
  error: "#E30909",
  errorAlt: "#FA6868",
  warn: "#FCC014",
  warnAlt: "#FFEAB8",
  shadow: "#000000",
};

const darkModeColors: Colors = {
  text: "#E2E2E2",
  textAlt: "#7D7D7D",
  textInverse: "#141414",
  textInverseAlt: "#373737",
  accent: "#1BD15D",
  accentBackground: "#4BD27C",
  accentAlt: "#99BFA7",
  background: "#121212",
  border: "#333333",
  backgroundLighter: "#1E1E1E",
  card: "#242424",
  accent2: "#F19389",
  accent2Alt: "#FFF3F2",
  accent3: "#5CC7D4",
  accent3Alt: "#003D46",
  error: "#E30909",
  errorAlt: "#FA6868",
  warn: "#FCC014",
  warnAlt: "#FFEAB8",
  shadow: "#000000",
};

export const numbers = {
  borderRadiusSm: 5,
  borderRadiusMd: 10,
  borderRadiusLg: 15,
  shadowOpacity: 0.1,
};

const baseTheme = {
  numbers,
};

const getThemeFromColorScheme = (colorScheme: ColorSchemeName): Theme => {
  if (colorScheme === "light") {
    return {
      ...baseTheme,
      colors: lightModeColors,
    };
  }
  return {
    ...baseTheme,
    colors: darkModeColors,
  };
};

export default getThemeFromColorScheme;

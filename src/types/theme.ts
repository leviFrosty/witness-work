import { fonts, lightModeColors, numbers } from "../constants/theme";
export type ThemeSizes = "xs" | "sm" | "md" | "lg" | "xl";

export type Colors = typeof lightModeColors;
export type Fonts = typeof fonts;

export type Theme = {
  numbers: typeof numbers;
  colors: Colors;
  fonts: Fonts;
  fontSize: (size?: ThemeSizes) => number;
};

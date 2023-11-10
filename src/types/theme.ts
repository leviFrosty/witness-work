import { lightModeColors, numbers } from "../constants/theme";

export type Colors = typeof lightModeColors;

export type Theme = {
  numbers: typeof numbers;
  colors: Colors;
};

import { useContext, createContext } from "react";
import getThemeFromColorScheme from "../constants/theme";

export const ThemeContext = createContext(getThemeFromColorScheme("light"));

const useTheme = () => {
  const context = useContext(ThemeContext);
  return context;
};

export default useTheme;

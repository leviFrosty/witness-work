import React from "react";
import { NativeBaseProvider, extendTheme } from "native-base";

export default ({ children }: any) => {
  const config = {
    initialColorMode: "dark",
  };

  const customTheme = extendTheme({ config });

  return (
    <NativeBaseProvider theme={customTheme}>{children}</NativeBaseProvider>
  );
};

import React from "react";
import { Icon } from "@ui-kitten/components";
import { ImageProps } from "react-native";

export const Export = (
  props?: Partial<ImageProps>
): React.ReactElement<ImageProps> => <Icon {...props} name="export-variant" />;

import React, { useState } from "react";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import { Tooltip } from "@ui-kitten/components";
import { i18n } from "../lib/translations";

interface CopyToClipboardProps {
  string: string;
  component: React.FunctionComponentFactory<any>;
}

// Wrapper component to abstract state management and ease using copy to clipboard with toolip.

// Example usage:
// <CopyToClipBoardWithTooltip
// component={(copy) => (
//   <Text onLongPress={copy}>{call.note}</Text>
// )}
// string={call.note}
// />
const CopyToClipBoardWithTooltip: React.FC<CopyToClipboardProps> = ({
  component,
  string,
}) => {
  const [showTooltip, setShowTooltip] = useState(false);

  const copyToClipboard = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await Clipboard.setStringAsync(string);
    setShowTooltip(true);
  };

  return (
    <Tooltip
      visible={showTooltip}
      anchor={() => component(copyToClipboard)}
      onBackdropPress={() => setShowTooltip(false)}
    >
      {i18n.t("copied!")}
    </Tooltip>
  );
};

export default CopyToClipBoardWithTooltip;

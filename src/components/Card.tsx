import { useStyleSheet } from '@ui-kitten/components';
import { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';

import appTheme from '../lib/theme';

interface CardProps {
  status?: string; // UI Kitten status. basic, primary, success, info, warning, danger or control. Defaults to primary. Use control status when needed to display within a contrast container.
}

export const Card: React.FC<PropsWithChildren<CardProps>> = ({
  status,
  children,
  ...props
}) => {
  const cardStyles: StyleSheet.NamedStyles<unknown> = {
    position: 'relative',
    paddingVertical: 10,
    paddingHorizontal: 20,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `color-${status || 'primary'}-transparent-100`,
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: `color-${status || 'primary'}-default-border`,
    borderRadius: appTheme.borderRadius,
  };

  const themedStyles = StyleSheet.create({
    container: cardStyles,
  });

  const styles = useStyleSheet(themedStyles);

  return (
    <View style={styles.container} {...props}>
      {children}
    </View>
  );
};

export default Card;

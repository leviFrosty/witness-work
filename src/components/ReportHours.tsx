import { Icon, IconElement, Text, useStyleSheet } from '@ui-kitten/components';
import { StyleSheet, View } from 'react-native';

import { i18n } from '../lib/translations';

type ReportHoursProps = {
  hours: number;
  target?: number;
};

const ReportHours: React.FC<ReportHoursProps> = ({ hours, target }) => {
  const inactive = hours === 0;

  const themeStyles = StyleSheet.create({
    number: {
      textAlign: 'center',
    },
    chevronUp: {
      height: 20,
      width: 20,
      color: 'color-success-500',
    },
    chevronDown: {
      height: 20,
      width: 20,
      color: 'color-warning-500',
    },
    chevronDownDanger: {
      height: 20,
      width: 20,
      color: 'color-danger-500',
    },
  });
  const styles = useStyleSheet(themeStyles);

  const ChevronUp = (): IconElement => (
    <Icon style={styles.chevronUp} name={'chevron-up-circle'} />
  );
  const ChevronDown = (): IconElement =>
    inactive ? (
      <Icon style={styles.chevronDownDanger} name={'chevron-down-circle'} />
    ) : (
      <Icon style={styles.chevronDown} name={'chevron-down-circle'} />
    );

  // Displays green up arrow if true, if false, displays red down arrow
  const StatusArrow = ({ positive }: { positive: boolean }) => {
    return positive ? <ChevronUp /> : <ChevronDown />;
  };

  return target ? (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <Text
          category="h6"
          status={inactive ? 'danger' : target <= hours ? 'success' : 'warning'}
          style={styles.number}>
          {hours}
        </Text>
        <StatusArrow positive={target <= hours} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
        <Text appearance="hint" category="c1">
          {i18n.t('target')}
        </Text>
        <Text appearance="hint" category="c2">
          {target}
        </Text>
      </View>
    </View>
  ) : (
    <Text category="h6" style={styles.number}>
      {hours}
    </Text>
  );
};

export default ReportHours;

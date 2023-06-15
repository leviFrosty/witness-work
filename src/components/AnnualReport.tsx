import { Button, Layout, Text, useStyleSheet } from '@ui-kitten/components';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { Share, StyleSheet, View } from 'react-native';

import { Export } from './Icons';
import ReportHours from './ReportHours';
import appTheme from '../lib/theme';
import { i18n } from '../lib/translations';
import { AnnualReportData } from '../stores/ServiceRecord';

interface AnnualReportProps {
  report: AnnualReportData;
  year: number;
  targetHours?: number;
}

const AnnualReport: React.FC<AnnualReportProps> = ({
  report,
  targetHours,
  year,
}) => {
  const { hours, placements, returnVisits, videoPlacements, share } = report;
  const themeStyles = StyleSheet.create({
    container: {
      borderWidth: 1,
      borderColor: 'color-control-default-border',
      borderRadius: appTheme.borderRadius,
      padding: 15,
      gap: 5,
    },
    content: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    number: {
      textAlign: 'center',
    },
    box: {
      gap: 10,
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
  });
  const styles = useStyleSheet(themeStyles);

  return (
    <Layout level="2" style={styles.container}>
      <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}>
        <Text category="h6">{`${year - 1}-${year} ${i18n.t(
          'serviceYear',
        )}`}</Text>
        <Button
          appearance="ghost"
          size="small"
          accessoryLeft={Export}
          onPress={async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            await Share.share({
              title: share?.title,
              message: share?.message || '',
            });
          }}
        />
      </View>
      <View style={styles.content}>
        <View style={styles.box}>
          <Text appearance="hint" category="c2">
            {i18n.t('hours')}
          </Text>
          <ReportHours hours={hours} target={targetHours} />
        </View>
        <View style={styles.box}>
          <Text appearance="hint" category="c2">
            {i18n.t('placements')}
          </Text>
          <Text category="h6" style={styles.number}>
            {placements}
          </Text>
        </View>
        <View style={styles.box}>
          <Text appearance="hint" category="c2">
            {i18n.t('videos')}
          </Text>
          <Text category="h6" style={styles.number}>
            {videoPlacements}
          </Text>
        </View>
        <View style={styles.box}>
          <Text appearance="hint" category="c2">
            {i18n.t('returnVisits')}
          </Text>
          <Text category="h6" style={styles.number}>
            {returnVisits}
          </Text>
        </View>
      </View>
    </Layout>
  );
};

export default AnnualReport;

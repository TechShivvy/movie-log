import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme/tokens';

interface Props { icon?: keyof typeof Ionicons.glyphMap; title:string; message?:string; }

export function EmptyState({ icon='film-outline', title, message }:Props) {
  const c = useTheme();
  return (
    <View style={styles.wrap}>
      <Ionicons name={icon} size={52} color={c.textDisabled} />
      <Text style={[styles.title, { color:c.textSecondary }]}>{title}</Text>
      {message ? <Text style={[styles.msg, { color:c.textDisabled }]}>{message}</Text> : null}
    </View>
  );
}
const styles = StyleSheet.create({
  wrap: { flex:1, alignItems:'center', justifyContent:'center', rowGap:spacing.md, padding:spacing.xxl },
  title: { ...typography.headlineSm, textAlign:'center' },
  msg: { ...typography.bodyMd, textAlign:'center' },
});

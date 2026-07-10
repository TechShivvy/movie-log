import { Platform, StyleSheet, View, ViewProps, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { radii, spacing } from '../theme/tokens';

interface Props extends ViewProps { style?: ViewStyle; innerStyle?: ViewStyle; }

export function GlassCard({ children, style, innerStyle, ...rest }: Props) {
  const c = useTheme();
  return (
    <View {...rest} style={[
      styles.card,
      { backgroundColor: c.surface + 'cc', borderColor: c.borderVariant + '26' },
      Platform.select({ web: { backdropFilter:'blur(20px)', boxShadow:'0 20px 25px -5px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.05)' } as object }),
      style,
    ]}>
      <View style={[styles.inner, innerStyle]}>{children}</View>
    </View>
  );
}
const styles = StyleSheet.create({
  card: { borderRadius:radii.xl, borderWidth:1, overflow:'hidden' },
  inner: { padding:spacing.xl },
});

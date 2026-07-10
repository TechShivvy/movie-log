import { ActivityIndicator, Platform, Pressable, PressableProps, StyleSheet, Text } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { radii, typography } from '../theme/tokens';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
interface Props extends PressableProps { variant?: Variant; loading?: boolean; label: string; fullWidth?: boolean; }

export function Button({ variant = 'primary', loading, label, fullWidth, style, disabled, ...rest }: Props) {
  const c = useTheme();
  const isDisabled = disabled || loading;
  const bg: Record<Variant,string> = { primary:c.accent, secondary:c.surfaceElevated, ghost:'transparent', danger:c.errorContainer };
  const fg: Record<Variant,string> = { primary:c.accentFg, secondary:c.textPrimary, ghost:c.textSecondary, danger:c.error };
  const bdr: Record<Variant,string> = { primary:'transparent', secondary:c.border, ghost:'transparent', danger:c.error };
  return (
    <Pressable {...rest} disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor:bg[variant], borderColor:bdr[variant], opacity: isDisabled ? 0.5 : pressed ? 0.82 : 1 },
        fullWidth && styles.full,
        variant==='primary' && !isDisabled && Platform.select({ web:{ boxShadow:'0 0 18px rgba(229,9,20,0.4)' } as object }),
        style as object,
      ]}
    >
      {loading ? <ActivityIndicator color={fg[variant]} size="small" /> : <Text style={[styles.label, { color:fg[variant] }]}>{label}</Text>}
    </Pressable>
  );
}
const styles = StyleSheet.create({
  base: { borderRadius:radii.md, borderWidth:1, paddingHorizontal:20, paddingVertical:12, alignItems:'center', justifyContent:'center', minHeight:48 },
  full: { width:'100%' },
  label: { ...typography.bodyLg, fontWeight:'600' },
});

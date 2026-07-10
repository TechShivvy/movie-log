import { Platform, Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { radii, typography } from '../theme/tokens';

interface Props { label:string; active?:boolean; onPress?:()=>void; }

export function Chip({ label, active=false, onPress }:Props) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: active ? c.accent+'33' : c.indigoContainer+'1a', borderColor: active ? c.accent+'4d' : c.indigo+'33', opacity: pressed ? 0.8 : 1 },
      ]}
    >
      <Text style={[styles.label, { color: active ? c.accent : c.indigo }]}>{label}</Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  chip: { borderRadius:radii.full, borderWidth:1, paddingHorizontal:14, paddingVertical:7 },
  label: { ...typography.label },
});

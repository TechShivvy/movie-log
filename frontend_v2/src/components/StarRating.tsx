import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { spacing, typography } from '../theme/tokens';

interface Props { value: number|null; onChange?: (v:number)=>void; size?: number; }

/** Renders up to 5 stars. value is 1-10; display = value/2. */
export function StarRating({ value, onChange, size=22 }:Props) {
  const c = useTheme();
  const display = value != null ? value / 2 : 0;
  const stars = [1,2,3,4,5];
  return (
    <View style={styles.row}>
      {stars.map((s) => {
        const filled = display >= s;
        const half   = !filled && display >= s - 0.5;
        const icon   = filled ? 'star' : half ? 'star-half' : 'star-outline';
        return (
          <Pressable key={s} onPress={() => onChange?.(s * 2)} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
            <Ionicons name={icon} size={size} color={c.goldContainer} />
          </Pressable>
        );
      })}
      {value != null ? <Text style={[styles.label, { color:c.goldContainer }]}> {(value/2).toFixed(1)}</Text> : null}
    </View>
  );
}
const styles = StyleSheet.create({
  row: { flexDirection:'row', alignItems:'center', columnGap:2 },
  label: { ...typography.headlineSm, marginLeft:6 },
});

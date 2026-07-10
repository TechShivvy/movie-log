import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { radii, spacing, typography } from '../theme/tokens';

interface Props {
  label: string; value: string; onChangeText: (v:string)=>void;
  placeholder?: string; secureTextEntry?: boolean; multiline?: boolean;
  editable?: boolean; keyboardType?: 'default'|'email-address'|'numeric';
  error?: string; icon?: keyof typeof Ionicons.glyphMap; hint?: string;
}

export function Field({ label, value, onChangeText, placeholder, secureTextEntry, multiline, editable=true, keyboardType='default', error, icon, hint }:Props) {
  const c = useTheme();
  return (
    <View>
      <Text style={[styles.label, { color:c.textSecondary }]}>{label}</Text>
      <View style={[
        styles.row,
        { backgroundColor:c.surfaceMuted, borderColor: error ? c.error : c.border },
        !editable && styles.disabled,
      ]}>
        {icon ? <Ionicons name={icon} size={16} color={c.textSecondary} style={styles.icon} /> : null}
        <TextInput
          value={value} onChangeText={onChangeText}
          placeholder={placeholder ?? label} placeholderTextColor={c.textDisabled}
          secureTextEntry={secureTextEntry} multiline={multiline} editable={editable}
          keyboardType={keyboardType}
          style={[styles.input, { color:c.textPrimary }, multiline ? styles.multi : null]}
        />
      </View>
      {hint && !error ? <Text style={[styles.hint, { color:c.textSecondary }]}>{hint}</Text> : null}
      {error ? <Text style={[styles.hint, { color:c.error }]}>{error}</Text> : null}
    </View>
  );
}
const styles = StyleSheet.create({
  label: { ...typography.label, marginBottom:spacing.sm },
  row: { flexDirection:'row', alignItems:'center', borderRadius:radii.md, borderWidth:1, paddingHorizontal:spacing.lg, minHeight:52 },
  disabled: { opacity:0.5 },
  icon: { marginRight:spacing.sm },
  input: { ...typography.bodyLg, flex:1, paddingVertical:spacing.sm },
  multi: { minHeight:96, textAlignVertical:'top', paddingTop:spacing.sm },
  hint: { ...typography.bodySm, marginTop:spacing.xs },
});

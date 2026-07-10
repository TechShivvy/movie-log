import { Ionicons } from "@expo/vector-icons";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { colors, radii, spacing, typography } from "../theme";

interface Props {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  multiline?: boolean;
  editable?: boolean;
  keyboardType?: "default" | "email-address" | "numeric";
  error?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  hint?: string;
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  multiline,
  editable = true,
  keyboardType = "default",
  error,
  icon,
  hint,
}: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[
          styles.inputRow,
          !!error && styles.inputError,
          !editable && styles.inputDisabled,
        ]}
      >
        {icon ? (
          <Ionicons
            name={icon}
            size={16}
            color={colors.textSecondary}
            style={styles.icon}
          />
        ) : null}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder ?? label}
          placeholderTextColor={colors.textDisabled}
          secureTextEntry={secureTextEntry}
          multiline={multiline}
          editable={editable}
          keyboardType={keyboardType}
          style={[styles.input, multiline ? styles.inputMultiline : null]}
        />
      </View>
      {hint && !error ? <Text style={styles.hint}>{hint}</Text> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "column" },
  label: { ...typography.label, marginBottom: spacing.xs },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    minHeight: 44,
  },
  inputError: { borderColor: colors.error },
  inputDisabled: { opacity: 0.5 },
  icon: { marginRight: spacing.sm },
  input: {
    ...typography.body,
    flex: 1,
    paddingVertical: spacing.sm,
  },
  inputMultiline: {
    minHeight: 88,
    textAlignVertical: "top",
    paddingTop: spacing.sm,
  },
  hint: { ...typography.caption, marginTop: spacing.xs },
  errorText: {
    ...typography.caption,
    color: colors.error,
    marginTop: spacing.xs,
  },
});

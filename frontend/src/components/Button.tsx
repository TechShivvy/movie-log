import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  StyleSheet,
  Text,
} from "react-native";
import { colors, radii, spacing, typography } from "../theme";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface Props extends PressableProps {
  variant?: Variant;
  loading?: boolean;
  label: string;
  fullWidth?: boolean;
}

const BG: Record<Variant, string> = {
  primary: colors.accent,
  secondary: colors.surfaceMuted,
  ghost: "transparent",
  danger: colors.errorMuted,
};

const FG: Record<Variant, string> = {
  primary: colors.accentFg,
  secondary: colors.textPrimary,
  ghost: colors.textSecondary,
  danger: colors.error,
};

const BORDER: Record<Variant, string> = {
  primary: "transparent",
  secondary: colors.border,
  ghost: "transparent",
  danger: colors.error,
};

export function Button({
  variant = "primary",
  loading,
  label,
  fullWidth,
  style,
  disabled,
  ...rest
}: Props) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      {...rest}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: BG[variant],
          borderColor: BORDER[variant],
          opacity: isDisabled ? 0.5 : pressed ? 0.82 : 1,
        },
        fullWidth && styles.fullWidth,
        style as object,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={FG[variant]} size="small" />
      ) : (
        <Text style={[styles.label, { color: FG[variant] }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md - 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  fullWidth: { width: "100%" },
  label: { ...typography.body, fontWeight: "600" },
});

import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "../theme";

interface Props {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
}

export function EmptyState({ icon = "film-outline", title, message }: Props) {
  return (
    <View style={styles.container}>
      <Ionicons name={icon} size={48} color={colors.textDisabled} />
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    rowGap: spacing.md,
    padding: spacing.xxl,
  },
  title: { ...typography.h3, color: colors.textSecondary, textAlign: "center" },
  message: {
    ...typography.body,
    color: colors.textDisabled,
    textAlign: "center",
  },
});

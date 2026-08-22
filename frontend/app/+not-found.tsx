/**
 * +not-found — expo-router's own convention for an unmatched route
 * (route-structure.md prescribes one; none existed before this).
 * Universal RN primitives, no Platform branch — this is simple enough
 * that react-native-web renders it correctly at any width without
 * needing the dual-branch treatment most screens in this app use.
 */
import { Link, Stack } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { FilmSlate } from "phosphor-react-native";
import { useTheme } from "../hooks/useTheme";

export default function NotFoundScreen() {
  const { theme } = useTheme();
  return (
    <>
      <Stack.Screen options={{ title: "Not found" }} />
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <FilmSlate size={48} color={theme.accent} />
        <Text style={[styles.title, { color: theme.text }]}>This screen doesn't exist.</Text>
        <Link href="/" style={styles.link}>
          <Text style={{ color: theme.accent, fontSize: 15, fontWeight: "600" }}>Go back to Library</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  title: { fontSize: 18, fontWeight: "700", textAlign: "center" },
  link: { marginTop: 8, paddingVertical: 10 },
});

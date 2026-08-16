import { SafeAreaView, Text, StyleSheet } from "react-native";
import { useTheme } from "../../../hooks/useTheme";
import { useLocalSearchParams } from "expo-router";
export default function UserProfileRoute() {
  const { theme } = useTheme();
  const { username } = useLocalSearchParams();
  return <SafeAreaView style={[s.root, { backgroundColor: theme.bg }]}><Text style={{ color: theme.text, padding: 24 }}>@{username} — coming in Phase 5</Text></SafeAreaView>;
}
const s = StyleSheet.create({ root: { flex: 1 } });

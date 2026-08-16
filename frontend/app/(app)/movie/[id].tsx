import { SafeAreaView, Text, StyleSheet } from "react-native";
import { useTheme } from "../../../hooks/useTheme";
import { useLocalSearchParams } from "expo-router";
export default function MovieRoute() {
  const { theme } = useTheme();
  const { id } = useLocalSearchParams();
  return <SafeAreaView style={[s.root, { backgroundColor: theme.bg }]}><Text style={{ color: theme.text, padding: 24 }}>Movie {id} — coming in Phase 6</Text></SafeAreaView>;
}
const s = StyleSheet.create({ root: { flex: 1 } });

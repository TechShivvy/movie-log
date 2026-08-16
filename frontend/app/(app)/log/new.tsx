import { SafeAreaView, Text, StyleSheet } from "react-native";
import { useTheme } from "../../../hooks/useTheme";
export default function NewLogRoute() {
  const { theme } = useTheme();
  return <SafeAreaView style={[s.root, { backgroundColor: theme.bg }]}><Text style={{ color: theme.text, padding: 24, fontSize: 20 }}>Log Film — coming in Phase 3</Text></SafeAreaView>;
}
const s = StyleSheet.create({ root: { flex: 1 } });

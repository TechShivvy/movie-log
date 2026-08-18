import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "../../../hooks/useTheme";
import { useLocalSearchParams } from "expo-router";
// No SafeAreaView: (app)/_layout.tsx's MobileLayout already applies real
// device insets around every screen in this group — see its comment.
export default function MovieRoute() {
  const { theme } = useTheme();
  const { id } = useLocalSearchParams();
  return <View style={[s.root, { backgroundColor: theme.bg }]}><Text style={{ color: theme.text, padding: 24 }}>Movie {id} — coming in Phase 6</Text></View>;
}
const s = StyleSheet.create({ root: { flex: 1 } });

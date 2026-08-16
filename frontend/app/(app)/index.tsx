import { SafeAreaView, StyleSheet } from "react-native";
import { useTheme } from "../../hooks/useTheme";
import { LibraryScreen } from "../../screens/LibraryScreen";

export default function LibraryRoute() {
  const { theme } = useTheme();
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]}>
      <LibraryScreen />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });

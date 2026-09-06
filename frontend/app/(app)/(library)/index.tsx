import { View, StyleSheet } from "react-native";
import { useTheme } from "../../../hooks/useTheme";
import { LibraryScreen } from "../../../screens/LibraryScreen";

// No SafeAreaView here: this used to import it from plain "react-native",
// which is iOS-only and a no-op on Android to begin with. The real fix —
// react-native-safe-area-context's actual device insets — now lives one
// level up, in (app)/_layout.tsx's MobileLayout, which wraps every screen
// under this group; a second (broken) safe-area wrapper here was redundant
// even when it worked.
export default function LibraryRoute() {
  const { theme } = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <LibraryScreen />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });

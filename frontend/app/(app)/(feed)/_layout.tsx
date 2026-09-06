import { Stack } from "expo-router";
import { useTheme } from "../../../hooks/useTheme";

// The Feed tab's own nested stack — just the one screen today, but real
// tab-scoped navigation (not the flat Stack every route used to share)
// means anything pushed from here later gets its own back-stack for free.
export default function FeedStackLayout() {
  const { theme } = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.bg } }} />
  );
}

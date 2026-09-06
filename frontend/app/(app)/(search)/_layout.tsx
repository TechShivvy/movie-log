import { Stack } from "expo-router";
import { useTheme } from "../../../hooks/useTheme";

export default function SearchStackLayout() {
  const { theme } = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.bg } }} />
  );
}

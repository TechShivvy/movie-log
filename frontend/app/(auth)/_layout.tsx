import { Redirect, Stack } from "expo-router";
import { useAuth } from "../../hooks/useAuth";
import { useTheme } from "../../hooks/useTheme";
import { ScreenLoader } from "../../components/ui/Spinner";

export default function AuthLayout() {
  const { session, loading } = useAuth();
  // Was hardcoded to the Cinematic theme's exact bg/accent — every other
  // theme got themed everywhere except login/signup, which stayed
  // Cinematic-colored regardless of what the user actually picked.
  const { theme } = useTheme();

  if (loading) return <ScreenLoader />;

  if (session) {
    return <Redirect href="/(app)" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // Same react-native-screens fix as (app)/_layout.tsx — without this,
        // "callback" (pushed on top of "index") gets its own opaque white
        // background by default.
        contentStyle: { backgroundColor: theme.bg },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="callback" />
    </Stack>
  );
}

import { Redirect, Stack } from "expo-router";
import { useAuth } from "../../hooks/useAuth";
import { View, ActivityIndicator } from "react-native";

export default function AuthLayout() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0b1326" }}>
        <ActivityIndicator color="#e50914" size="large" />
      </View>
    );
  }

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
        contentStyle: { backgroundColor: "#0b1326" },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="callback" />
    </Stack>
  );
}

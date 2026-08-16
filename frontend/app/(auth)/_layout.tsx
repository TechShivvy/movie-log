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
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}

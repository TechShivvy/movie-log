import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAppSelector } from "../src/store";
import { colors } from "../src/theme";

export default function Index() {
  const isLoading = useAppSelector((s) => s.auth.isLoading);
  const session = useAppSelector((s) => s.auth.session);

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: colors.bg,
        }}
      >
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return <Redirect href={session ? "/(app)/movies" : "/(auth)/login"} />;
}

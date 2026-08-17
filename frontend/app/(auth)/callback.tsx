/**
 * Legacy catch — the canonical OAuth callback is now at /auth/callback
 * (app/auth/callback.tsx). This file handles the /callback path in case
 * any old Supabase redirect URL still points here.
 */
import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../hooks/useTheme";

export default function AuthCallbackLegacy() {
  const { theme } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{
    code?: string;
    error?: string;
    error_description?: string;
  }>();

  useEffect(() => {
    async function handle() {
      if (params.error) {
        router.replace("/(auth)");
        return;
      }
      if (params.code) {
        const { error } = await supabase.auth.exchangeCodeForSession(
          params.code as string
        );
        if (error) {
          router.replace("/(auth)");
          return;
        }
      }
      router.replace("/(app)");
    }
    handle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: theme.bg,
      }}
    >
      <ActivityIndicator color={theme.accent} size="large" />
    </View>
  );
}

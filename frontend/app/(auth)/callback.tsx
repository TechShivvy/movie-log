/**
 * OAuth callback handler.
 *
 * Supabase redirects here after Google / magic-link auth:
 *   Web   → http://localhost:8081/auth/callback?code=xxx
 *   Native → cinelog://auth/callback?code=xxx  (or exp://... in Expo Go)
 *
 * On web, detectSessionInUrl:true means Supabase JS already handles the token
 * automatically on page load. We just show a spinner and let AuthContext pick
 * up the session via onAuthStateChange, which triggers the redirect to (app).
 *
 * On native, the code exchange happens in LoginScreen's openAuthSessionAsync
 * handler before this route is ever rendered, so this is purely a loading gate.
 */
import { useEffect } from "react";
import { View, ActivityIndicator, Text } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../hooks/useTheme";

export default function AuthCallback() {
  const { theme } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string; error?: string; error_description?: string }>();

  useEffect(() => {
    async function handleCallback() {
      try {
        if (params.error) {
          console.error("OAuth error:", params.error_description ?? params.error);
          router.replace("/(auth)");
          return;
        }

        // PKCE flow: exchange the code for a session
        if (params.code) {
          const { error } = await supabase.auth.exchangeCodeForSession(params.code);
          if (error) {
            console.error("Code exchange error:", error.message);
            router.replace("/(auth)");
            return;
          }
        }

        // Session will be picked up by AuthContext → redirect handled by (auth)/_layout.tsx
        router.replace("/(app)");
      } catch (e) {
        console.error("Callback error:", e);
        router.replace("/(auth)");
      }
    }

    handleCallback();
  }, [params.code, params.error]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg }}>
      <ActivityIndicator color={theme.accent} size="large" />
      <Text style={{ color: theme.text, marginTop: 16, fontSize: 14, opacity: 0.7 }}>
        Signing you in…
      </Text>
    </View>
  );
}

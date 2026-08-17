/**
 * OAuth callback route — handles:
 *   Web (PKCE):     http://localhost:8081/auth/callback?code=xxx
 *   Web (implicit): http://localhost:8081/auth/callback#access_token=xxx
 *   Native:         cinelog://auth/callback?code=xxx
 *   Expo Go:        exp://host:port/--/auth/callback?code=xxx
 *
 * Supabase Redirect URLs that must be whitelisted in the dashboard:
 *   • http://localhost:8081/auth/callback    ← web dev
 *   • https://<your-domain>/auth/callback   ← web prod
 *   • cinelog://auth/callback               ← standalone mobile
 *   • exp://[host]:[port]/--/auth/callback    ← Expo Go (add wildcard in dashboard)
 *
 * Flow:
 *   1. On web with detectSessionInUrl:true, @supabase/supabase-js auto-detects
 *      the code/hash the moment the page loads — session is set before this
 *      component even mounts in most cases.
 *   2. If a `code` query param is present (PKCE), we exchange it explicitly as a
 *      belt-and-suspenders measure.
 *   3. On success, AuthContext.onAuthStateChange fires → navigate to (app).
 */
import { useEffect } from "react";
import { View, ActivityIndicator, Text, Platform } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../hooks/useTheme";

export default function AuthCallback() {
  const { theme } = useTheme();
  const router = useRouter();

  // On web, the code arrives as a query param (?code=).
  // On native (when this screen IS loaded), the deep-link also carries ?code=.
  const params = useLocalSearchParams<{
    code?: string;
    error?: string;
    error_description?: string;
  }>();

  useEffect(() => {
    let cancelled = false;

    async function handleCallback() {
      try {
        // Auth error from provider
        if (params.error) {
          console.error("OAuth error:", params.error_description ?? params.error);
          router.replace("/(auth)");
          return;
        }

        // PKCE code exchange
        if (params.code) {
          const { error } = await supabase.auth.exchangeCodeForSession(
            params.code as string
          );
          if (error) {
            console.error("Code exchange error:", error.message);
            if (!cancelled) router.replace("/(auth)");
            return;
          }
        }

        // Implicit flow (web only): Supabase JS handles the hash automatically
        // via detectSessionInUrl:true. Just wait a tick for onAuthStateChange.
        if (!cancelled) router.replace("/(app)");
      } catch (e) {
        console.error("Callback error:", e);
        if (!cancelled) router.replace("/(auth)");
      }
    }

    handleCallback();
    return () => {
      cancelled = true;
    };
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
      <Text
        style={{
          color: theme.text,
          marginTop: 16,
          fontSize: 14,
          opacity: 0.7,
        }}
      >
        Signing you in…
      </Text>
    </View>
  );
}

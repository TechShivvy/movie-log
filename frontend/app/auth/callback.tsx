/**
 * OAuth callback route — /auth/callback
 *
 *   Web (PKCE)     http://localhost:8081/auth/callback?code=…
 *   Dev build      cinelog://auth/callback?code=…
 *   Expo Go        exp://<lan-ip>:8081/--/auth/callback?code=…
 *
 * The exchange itself is delegated to lib/authCallback, which de-duplicates by
 * code — LoginScreen's Linking listener reacts to the same deep link, and a
 * PKCE code can only be spent once.
 *
 * Supabase Redirect URLs must contain an entry matching the redirect this app
 * generates; when none matches, Supabase silently falls back to the Site URL.
 * See docs/mobile-oauth.md.
 */
import { useEffect, useState } from "react";
import { View, Text, Platform } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as Linking from "expo-linking";
import { completeAuthFromUrl } from "../../lib/authCallback";
import { useTheme } from "../../hooks/useTheme";
import { Spinner } from "../../components/ui/Spinner";
import { type as fontSizes } from "../../constants/fonts";

export default function AuthCallback() {
  const { theme } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{
    code?: string;
    error?: string;
    error_description?: string;
  }>();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Provider-level failure (user denied consent, bad client config, …)
      if (params.error) {
        const detail = params.error_description ?? params.error;
        console.error("OAuth error:", detail);
        if (!cancelled) router.replace("/(auth)");
        return;
      }

      // Prefer the full URL so the fragment survives; fall back to the routed
      // ?code= param when the platform gives us no URL (web hard navigation).
      const initial = Platform.OS === "web"
        ? (window as any).location?.href
        : await Linking.getInitialURL();
      const url = initial ?? (params.code ? `?code=${params.code}` : "");

      const result = await completeAuthFromUrl(url);
      if (cancelled) return;

      if (result.status === "error") {
        setMessage(result.message);
        setTimeout(() => router.replace("/(auth)"), 1500);
        return;
      }

      // "none" is fine on web: detectSessionInUrl may have already consumed
      // the URL before this mounted. AuthProvider owns the redirect either way.
      router.replace("/(app)");
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg }}>
      <Spinner size="lg" />
      <Text style={{ color: theme.text, marginTop: 16, fontSize: fontSizes.base, opacity: 0.7 }}>
        {message ?? "Signing you in…"}
      </Text>
    </View>
  );
}

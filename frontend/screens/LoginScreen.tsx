import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { supabase } from "../lib/supabase";
import { useTheme } from "../hooks/useTheme";
import { CinematicBg } from "../components/layout/CinematicBg";
import { FilmGrain } from "../components/layout/FilmGrain";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { styles } from "./LoginScreen.styles";

// Required for expo-web-browser auth session to close properly on return
WebBrowser.maybeCompleteAuthSession();

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Returns the correct redirect URL for the current environment:
 *  - Web: current origin (e.g. http://localhost:8081 or https://cinelog.example.com)
 *  - Expo Go (dev): exp://192.168.x.x:8081/--/auth/callback
 *  - Standalone build: cinelog://auth/callback
 */
function getRedirectUrl(path = "auth/callback") {
  if (Platform.OS === "web") {
    return `${(window as Window & typeof globalThis).location.origin}/${path}`;
  }
  // Linking.createURL handles Expo Go vs production scheme automatically
  return Linking.createURL(path);
}

export function LoginScreen() {
  const { theme } = useTheme();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // ── Google OAuth ────────────────────────────────────────────────────────────
  async function signInGoogle() {
    setLoading(true);
    setError("");
    try {
      const redirectTo = getRedirectUrl("auth/callback");

      const { data, error: oauthErr } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          // skipBrowserRedirect=true so we control when to open the browser
          skipBrowserRedirect: true,
        },
      });
      if (oauthErr) throw oauthErr;
      if (!data.url) throw new Error("No OAuth URL returned");

      if (Platform.OS === "web") {
        // On web, redirect directly — Supabase will handle the token from the URL hash
        (window as Window & typeof globalThis).location.href = data.url;
        return;
      }

      // On native: open in-app browser, wait for the deep-link redirect back
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

      if (result.type === "success") {
        const parsed = Linking.parse(result.url);
        // PKCE flow: ?code=xxx
        const code = parsed.queryParams?.code as string | undefined;
        if (code) {
          const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeErr) throw exchangeErr;
          return;
        }
        // Implicit flow fallback: #access_token=xxx&refresh_token=xxx
        const hash = result.url.split("#")[1] ?? "";
        const hashParams = new URLSearchParams(hash);
        const access_token = hashParams.get("access_token");
        const refresh_token = hashParams.get("refresh_token");
        if (access_token && refresh_token) {
          const { error: sessionErr } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          if (sessionErr) throw sessionErr;
        }
      }
    } catch (e: any) {
      setError(e.message ?? "Sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  // ── Magic link ──────────────────────────────────────────────────────────────
  async function sendMagicLink() {
    if (!email) { setError("Enter your email"); return; }
    setLoading(true);
    setError("");
    try {
      const emailRedirectTo = getRedirectUrl("auth/callback");
      const { error: err } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo },
      });
      if (err) throw err;
      setMessage("Check your email for the magic link ✉️");
    } catch (e: any) {
      setError(e.message ?? "Failed to send link");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <CinematicBg />
      <FilmGrain />

      <KeyboardAvoidingView style={styles.center} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Logo */}
          <View style={styles.header}>
            <Text style={[styles.logo, { color: theme.accent }]}>🎬</Text>
            <Text style={[styles.title, { color: theme.text }]}>CineLog</Text>
            <Text style={[styles.subtitle, { color: `${theme.text}88` }]}>Your cinema diary</Text>
          </View>

          {/* Login card */}
          <Card glass style={styles.card as any}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Sign in</Text>

            <Button
              label="Continue with Google"
              variant="secondary"
              loading={loading}
              onPress={signInGoogle}
              style={styles.googleBtn}
            />

            <View style={[styles.divider, { borderColor: theme.divider }]}>
              <View style={[styles.dividerLine, { backgroundColor: theme.divider }]} />
              <Text style={[styles.dividerText, { color: `${theme.text}55` }]}>or</Text>
              <View style={[styles.dividerLine, { backgroundColor: theme.divider }]} />
            </View>

            <Input
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
            <Button
              label="Send magic link"
              variant="primary"
              loading={loading}
              onPress={sendMagicLink}
              style={styles.magicBtn}
            />

            {message ? <Text style={[styles.msg, { color: theme.accent }]}>{message}</Text> : null}
            {error ? <Text style={styles.err}>{error}</Text> : null}
          </Card>

          <Text style={[styles.footer, { color: `${theme.text}44` }]}>
            Log every screening. Track every theatre.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import { supabase } from "../lib/supabase";
import { useTheme } from "../hooks/useTheme";
import { CinematicBg } from "../components/layout/CinematicBg";
import { FilmGrain } from "../components/layout/FilmGrain";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";

WebBrowser.maybeCompleteAuthSession();

export function LoginScreen() {
  const { theme } = useTheme();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function signInGoogle() {
    setLoading(true);
    setError("");
    try {
      const { data, error: err } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: Platform.OS === "web" ? window.location.origin : "cinelog://auth/callback" },
      });
      if (err) throw err;
      if (data.url && Platform.OS !== "web") {
        await WebBrowser.openAuthSessionAsync(data.url, "cinelog://auth/callback");
      }
    } catch (e: any) {
      setError(e.message ?? "Sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  async function sendMagicLink() {
    if (!email) { setError("Enter your email"); return; }
    setLoading(true);
    setError("");
    try {
      const { error: err } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: Platform.OS === "web" ? window.location.origin : "cinelog://auth/callback" },
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
          {/* Logo / Title */}
          <View style={styles.header}>
            <Text style={[styles.logo, { color: theme.accent }]}>🎬</Text>
            <Text style={[styles.title, { color: theme.text }]}>CineLog</Text>
            <Text style={[styles.subtitle, { color: `${theme.text}88` }]}>Your cinema diary</Text>
          </View>

          {/* Login card */}
          <Card glass style={styles.card}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Sign in</Text>

            {/* Google */}
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

            {/* Magic link */}
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

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1 },
  scroll: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  header: { alignItems: "center", marginBottom: 32 },
  logo: { fontSize: 48, marginBottom: 8 },
  title: { fontSize: 32, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { fontSize: 15, marginTop: 4 },
  card: { width: "100%", maxWidth: 380, gap: 12 } as any,
  cardTitle: { fontSize: 20, fontWeight: "700", marginBottom: 4 },
  googleBtn: { width: "100%" },
  magicBtn: { width: "100%", marginTop: 4 },
  divider: { flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 4 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 12 },
  msg: { fontSize: 13, textAlign: "center" },
  err: { fontSize: 13, color: "#e53935", textAlign: "center" },
  footer: { marginTop: 32, fontSize: 12, textAlign: "center" },
});

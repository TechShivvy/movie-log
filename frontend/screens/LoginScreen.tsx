/**
 * LoginScreen — pixel-accurate match to CineLog Web/Mobile design HTML.
 *
 * OAuth flow (Supabase + Google):
 *   - Web:    redirect directly via window.location.href (Supabase handles token from URL)
 *   - Native: expo-auth-session makeRedirectUri() + Linking.addEventListener fallback
 *             (Chrome Custom Tabs on Android may not reliably fire openAuthSessionAsync
 *              callback, so we listen for the deep-link via Linking too)
 */
import React, { useEffect, useRef, useState } from "react";
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
import * as AuthSession from "expo-auth-session";
import { supabase } from "../lib/supabase";
import { useTheme } from "../hooks/useTheme";
import { CinematicBg } from "../components/layout/CinematicBg";
import { FilmGrain } from "../components/layout/FilmGrain";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";

// Required for expo-web-browser auth session to close properly on return
WebBrowser.maybeCompleteAuthSession();

// ── Redirect URL helpers ───────────────────────────────────────────────────────

/**
 * Returns the correct OAuth redirect URL:
 *   Web            → current origin + /auth/callback
 *   Expo Go / dev  → exp://host:port/--/auth/callback   (via AuthSession)
 *   Standalone     → cinelog://auth/callback             (via AuthSession)
 */
function getRedirectUrl(): string {
  if (Platform.OS === "web") {
    return `${(window as any).location.origin}/auth/callback`;
  }
  // AuthSession.makeRedirectUri handles Expo Go vs standalone scheme automatically
  // and produces the URL that Supabase must have in its Redirect URLs list.
  return AuthSession.makeRedirectUri({
    scheme: "cinelog",
    path: "auth/callback",
  });
}

// ── Component ──────────────────────────────────────────────────────────────────

export function LoginScreen() {
  const { theme } = useTheme();
  const [email,   setEmail]   = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error,   setError]   = useState("");

  // Fallback deep-link listener for Android Chrome Custom Tabs
  // (openAuthSessionAsync may not fire its callback reliably on Android)
  useEffect(() => {
    if (Platform.OS === "web") return;

    const sub = Linking.addEventListener("url", ({ url }) => {
      const parsed = Linking.parse(url);
      const code = parsed.queryParams?.code as string | undefined;
      if (!code) return;

      setLoading(true);
      supabase.auth.exchangeCodeForSession(code)
        .then(() => { /* AuthContext onAuthStateChange will redirect */ })
        .catch((e) => setError(e.message ?? "Sign-in failed"))
        .finally(() => setLoading(false));
    });

    return () => sub.remove();
  }, []);

  // ── Google OAuth ─────────────────────────────────────────────────────────────
  async function signInGoogle() {
    setLoading(true);
    setError("");
    try {
      const redirectTo = getRedirectUrl();

      const { data, error: oauthErr } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          skipBrowserRedirect: true, // we control when to open the browser
        },
      });
      if (oauthErr) throw oauthErr;
      if (!data.url) throw new Error("No OAuth URL returned");

      if (Platform.OS === "web") {
        // Web: redirect directly — Supabase handles token from URL hash/query
        (window as any).location.href = data.url;
        return;
      }

      // Native: open in-app browser; wait for redirect back to app
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo, {
        showInRecents: true,
        preferEphemeralSession: false,
      });

      if (result.type === "success") {
        const parsed = Linking.parse(result.url);
        // PKCE flow: ?code=xxx
        const code = parsed.queryParams?.code as string | undefined;
        if (code) {
          const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeErr) throw exchangeErr;
          return;
        }
        // Implicit flow fallback: #access_token=xxx
        const hash = result.url.split("#")[1] ?? "";
        const hp = new URLSearchParams(hash);
        const access_token  = hp.get("access_token");
        const refresh_token = hp.get("refresh_token");
        if (access_token && refresh_token) {
          const { error: sessionErr } = await supabase.auth.setSession({ access_token, refresh_token });
          if (sessionErr) throw sessionErr;
        }
      }
      // If result.type === "cancel" or "dismiss", the Linking listener handles it
    } catch (e: any) {
      setError(e.message ?? "Sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  // ── Magic link ────────────────────────────────────────────────────────────────
  async function sendMagicLink() {
    if (!email.trim()) { setError("Enter your email"); return; }
    setLoading(true);
    setError("");
    try {
      const emailRedirectTo = getRedirectUrl();
      const { error: err } = await supabase.auth.signInWithOtp({
        email: email.trim(),
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

  // ── Web render ────────────────────────────────────────────────────────────────
  if (Platform.OS === "web") {
    return (
      <div style={{ position: "relative", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: theme.bg } as React.CSSProperties}>
        <CinematicBg />
        <FilmGrain />

        <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 420, padding: "0 16px" } as React.CSSProperties}>
          {/* Logo */}
          <div style={{ textAlign: "center", marginBottom: 32 } as React.CSSProperties}>
            <div style={{ fontSize: 48, marginBottom: 8 } as React.CSSProperties}>🎬</div>
            <h1 style={{ fontSize: 32, fontWeight: 700, color: theme.accent, margin: 0, letterSpacing: -0.6 } as React.CSSProperties}>CineLog</h1>
            <p style={{ color: `${theme.text}88`, margin: "4px 0 0", fontSize: 14 } as React.CSSProperties}>Your cinema diary</p>
          </div>

          {/* Card */}
          <div className="card glass elev-md" style={{ padding: 24, gap: 14 } as React.CSSProperties}>
            <h2 style={{ fontSize: 20, fontWeight: 600, color: theme.text, margin: 0 } as React.CSSProperties}>Sign in</h2>

            <button
              className="btn btn-secondary btn-block"
              onClick={signInGoogle}
              disabled={loading}
              style={{ marginTop: 0 } as React.CSSProperties}
            >
              {loading ? <span className="spin">◌</span> : "Continue with Google"}
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 10 } as React.CSSProperties}>
              <div className="hr" style={{ flex: 1, margin: 0 } as React.CSSProperties} />
              <span style={{ fontSize: 12, color: `${theme.text}55` } as React.CSSProperties}>or</span>
              <div className="hr" style={{ flex: 1, margin: 0 } as React.CSSProperties} />
            </div>

            <div className="field">
              <label>Email</label>
              <input
                className="input"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>

            <button
              className="btn btn-primary btn-block"
              onClick={sendMagicLink}
              disabled={loading}
              style={{ marginTop: 0 } as React.CSSProperties}
            >
              {loading ? <span className="spin">◌</span> : "Send magic link"}
            </button>

            {message && <p style={{ color: theme.accent, fontSize: 13, margin: 0 } as React.CSSProperties}>{message}</p>}
            {error   && <p style={{ color: theme.error,  fontSize: 13, margin: 0 } as React.CSSProperties}>{error}</p>}
          </div>

          <p style={{ textAlign: "center", color: `${theme.text}44`, fontSize: 12, marginTop: 20 } as React.CSSProperties}>
            Log every screening. Track every theatre.
          </p>
        </div>
      </div>
    );
  }

  // ── Native render ─────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <CinematicBg />
      <FilmGrain />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo */}
          <View style={{ alignItems: "center", marginBottom: 32 }}>
            <Text style={{ fontSize: 56, marginBottom: 6 }}>🎬</Text>
            <Text style={{ fontSize: 30, fontWeight: "800", color: theme.accent, letterSpacing: -0.6 }}>
              CineLog
            </Text>
            <Text style={{ fontSize: 14, color: `${theme.text}88`, marginTop: 4 }}>
              Your cinema diary
            </Text>
          </View>

          {/* Login card */}
          <Card glass style={{ padding: 24, gap: 14, borderRadius: 16 }}>
            <Text style={{ fontSize: 20, fontWeight: "600", color: theme.text }}>Sign in</Text>

            <Button
              label="Continue with Google"
              variant="secondary"
              loading={loading}
              onPress={signInGoogle}
              block
              style={{ marginTop: 0 }}
            />

            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: theme.divider }} />
              <Text style={{ fontSize: 12, color: `${theme.text}55` }}>or</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: theme.divider }} />
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
              block
              style={{ marginTop: 0 }}
            />

            {message ? <Text style={{ color: theme.accent, fontSize: 13 }}>{message}</Text> : null}
            {error   ? <Text style={{ color: theme.error,  fontSize: 13 }}>{error}</Text>   : null}
          </Card>

          <Text style={{ textAlign: "center", color: `${theme.text}44`, fontSize: 12, marginTop: 20 }}>
            Log every screening. Track every theatre.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

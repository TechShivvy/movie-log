/**
 * LoginScreen — ported from docs/design/CineLog Mobile.dc.html (lines 85-104).
 *
 * The design only specifies a mobile login, so web renders the same spec
 * centred at the phone's content width (392px frame − 26px padding each side).
 *
 * Exact spec:
 *   container   padding:48px 26px 30px; flex column; overflow:hidden; + .cine-bg
 *   logo block  margin-top:40px; center; gap:6px
 *     tile      60x60, radius 16, 1px accent border, accent film-slate @30px,
 *               margin-bottom:6px
 *     title     var(--font-heading) 30px, letter-spacing -.02em
 *     subtitle  .text-muted 14px "Track every theatre memory."
 *   form        margin-top:44px; gap:16px
 *     .field    label "Email address" / "Password" + .input
 *     buttons   btn-primary btn-block  <ph-sign-in>   Sign in
 *               btn-secondary btn-block <ph-magic-wand> Send magic link
 *     OR row    gap:10px margin:4px 0; 1px divider lines; 11px muted "OR"
 *               btn-secondary btn-block <ph-google-logo> Continue with Google
 *   footer      margin-top:auto; center; 13px; padding-top:30px
 *               "New here? " + accent "Create an account"
 *
 * ── OAuth ────────────────────────────────────────────────────────────────────
 * Supabase Dashboard → Authentication → URL Configuration → Redirect URLs
 * must include ALL of:
 *   • http://localhost:8081/auth/callback   (web dev)
 *   • https://<prod-domain>/auth/callback   (web prod)
 *   • cinelog://auth/callback               (dev build / standalone iOS+Android)
 *   • a double-star exp:// pattern          (Expo Go — dynamic LAN IP)
 *
 * Supabase treats BOTH "." and "/" as separators, so a single "*" stops at the
 * first dot of the IP: no single-star pattern can ever match Expo Go's
 * exp://192.168.1.42:8081/--/auth/callback. When nothing matches, Supabase
 * silently falls back to the Site URL — the cause of landing on :3000.
 * Full explanation + the native-sign-in alternative: docs/mobile-oauth.md
 */
import React, { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import * as AuthSession from "expo-auth-session";
import { supabase } from "../lib/supabase";
import { completeAuthFromUrl } from "../lib/authCallback";
import { useTheme } from "../hooks/useTheme";
import { CinematicBg } from "../components/layout/CinematicBg";
import { Icon } from "../components/ui/Icon";
import { fontFamily } from "../constants/fonts";

WebBrowser.maybeCompleteAuthSession();

function getRedirectUrl(): string {
  if (Platform.OS === "web") {
    return `${(window as any).location.origin}/auth/callback`;
  }
  // Expo Go → exp://<ip>:<port>/--/auth/callback; dev build → cinelog://auth/callback
  return AuthSession.makeRedirectUri({ scheme: "cinelog", path: "auth/callback" });
}

export function LoginScreen() {
  const { theme, fontConfig } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const headingFamily = fontFamily(fontConfig, "heading", 600);
  const muted = `${theme.text}8c`; // .text-muted ≈ text 55%

  // Fallback deep-link listener: on Android, Chrome Custom Tabs does not always
  // fire openAuthSessionAsync's callback, so catch the redirect here too.
  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = Linking.addEventListener("url", ({ url }) => {
      void handleRedirect(url);
    });
    return () => sub.remove();
  }, []);

  /**
   * Delegates to lib/authCallback, which de-duplicates by code so this and
   * app/auth/callback.tsx can both react to the same deep link without
   * double-spending the single-use PKCE code.
   */
  async function handleRedirect(url: string): Promise<boolean> {
    setLoading(true);
    try {
      const result = await completeAuthFromUrl(url);
      if (result.status === "error") setError(result.message);
      return result.status === "signed-in";
    } finally {
      setLoading(false);
    }
  }

  async function signInPassword() {
    if (!email.trim() || !password) {
      setError("Enter your email and password");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { error: err } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (err) throw err;
    } catch (e: any) {
      setError(e.message ?? "Sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  async function signInGoogle() {
    setLoading(true);
    setError("");
    try {
      const redirectTo = getRedirectUrl();
      // Compare this against the Supabase Redirect URLs list when debugging.
      console.log("[CineLog OAuth] redirect_to =", redirectTo);

      const { data, error: oauthErr } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (oauthErr) throw oauthErr;
      if (!data.url) throw new Error("No OAuth URL returned");

      if (Platform.OS === "web") {
        (window as any).location.href = data.url;
        return;
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo, {
        showInRecents: true,
      });
      // "cancel"/"dismiss" can also mean Android closed the tab before
      // reporting — the Linking listener above still catches the deep link.
      if (result.type !== "success") return;

      await handleRedirect(result.url);
    } catch (e: any) {
      setError(e.message ?? "Sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  async function sendMagicLink() {
    if (!email.trim()) {
      setError("Enter your email");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { error: err } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: getRedirectUrl() },
      });
      if (err) throw err;
      setMessage("Check your email for the magic link");
    } catch (e: any) {
      setError(e.message ?? "Failed to send link");
    } finally {
      setLoading(false);
    }
  }

  // ── Web ─────────────────────────────────────────────────────────────────────
  if (Platform.OS === "web") {
    return (
      <div
        style={{
          position: "relative",
          minHeight: "100vh",
          display: "flex",
          justifyContent: "center",
          background: theme.bg,
          overflow: "hidden",
        } as React.CSSProperties}
      >
        <CinematicBg />

        <div
          className="screen-anim"
          style={{
            position: "relative",
            zIndex: 1,
            width: "100%",
            maxWidth: 340, // 392px design frame − 26px padding each side
            padding: "48px 26px 30px",
            display: "flex",
            flexDirection: "column",
          } as React.CSSProperties}
        >
          {/* Logo block */}
          <div
            style={{
              marginTop: 40,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              gap: 6,
            } as React.CSSProperties}
          >
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: 16,
                display: "grid",
                placeItems: "center",
                border: `1px solid ${theme.accent}`,
                color: theme.accent,
                marginBottom: 6,
              } as React.CSSProperties}
            >
              <Icon name="film-slate" weight="fill" size={30} />
            </div>
            <div style={{ fontFamily: headingFamily, fontSize: 30, letterSpacing: "-.02em" } as React.CSSProperties}>
              CineLog
            </div>
            <div className="text-muted" style={{ fontSize: 14 } as React.CSSProperties}>
              Track every theatre memory.
            </div>
          </div>

          {/* Form */}
          <div style={{ marginTop: 44, display: "flex", flexDirection: "column", gap: 16 } as React.CSSProperties}>
            <div className="field">
              <label>Email address</label>
              <input
                className="input"
                type="email"
                autoComplete="email"
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") signInPassword(); }}
              />
            </div>

            <div className="field">
              <label>Password</label>
              <input
                className="input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") signInPassword(); }}
              />
            </div>

            <button className="btn btn-primary btn-block" onClick={signInPassword} disabled={loading}>
              <Icon name={loading ? "circle-notch" : "sign-in"} size={16} />
              Sign in
            </button>

            <button className="btn btn-secondary btn-block" onClick={sendMagicLink} disabled={loading}>
              <Icon name="magic-wand" size={16} />
              Send magic link
            </button>

            {/* OR divider */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0" } as React.CSSProperties}>
              <div style={{ flex: 1, height: 1, background: theme.divider } as React.CSSProperties} />
              <span className="text-muted" style={{ fontSize: 11 } as React.CSSProperties}>OR</span>
              <div style={{ flex: 1, height: 1, background: theme.divider } as React.CSSProperties} />
            </div>

            <button className="btn btn-secondary btn-block" onClick={signInGoogle} disabled={loading}>
              <Icon name="google-logo" size={16} />
              Continue with Google
            </button>

            {message ? <p style={{ color: theme.accent, fontSize: 13, margin: 0 } as React.CSSProperties}>{message}</p> : null}
            {error ? <p style={{ color: theme.error, fontSize: 13, margin: 0 } as React.CSSProperties}>{error}</p> : null}
          </div>

          {/* Footer pinned to bottom */}
          <div
            className="text-muted"
            style={{ marginTop: "auto", textAlign: "center", fontSize: 13, paddingTop: 30 } as React.CSSProperties}
          >
            New here? <span style={{ color: theme.accent, cursor: "pointer" } as React.CSSProperties}>Create an account</span>
          </div>
        </div>
      </div>
    );
  }

  // ── Native ──────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, overflow: "hidden" }}>
      <CinematicBg />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingTop: 48,
            paddingHorizontal: 26,
            paddingBottom: 30,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo block */}
          <View style={{ marginTop: 40, alignItems: "center", gap: 6 }}>
            <View
              style={{
                width: 60,
                height: 60,
                borderRadius: 16,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: theme.accent,
                marginBottom: 6,
              }}
            >
              <Icon name="film-slate" weight="fill" size={30} color={theme.accent} />
            </View>
            <Text style={{ fontFamily: headingFamily, fontSize: 30, letterSpacing: -0.6, color: theme.text }}>
              CineLog
            </Text>
            <Text style={{ fontSize: 14, color: muted }}>Track every theatre memory.</Text>
          </View>

          {/* Form */}
          <View style={{ marginTop: 44, gap: 16 }}>
            <View>
              <Text style={{ fontSize: 12, marginBottom: 5, color: `${theme.text}b3` }}>Email address</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@email.com"
                placeholderTextColor={`${theme.text}55`}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                style={{
                  minHeight: 36, paddingVertical: 6, paddingHorizontal: 10, fontSize: 14,
                  color: theme.text, backgroundColor: theme.surface,
                  borderWidth: 1, borderColor: theme.divider, borderRadius: 8,
                }}
              />
            </View>

            <View>
              <Text style={{ fontSize: 12, marginBottom: 5, color: `${theme.text}b3` }}>Password</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="current-password"
                style={{
                  minHeight: 36, paddingVertical: 6, paddingHorizontal: 10, fontSize: 14,
                  color: theme.text, backgroundColor: theme.surface,
                  borderWidth: 1, borderColor: theme.divider, borderRadius: 8,
                }}
              />
            </View>

            {/* btn-primary btn-block */}
            <Pressable
              onPress={signInPassword}
              disabled={loading}
              style={{
                flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                minHeight: 36, paddingVertical: 5.6, paddingHorizontal: 10,
                borderRadius: 8, borderWidth: 1, borderColor: theme.accent,
                opacity: loading ? 0.45 : 1,
              }}
            >
              <Icon name={loading ? "circle-notch" : "sign-in"} size={16} color={theme.accent} />
              <Text style={{ fontFamily: headingFamily, fontSize: 14, color: theme.accent }}>Sign in</Text>
            </Pressable>

            {/* btn-secondary btn-block */}
            <Pressable
              onPress={sendMagicLink}
              disabled={loading}
              style={{
                flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                minHeight: 36, paddingVertical: 5.6, paddingHorizontal: 10,
                borderRadius: 8, borderWidth: 1, borderColor: theme.divider,
                opacity: loading ? 0.45 : 1,
              }}
            >
              <Icon name="magic-wand" size={16} color={theme.text} />
              <Text style={{ fontFamily: headingFamily, fontSize: 14, color: theme.text }}>Send magic link</Text>
            </Pressable>

            {/* OR divider */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 4 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: theme.divider }} />
              <Text style={{ fontSize: 11, color: muted }}>OR</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: theme.divider }} />
            </View>

            <Pressable
              onPress={signInGoogle}
              disabled={loading}
              style={{
                flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                minHeight: 36, paddingVertical: 5.6, paddingHorizontal: 10,
                borderRadius: 8, borderWidth: 1, borderColor: theme.divider,
                opacity: loading ? 0.45 : 1,
              }}
            >
              <Icon name="google-logo" size={16} color={theme.text} />
              <Text style={{ fontFamily: headingFamily, fontSize: 14, color: theme.text }}>Continue with Google</Text>
            </Pressable>

            {message ? <Text style={{ color: theme.accent, fontSize: 13 }}>{message}</Text> : null}
            {error ? <Text style={{ color: theme.error, fontSize: 13 }}>{error}</Text> : null}
          </View>

          {/* Footer pinned to bottom (margin-top:auto) */}
          <View style={{ marginTop: "auto", paddingTop: 30, alignItems: "center" }}>
            <Text style={{ fontSize: 13, color: muted }}>
              New here? <Text style={{ color: theme.accent }}>Create an account</Text>
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

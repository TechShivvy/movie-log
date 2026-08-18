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
 * "Create an account" used to be inert text — no route, no handler, clicking
 * it did nothing. There's still no dedicated signup screen or route; instead
 * the form itself toggles between sign-in and sign-up mode (`mode` state
 * below), keeping the single centred layout the design specifies rather than
 * adding a second (auth) index route (see app/(auth)/_layout.tsx's own
 * comment about the / path collision between (auth) and (app)'s index
 * routes — one more competing index route was the wrong direction).
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
import React, { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import * as AuthSession from "expo-auth-session";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { completeAuthFromUrl } from "../lib/authCallback";
import { useTheme } from "../hooks/useTheme";
import { CinematicBg } from "../components/layout/CinematicBg";
import { Icon } from "../components/ui/Icon";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { GoogleIcon } from "../components/ui/GoogleIcon";
import { fontFamily } from "../constants/fonts";

WebBrowser.maybeCompleteAuthSession();

function getRedirectUrl(): string {
  if (Platform.OS === "web") {
    return `${(window as any).location.origin}/auth/callback`;
  }
  // Expo Go → exp://<ip>:<port>/--/auth/callback; dev build → cinelog://auth/callback
  return AuthSession.makeRedirectUri({ scheme: "cinelog", path: "auth/callback" });
}

type Mode = "signin" | "signup";
// Which single action is in flight, so the busy button can say what it's
// doing ("Signing in…") instead of every button on the screen dimming
// identically with no way to tell which one is actually running.
type Action = null | "password" | "signup" | "magic" | "google";

export function LoginScreen() {
  const { theme, fontConfig } = useTheme();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [action, setAction] = useState<Action>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const passwordRef = useRef<TextInput>(null);
  // LoginScreen has no shell layout above it (unlike (app)/_layout.tsx's
  // MobileLayout) to apply device insets, so it reads them directly. Added
  // on top of the existing 48/30 design padding below, not in place of it.
  const insets = useSafeAreaInsets();

  const headingFamily = fontFamily(fontConfig, "heading", 600);
  const muted = `${theme.text}8c`; // .text-muted ≈ text 55%
  const busy = action !== null;

  function switchMode(next: Mode) {
    setMode(next);
    setError("");
    setMessage("");
    setConfirmPassword("");
  }

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
    setAction("google");
    try {
      const result = await completeAuthFromUrl(url);
      if (result.status === "error") setError(result.message);
      return result.status === "signed-in";
    } finally {
      setAction(null);
    }
  }

  async function signInPassword() {
    if (!email.trim() || !password) {
      setError("Enter your email and password");
      return;
    }
    setAction("password");
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
      setAction(null);
    }
  }

  async function signUp() {
    if (!email.trim() || !password) {
      setError("Enter your email and password");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    setAction("signup");
    setError("");
    setMessage("");
    try {
      const { data, error: err } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: getRedirectUrl() },
      });
      if (err) throw err;
      // With email confirmations on (the common Supabase default), signUp
      // returns a user but no session — the account exists, but isn't
      // signed in yet. Without this branch the screen would just sit there
      // looking like nothing happened.
      if (!data.session) {
        setMessage("Check your email to confirm your account, then sign in.");
        switchMode("signin");
      }
    } catch (e: any) {
      setError(e.message ?? "Sign-up failed");
    } finally {
      setAction(null);
    }
  }

  async function signInGoogle() {
    setAction("google");
    setError("");
    try {
      const redirectTo = getRedirectUrl();
      // Compare this against the Supabase Redirect URLs list when debugging.
      // __DEV__-gated: this ran unconditionally in production before, which
      // put the redirect URI in every user's browser console.
      if (__DEV__) console.log("[CineLog OAuth] redirect_to =", redirectTo);

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
      setAction(null);
    }
  }

  async function sendMagicLink() {
    if (!email.trim()) {
      setError("Enter your email");
      return;
    }
    setAction("magic");
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
      setAction(null);
    }
  }

  function submit() {
    if (mode === "signin") void signInPassword();
    else void signUp();
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

          {/* Form — a real <form> so Enter submits and the browser's own
              password manager can recognise and offer to save credentials,
              instead of the previous loose <input>s with hand-wired
              onKeyDown Enter handlers. */}
          <form
            onSubmit={(e) => { e.preventDefault(); submit(); }}
            style={{ marginTop: 44, display: "flex", flexDirection: "column", gap: 16 } as React.CSSProperties}
          >
            <div className="field">
              <label>Email address</label>
              <input
                className="input"
                type="email"
                autoComplete="email"
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="field">
              <label>Password</label>
              <div style={{ position: "relative" } as React.CSSProperties}>
                <input
                  className="input"
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  style={{ paddingRight: 34 } as React.CSSProperties}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((s) => !s)}
                  style={{
                    position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                    border: "none", background: "transparent", cursor: "pointer", padding: 4,
                  } as React.CSSProperties}
                >
                  <Icon name={showPassword ? "eye-slash" : "eye"} size={16} color={muted} />
                </button>
              </div>
            </div>

            {mode === "signup" ? (
              <div className="field">
                <label>Confirm password</label>
                <input
                  className="input"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            ) : null}

            {mode === "signin" ? (
              <>
                {/* type="submit": the only button in this form that should
                    respond to Enter / the form's onSubmit. Every other
                    button below is type="button" (Button.tsx's default) so
                    it only fires its own onClick. */}
                <Button
                  type="submit"
                  variant="primary"
                  block
                  icon="sign-in"
                  loading={action === "password"}
                  disabled={busy}
                  label={action === "password" ? "Signing in…" : "Sign in"}
                />

                <Button
                  variant="secondary"
                  block
                  icon="magic-wand"
                  loading={action === "magic"}
                  disabled={busy}
                  label={action === "magic" ? "Sending link…" : "Send magic link"}
                  onPress={sendMagicLink}
                />

                {/* OR divider */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0" } as React.CSSProperties}>
                  <div style={{ flex: 1, height: 1, background: theme.divider } as React.CSSProperties} />
                  <span className="text-muted" style={{ fontSize: 11 } as React.CSSProperties}>OR</span>
                  <div style={{ flex: 1, height: 1, background: theme.divider } as React.CSSProperties} />
                </div>

                {/* Google's mark is 4 fixed brand colors, not a currentColor
                    glyph — GoogleIcon renders it directly rather than going
                    through Icon's one-color registry. Swapped in via
                    children while idle; loading still falls back to
                    Button's own circle-notch+label pair since children
                    fully overrides that path (see Button.tsx's ButtonProps
                    comment on `children`). */}
                {action === "google" ? (
                  <Button variant="secondary" block loading disabled label="Opening Google…" />
                ) : (
                  <Button variant="secondary" block disabled={busy} onPress={signInGoogle}>
                    <GoogleIcon size={16} />
                    <span>Continue with Google</span>
                  </Button>
                )}
              </>
            ) : (
              <Button
                type="submit"
                variant="primary"
                block
                icon="user-plus"
                loading={action === "signup"}
                disabled={busy}
                label={action === "signup" ? "Creating account…" : "Create account"}
              />
            )}
          </form>

          {message ? <p role="status" style={{ color: theme.accent, fontSize: 13, margin: "12px 0 0" } as React.CSSProperties}>{message}</p> : null}
          {error ? <p role="alert" style={{ color: theme.error, fontSize: 13, margin: "12px 0 0" } as React.CSSProperties}>{error}</p> : null}

          {/* Footer pinned to bottom */}
          <div
            className="text-muted"
            style={{ marginTop: "auto", textAlign: "center", fontSize: 13, paddingTop: 30 } as React.CSSProperties}
          >
            {mode === "signin" ? (
              <>New here? <span
                style={{ color: theme.accent, cursor: "pointer" } as React.CSSProperties}
                onClick={() => switchMode("signup")}
              >Create an account</span></>
            ) : (
              <>Already have an account? <span
                style={{ color: theme.accent, cursor: "pointer" } as React.CSSProperties}
                onClick={() => switchMode("signin")}
              >Sign in</span></>
            )}
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
            paddingTop: 48 + insets.top,
            paddingHorizontal: 26,
            paddingBottom: 30 + insets.bottom,
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
            <Input
              label="Email address"
              value={email}
              onChangeText={setEmail}
              placeholder="you@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />

            <Input
              ref={passwordRef as any}
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              returnKeyType={mode === "signin" ? "go" : "next"}
              onSubmitEditing={() => (mode === "signin" ? submit() : undefined)}
            />

            {mode === "signup" ? (
              <Input
                label="Confirm password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showPassword}
                autoComplete="new-password"
                returnKeyType="go"
                onSubmitEditing={submit}
              />
            ) : null}

            <Button
              variant="ghost"
              icon={showPassword ? "eye-slash" : "eye"}
              label={showPassword ? "Hide password" : "Show password"}
              onPress={() => setShowPassword((s) => !s)}
            />

            {mode === "signin" ? (
              <>
                <Button
                  variant="primary"
                  block
                  icon="sign-in"
                  loading={action === "password"}
                  disabled={busy}
                  label={action === "password" ? "Signing in…" : "Sign in"}
                  onPress={signInPassword}
                />

                <Button
                  variant="secondary"
                  block
                  icon="magic-wand"
                  loading={action === "magic"}
                  disabled={busy}
                  label={action === "magic" ? "Sending link…" : "Send magic link"}
                  onPress={sendMagicLink}
                />

                {/* OR divider */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 4 }}>
                  <View style={{ flex: 1, height: 1, backgroundColor: theme.divider }} />
                  <Text style={{ fontSize: 11, color: muted }}>OR</Text>
                  <View style={{ flex: 1, height: 1, backgroundColor: theme.divider }} />
                </View>

                {/* Google's mark is 4 fixed brand colors — GoogleIcon, not
                    Icon's one-color registry. See the matching comment on
                    the web branch above. */}
                {action === "google" ? (
                  <Button variant="secondary" block loading disabled label="Opening Google…" />
                ) : (
                  <Button variant="secondary" block disabled={busy} onPress={signInGoogle}>
                    <GoogleIcon size={16} />
                    <Text style={{ fontFamily: headingFamily, fontSize: 14, color: theme.text }}>Continue with Google</Text>
                  </Button>
                )}
              </>
            ) : (
              <Button
                variant="primary"
                block
                icon="user-plus"
                loading={action === "signup"}
                disabled={busy}
                label={action === "signup" ? "Creating account…" : "Create account"}
                onPress={signUp}
              />
            )}

            {message ? (
              <Text accessibilityLiveRegion="polite" style={{ color: theme.accent, fontSize: 13 }}>{message}</Text>
            ) : null}
            {error ? (
              <Text accessibilityLiveRegion="assertive" style={{ color: theme.error, fontSize: 13 }}>{error}</Text>
            ) : null}
          </View>

          {/* Footer pinned to bottom (margin-top:auto) */}
          <View style={{ marginTop: "auto", paddingTop: 30, alignItems: "center" }}>
            {mode === "signin" ? (
              <Text style={{ fontSize: 13, color: muted }}>
                New here?{" "}
                <Text style={{ color: theme.accent }} onPress={() => switchMode("signup")}>
                  Create an account
                </Text>
              </Text>
            ) : (
              <Text style={{ fontSize: 13, color: muted }}>
                Already have an account?{" "}
                <Text style={{ color: theme.accent }} onPress={() => switchMode("signin")}>
                  Sign in
                </Text>
              </Text>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/**
 * LoginScreen — ported from docs/design/CineLog Mobile.dc.html (lines 85-104).
 *
 * The design only specifies a mobile login, so web (desktop/tablet) renders
 * the same spec centred at the phone's content width (392px frame − 26px
 * padding each side); narrower web falls through to the native/scrollable
 * layout, same breakpoint convention as every other screen.
 *
 * One JSX tree, breakpoint-driven (see Part C of the architecture-
 * unification plan) — the old web branch hand-rolled raw `<input>`/
 * `<label>` elements with `.field`/`.input` CSS classes instead of the
 * shared Input component the native branch already used correctly (Input
 * itself already renders those same classes on web — see its own header
 * comment), and had a different password-visibility UX (an inline eye
 * icon inside the field) from native's separate "Show/Hide password"
 * button. Adopted native's Input/Button-based approach and its separate
 * toggle button everywhere. The OAuth mechanism itself (redirect URL
 * shape, page-navigate vs in-app-browser-session, the Android deep-link
 * fallback listener) is lifted out to lib/oauth.ts — see that file.
 *
 * "Create an account" used to be inert text — no route, no handler, clicking
 * it did nothing. There's still no dedicated signup screen or route; instead
 * the form itself toggles between sign-in and sign-up mode (`mode` state
 * below), keeping the single centred layout the design specifies rather than
 * adding a second (auth) index route (see app/(auth)/_layout.tsx's own
 * comment about the / path collision between (auth) and (app)'s index
 * routes — one more competing index route was the wrong direction).
 */
import React, { useCallback, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { completeAuthFromUrl } from "../lib/authCallback";
import { getOAuthRedirectUrl, signInWithGoogle as startGoogleSignIn, useOAuthDeepLink } from "../lib/oauth";
import { useTheme } from "../hooks/useTheme";
import { type as fontSizes } from "../constants/fonts";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { CinematicBg } from "../components/layout/CinematicBg";
import { Icon } from "../components/ui/Icon";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { GoogleIcon } from "../components/ui/GoogleIcon";
import { fontFamily } from "../constants/fonts";

type Mode = "signin" | "signup";
// Which single action is in flight, so the busy button can say what it's
// doing ("Signing in…") instead of every button on the screen dimming
// identically with no way to tell which one is actually running.
type Action = null | "password" | "signup" | "magic" | "google";

export function LoginScreen() {
  const { theme, fontConfig } = useTheme();
  const { isMobile } = useBreakpoint();
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

  /**
   * Delegates to lib/authCallback, which de-duplicates by code so this and
   * app/auth/callback.tsx can both react to the same deep link without
   * double-spending the single-use PKCE code.
   */
  const handleRedirect = useCallback(async (url: string): Promise<boolean> => {
    setAction("google");
    try {
      const result = await completeAuthFromUrl(url);
      if (result.status === "error") setError(result.message);
      return result.status === "signed-in";
    } finally {
      setAction(null);
    }
  }, []);

  // Native-only fallback (see lib/oauth.ts) — a no-op on web.
  useOAuthDeepLink(useCallback((url: string) => { void handleRedirect(url); }, [handleRedirect]));

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
        options: { emailRedirectTo: getOAuthRedirectUrl() },
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
      const result = await startGoogleSignIn();
      if (result.status === "callback") {
        await handleRedirect(result.url);
      }
      // "redirected" (web) and "cancelled" both need no further action
      // here — a redirect navigates the whole page away, and a cancel
      // just falls through to `finally` below.
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
        options: { emailRedirectTo: getOAuthRedirectUrl() },
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

  const fields = (
    <>
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
          {/* type="submit": on web, the <form> wrapper below makes this the
              button that responds to Enter — clicking it ALSO fires the
              form's own onSubmit (a submit-type button inside a <form>
              triggers that natively), so onPress is deliberately omitted
              on web here to avoid calling signInPassword() twice; native
              has no form to submit, so it needs onPress to do anything at
              all. Every other button here is type="button" (Button's
              default) so it only ever fires its own onPress/onClick, no
              double-fire risk. */}
          <Button
            type="submit"
            variant="primary"
            block
            icon="sign-in"
            loading={action === "password"}
            disabled={busy}
            label={action === "password" ? "Signing in…" : "Sign in"}
            onPress={Platform.OS === "web" ? undefined : signInPassword}
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
            <Text style={{ fontSize: fontSizes.xs, color: muted }}>OR</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: theme.divider }} />
          </View>

          {/* Google's mark is 4 fixed brand colors, not a currentColor
              glyph — GoogleIcon renders it directly rather than going
              through Icon's one-color registry. Swapped in via children
              while idle; loading falls back to Button's own circle-notch+
              label pair since children fully overrides that path (see
              Button.tsx's ButtonProps comment on `children`). */}
          {action === "google" ? (
            <Button variant="secondary" block loading disabled label="Opening Google…" />
          ) : (
            <Button variant="secondary" block disabled={busy} onPress={signInGoogle}>
              <GoogleIcon size={16} />
              <Text style={{ fontFamily: headingFamily, fontSize: fontSizes.base, color: theme.text }}>Continue with Google</Text>
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
          onPress={Platform.OS === "web" ? undefined : signUp}
        />
      )}

      {message ? (
        <Text accessibilityLiveRegion="polite" style={{ color: theme.accent, fontSize: fontSizes.sm }}>{message}</Text>
      ) : null}
      {error ? (
        <Text accessibilityLiveRegion="assertive" style={{ color: theme.error, fontSize: fontSizes.sm }}>{error}</Text>
      ) : null}
    </>
  );

  const content = (
    <>
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
        <Text style={{ fontFamily: headingFamily, fontSize: fontSizes.h2, letterSpacing: -0.6, color: theme.text }}>
          CineLog
        </Text>
        <Text style={{ fontSize: fontSizes.base, color: muted }}>Track every theatre memory.</Text>
      </View>

      {/* Form — a real <form> on web so Enter submits and the browser's own
          password manager can recognise and offer to save credentials, a
          genuine web-only affordance with no native equivalent to
          replicate; native gets a plain View around the same fields. */}
      {Platform.OS === "web" ? (
        <form onSubmit={(e) => { e.preventDefault(); submit(); }} style={{ marginTop: 44, display: "flex", flexDirection: "column", gap: 16 } as React.CSSProperties}>
          {fields}
        </form>
      ) : (
        <View style={{ marginTop: 44, gap: 16 }}>
          {fields}
        </View>
      )}

      {/* Footer pinned to bottom (marginTop:"auto") */}
      <View style={{ marginTop: "auto", paddingTop: 30, alignItems: "center" }}>
        {mode === "signin" ? (
          <Text style={{ fontSize: fontSizes.sm, color: muted }}>
            New here?{" "}
            <Text style={{ color: theme.accent }} onPress={() => switchMode("signup")}>
              Create an account
            </Text>
          </Text>
        ) : (
          <Text style={{ fontSize: fontSizes.sm, color: muted }}>
            Already have an account?{" "}
            <Text style={{ color: theme.accent }} onPress={() => switchMode("signin")}>
              Sign in
            </Text>
          </Text>
        )}
      </View>
    </>
  );

  // isMobile, not just Platform.OS: below 768px the "web" branch used to
  // still render — a centred ≤340px card degrades tolerably at any width
  // above its own cap, so this was lower-risk than Library/LogForm, but
  // it's still the desktop-authored layout rather than the one built for
  // a phone (which also already handles safe-area insets this one
  // doesn't).
  // ── Web (tablet & desktop only) ─────────────────────────────────────────────
  if (Platform.OS === "web" && !isMobile) {
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
          {content}
        </div>
      </div>
    );
  }

  // ── Native (also mobile web — see the isMobile comment above) ───────────────
  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, overflow: "hidden" }}>
      <CinematicBg />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{
            flexGrow: 1,
            paddingTop: 48 + insets.top,
            paddingHorizontal: 26,
            paddingBottom: 30 + insets.bottom,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {content}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

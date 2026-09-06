/**
 * lib/oauth.ts — the Google OAuth mechanism, lifted out of LoginScreen.tsx.
 *
 * That screen used to hand-roll three separate Platform.OS forks for one
 * mechanism: the redirect URL shape (a same-origin web URL vs an
 * AuthSession deep-link scheme), whether "open this OAuth URL" means
 * navigating the whole page away or opening an in-app browser session,
 * and a native-only fallback deep-link listener (Android's Chrome Custom
 * Tabs doesn't always fire openAuthSessionAsync's own callback). None of
 * that is specific to the screen — same "one function, the platform
 * difference resolved inside it" shape lib/storage.ts's
 * pickAndUploadImage already sets for image picking.
 *
 * ── Supabase redirect URL configuration ─────────────────────────────────
 * Supabase Dashboard → Authentication → URL Configuration → Redirect URLs
 * must include ALL of:
 *   • http://localhost:8081/auth/callback   (web dev)
 *   • https://<prod-domain>/auth/callback   (web prod)
 *   • cinelog://auth/callback               (dev build / standalone iOS+Android)
 *   • a double-star exp:// pattern          (Expo Go — dynamic LAN IP)
 *
 * Supabase treats BOTH "." and "/" as separators, so a single "*" stops at
 * the first dot of the IP: no single-star pattern can ever match Expo Go's
 * exp://192.168.1.42:8081/--/auth/callback. When nothing matches, Supabase
 * silently falls back to the Site URL — the cause of landing on :3000.
 * Full explanation + the native-sign-in alternative: docs/mobile-oauth.md
 */
import { useEffect } from "react";
import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import * as AuthSession from "expo-auth-session";
import { supabase } from "./supabase";

WebBrowser.maybeCompleteAuthSession();

export function getOAuthRedirectUrl(): string {
  if (Platform.OS === "web") {
    return `${(window as any).location.origin}/auth/callback`;
  }
  // Expo Go → exp://<ip>:<port>/--/auth/callback; dev build → cinelog://auth/callback
  return AuthSession.makeRedirectUri({ scheme: "cinelog", path: "auth/callback" });
}

export type GoogleSignInResult =
  | { status: "redirected" }            // web: the whole page navigated away, caller does nothing further
  | { status: "callback"; url: string } // native: the browser session returned a deep-link url — hand it to lib/authCallback's completeAuthFromUrl
  | { status: "cancelled" };

/**
 * Starts the Google OAuth flow and resolves once we know what happened —
 * NOT once the caller is actually signed in. A native "callback" result
 * still needs feeding through lib/authCallback's completeAuthFromUrl,
 * same as useOAuthDeepLink's own fallback listener below does for the
 * case Android's browser doesn't report back through here at all.
 */
export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  const redirectTo = getOAuthRedirectUrl();
  // Compare this against the Supabase Redirect URLs list when debugging.
  // __DEV__-gated: this ran unconditionally in production before, which
  // put the redirect URI in every user's browser console.
  if (__DEV__) console.log("[CineLog OAuth] redirect_to =", redirectTo);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data.url) throw new Error("No OAuth URL returned");

  if (Platform.OS === "web") {
    (window as any).location.href = data.url;
    return { status: "redirected" };
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo, { showInRecents: true });
  // "cancel"/"dismiss" can also mean Android closed the tab before
  // reporting — useOAuthDeepLink's own listener still catches that case.
  if (result.type !== "success") return { status: "cancelled" };
  return { status: "callback", url: result.url };
}

/**
 * Fallback deep-link listener: on Android, Chrome Custom Tabs does not
 * always fire openAuthSessionAsync's own callback, so this catches the
 * redirect independently. Web has no equivalent (no in-app browser
 * session to begin with — signInWithGoogle navigates the whole page), so
 * this is a no-op there.
 */
export function useOAuthDeepLink(onUrl: (url: string) => void) {
  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = Linking.addEventListener("url", ({ url }) => onUrl(url));
    return () => sub.remove();
  }, [onUrl]);
}

/**
 * Single owner for completing an OAuth/magic-link redirect.
 *
 * WHY THIS EXISTS — a PKCE authorization code is SINGLE USE. Two things react
 * to the same native deep link:
 *   1. expo-router routes cinelog://auth/callback → app/auth/callback.tsx
 *   2. LoginScreen's Linking.addEventListener("url") fires
 * Both used to call exchangeCodeForSession() with the same code. Whichever ran
 * second got "invalid request: both auth code and code verifier should be
 * non-empty" (or a challenge mismatch) and surfaced a spurious failure — even
 * though sign-in had actually succeeded a millisecond earlier.
 *
 * Routing every path through here de-duplicates by code: concurrent callers
 * share one in-flight promise, and an already-consumed code resolves to the
 * cached result instead of being exchanged twice.
 */
import * as Linking from "expo-linking";
import { supabase } from "./supabase";

export type AuthCallbackResult =
  | { status: "signed-in" }
  | { status: "none" }
  | { status: "error"; message: string };

const inFlight = new Map<string, Promise<AuthCallbackResult>>();
const settled = new Map<string, AuthCallbackResult>();

function remember(key: string, result: AuthCallbackResult): AuthCallbackResult {
  settled.set(key, result);
  inFlight.delete(key);
  return result;
}

/**
 * Completes sign-in from a redirect URL, accepting both flow shapes:
 *   PKCE     → ?code=…                          (exchangeCodeForSession)
 *   implicit → #access_token=…&refresh_token=…   (setSession)
 *
 * Safe to call repeatedly with the same URL.
 */
export function completeAuthFromUrl(url: string): Promise<AuthCallbackResult> {
  const code = Linking.parse(url).queryParams?.code as string | undefined;
  const hash = url.split("#")[1];

  // Key on whatever credential the URL carries so repeat deliveries collapse.
  const key = code ?? hash ?? "";
  if (!key) return Promise.resolve({ status: "none" });

  const already = settled.get(key);
  if (already) return Promise.resolve(already);

  const pending = inFlight.get(key);
  if (pending) return pending;

  const run = (async (): Promise<AuthCallbackResult> => {
    try {
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;
        return remember(key, { status: "signed-in" });
      }

      const hp = new URLSearchParams(hash);
      const access_token = hp.get("access_token");
      const refresh_token = hp.get("refresh_token");
      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({ access_token, refresh_token });
        if (error) throw error;
        return remember(key, { status: "signed-in" });
      }

      const desc = hp.get("error_description");
      if (desc) {
        return remember(key, {
          status: "error",
          message: decodeURIComponent(desc.replace(/\+/g, " ")),
        });
      }
      return remember(key, { status: "none" });
    } catch (e: any) {
      return remember(key, { status: "error", message: e?.message ?? "Sign-in failed" });
    }
  })();

  inFlight.set(key, run);
  return run;
}

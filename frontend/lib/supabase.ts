import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
// Support both EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY (new) and EXPO_PUBLIC_SUPABASE_ANON_KEY (old)
const SUPABASE_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  "";

// ── Storage adapter — native vs web ──────────────────────────────────────────

const webStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(key);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(key);
  },
};

const storage = Platform.OS === "web" ? webStorage : AsyncStorage;

// ── Client ───────────────────────────────────────────────────────────────────

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    // Always false, both platforms — app/auth/callback.tsx's
    // completeAuthFromUrl() (lib/authCallback.ts) is the one, sole owner
    // of redirect completion everywhere (PKCE code AND implicit-flow
    // fragment, native deep link AND web hard-navigation). This used to
    // be `Platform.OS === "web"`: on a real web OAuth redirect, the
    // whole app (including this client) reinitializes fresh on that hard
    // page load, so detectSessionInUrl:true meant Supabase's OWN internal
    // auto-detection fired at client-creation time, racing the explicit
    // exchangeCodeForSession() call in app/auth/callback.tsx — a PKCE
    // code+verifier is single-use, so whichever ran second failed with
    // "code verifier could not be found" even though sign-in had already
    // actually succeeded a moment earlier. False everywhere removes the
    // second, redundant auto-handler instead of trying to out-race it.
    detectSessionInUrl: false,
    // supabase-js defaults flowType to 'implicit', which returns the session as
    // a URL *fragment* (#access_token=…). A fragment is invisible to
    // Linking.parse()'s queryParams and cannot be exchanged with
    // exchangeCodeForSession(), so the native callback had nothing to act on.
    // PKCE returns ?code=… instead, is the recommended flow for mobile, and
    // keeps the code verifier in `storage` above.
    flowType: "pkce",
  },
});

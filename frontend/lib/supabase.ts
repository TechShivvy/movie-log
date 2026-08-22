import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

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

// SecureStore-backed adapter for native — was AsyncStorage before, which is
// plaintext at rest (unencrypted SQLite on Android, an unencrypted plist on
// iOS); SecureStore is the Keychain/Keystore-backed equivalent, and the
// dependency + config plugin were already installed and unused for this.
//
// iOS Keychain caps a single value at ~2048 bytes. A Supabase session
// (access token + refresh token + user metadata, JSON-stringified) reliably
// exceeds that, so a value gets split into fixed-size chunks stored under
// derived keys (`${key}_c0`, `${key}_c1`, …), with the chunk count stored
// under the original key so getItem knows how many to reassemble. Below the
// threshold, the value is stored directly under the plain key (marked with a
// count of "0") — that's both an optimization and back-compatible with
// SecureStore's own single-value shape.
const SECURE_STORE_CHUNK_SIZE = 1800; // headroom under the ~2048B Keychain cap
const secureStorage = {
  getItem: async (key: string): Promise<string | null> => {
    const head = await SecureStore.getItemAsync(key);
    if (head === null) return null;
    const chunkCount = Number(head);
    if (!Number.isInteger(chunkCount) || chunkCount <= 0) return head; // unchunked value
    const chunks = await Promise.all(
      Array.from({ length: chunkCount }, (_, i) => SecureStore.getItemAsync(`${key}_c${i}`))
    );
    if (chunks.some((c) => c === null)) return null; // partial/corrupt write — treat as absent
    return chunks.join("");
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (value.length <= SECURE_STORE_CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value);
      return;
    }
    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += SECURE_STORE_CHUNK_SIZE) {
      chunks.push(value.slice(i, i + SECURE_STORE_CHUNK_SIZE));
    }
    await Promise.all(chunks.map((c, i) => SecureStore.setItemAsync(`${key}_c${i}`, c)));
    // Written last so a getItem racing this setItem never sees a count
    // pointing at chunks that haven't landed yet.
    await SecureStore.setItemAsync(key, String(chunks.length));
  },
  removeItem: async (key: string): Promise<void> => {
    const head = await SecureStore.getItemAsync(key);
    const chunkCount = head !== null ? Number(head) : 0;
    if (Number.isInteger(chunkCount) && chunkCount > 0) {
      await Promise.all(
        Array.from({ length: chunkCount }, (_, i) => SecureStore.deleteItemAsync(`${key}_c${i}`))
      );
    }
    await SecureStore.deleteItemAsync(key);
  },
};

const storage = Platform.OS === "web" ? webStorage : secureStorage;

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

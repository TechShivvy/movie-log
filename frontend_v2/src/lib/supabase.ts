import "react-native-url-polyfill/auto";

import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabasePublishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    "Missing Supabase env vars. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
  );
}

const ExpoSecureStoreAdapter =
  Platform.OS === "web"
    ? {
        getItem: async (key: string) =>
          typeof window === "undefined"
            ? null
            : window.localStorage.getItem(key),
        setItem: async (key: string, value: string) => {
          if (typeof window !== "undefined") {
            window.localStorage.setItem(key, value);
          }
        },
        removeItem: async (key: string) => {
          if (typeof window !== "undefined") {
            window.localStorage.removeItem(key);
          }
        },
      }
    : {
        getItem: (key: string) => SecureStore.getItemAsync(key),
        setItem: (key: string, value: string) =>
          SecureStore.setItemAsync(key, value),
        removeItem: (key: string) => SecureStore.deleteItemAsync(key),
      };

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

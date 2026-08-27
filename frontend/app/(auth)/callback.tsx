/**
 * Legacy catch — the canonical OAuth callback is now at /auth/callback
 * (app/auth/callback.tsx). This file handles the /callback path in case
 * any old Supabase redirect URL still points here.
 *
 * Delegates to lib/authCallback's completeAuthFromUrl (same as the
 * canonical route) rather than calling exchangeCodeForSession directly —
 * a PKCE code is single-use, and hand-rolling the exchange here used to
 * mean a code delivered to this legacy path could race the canonical
 * route or LoginScreen's own Linking listener over the same code.
 */
import { useEffect } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import { completeAuthFromUrl } from "../../lib/authCallback";
import { ScreenLoader } from "../../components/ui/Spinner";

export default function AuthCallbackLegacy() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    code?: string;
    error?: string;
    error_description?: string;
  }>();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (params.error) {
        if (!cancelled) router.replace("/(auth)");
        return;
      }
      if (params.code) {
        const result = await completeAuthFromUrl(`?code=${params.code}`);
        if (cancelled) return;
        if (result.status === "error") {
          router.replace("/(auth)");
          return;
        }
      }
      if (!cancelled) router.replace("/(app)");
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <ScreenLoader />;
}

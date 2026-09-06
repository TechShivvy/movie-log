# Mobile Google sign-in — why it redirects to `localhost:3000`, and how to fix it

## The symptom

On Android/Expo Go, after picking a Google account the browser lands on
`http://localhost:3000/#access_token=…` instead of returning to the app.

## The cause

Supabase validates the `redirect_to` you pass against the **Redirect URLs**
allowlist. If nothing in that list matches, it does **not** error — it silently
falls back to the project's **Site URL**. If Site URL is `http://localhost:3000`
(the default for a lot of setups), that is exactly where you land.

So this is an allowlist-matching problem, not a bug in the sign-in code.

## Why the obvious wildcard doesn't work

Expo Go's redirect URI contains your dev machine's LAN IP and changes network
to network:

```
exp://192.168.1.42:8081/--/auth/callback
```

Per the [Supabase redirect-URL docs](https://supabase.com/docs/guides/auth/redirect-urls),
the separator characters are **both `.` and `/`**, and:

| Pattern | Matches |
| --- | --- |
| `*` | any run of **non-separator** characters — stops at `.` and `/` |
| `**` | any run of characters, **crossing** separators |

That means every "reasonable-looking" pattern fails, because the host
`192.168.1.42:8081` contains dots and the path `/--/auth/callback` has several
segments:

| Pattern | Result |
| --- | --- |
| `exp://*/--/auth/callback` | ❌ `*` stops at the first `.` in the IP |
| `exp://*/*/--/auth/callback` | ❌ same, plus wrong segment count |
| `exp://192.168.1.42:8081/*` | ❌ `*` cannot cross `/` into `--/auth/callback` |
| **`exp://**`** | ✅ the only pattern that reliably matches |

---

## Observed: `exp://**` did not match (2026-08)

With Site URL `http://localhost:8081` and `exp://**` present in the Redirect
URLs, a real device generating

```
exp://192.168.0.205:8081/--/auth/callback
```

was still bounced to the Site URL. So do **not** rely on a wildcard for the
`exp://` scheme. Use the exact URL (below) for Expo Go, and move to a
development build for anything longer-lived.

Also remove `exp://*/*/--/auth/callback` if present — it cannot match anything
(`*` stops at the dots in the IP) and only adds a broken pattern to the list.

## Fix A — unblock Expo Go testing right now

**Supabase Dashboard → Authentication → URL Configuration**

1. **Site URL** — change from `http://localhost:3000` to `http://localhost:8081`
   (dev) or your production domain. This is the fallback, so it must never be a
   port nothing is listening on.
2. **Redirect URLs** — add all of:
   ```
   http://localhost:8081/auth/callback     ← web dev
   https://<your-domain>/auth/callback     ← web prod
   cinelog://auth/callback                 ← dev build / standalone
   exp://192.168.0.205:8081/--/auth/callback   ← Expo Go, EXACT current LAN IP
   ```

The last one must be the exact URL the device prints, because the `exp://`
wildcard was observed not to match (see above). Read it from the Expo log:

```
[CineLog OAuth] redirect_to = exp://192.168.0.205:8081/--/auth/callback
```

This entry breaks whenever your LAN IP changes (new network, DHCP lease, phone
hotspot), at which point you re-read the log line and update it. That churn is
the reason to move to Fix B rather than live on this.

To confirm what your device is actually sending, tap **Continue with Google** and
read the Expo log line:

```
[CineLog OAuth] redirect_to = exp://192.168.1.42:8081/--/auth/callback
```

## Fix B — the real fix: native Google sign-in (no redirect at all)

Supabase's official recommendation for React Native is **not** the browser
redirect flow. Use native Google sign-in and hand the resulting ID token
straight to Supabase:

```ts
import { GoogleSignin } from "@react-native-google-signin/google-signin";

const response = await GoogleSignin.signIn();
const { data, error } = await supabase.auth.signInWithIdToken({
  provider: "google",
  token: response.data.idToken,
});
```

On Android this uses the OS **Credential Manager** — no browser, no deep link,
**no redirect URL**, so the dynamic Expo Go IP stops mattering permanently.

**Cost:** `@react-native-google-signin/google-signin` is a native module, so it
does not run in Expo Go. You need a development build:

```bash
npx expo install @react-native-google-signin/google-signin
# add the config plugin to app.json, then:
npx expo run:android          # local dev build
# or: eas build --profile development --platform android
```

You will also need, in Google Cloud Console → Credentials:

- a **Web** OAuth client ID — the one configured in Supabase's Google provider
- an **Android** OAuth client ID — with your dev build's SHA-1 fingerprint

## Recommendation

Do **Fix A** now so you can keep testing today. Move to **Fix B** before release
— a dev build is required for store distribution anyway, and it removes this
entire class of redirect problem rather than working around it.
